from __future__ import annotations

import hashlib
import json
import os
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from html import escape
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request as UrlRequest, urlopen

import jwt
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pwdlib import PasswordHash
from pydantic import BaseModel, Field
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, PyMongoError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope


# ---------------------------------------------------------------------------
# ENVIRONMENT AND CONFIGURATION
# ---------------------------------------------------------------------------

BACKEND_DIR = Path(__file__).resolve().parent
ENV_FILE = BACKEND_DIR / ".env"
load_dotenv(dotenv_path=ENV_FILE, override=True)

MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
DATABASE_NAME = os.getenv("DATABASE_NAME", "moody").strip()

JWT_SECRET = os.getenv("JWT_SECRET", "").strip()
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
AUTH_COOKIE_NAME = "toka_access_token"

FRONTEND_URL = os.getenv(
    "TOKA_FRONTEND_URL", "http://localhost:5173"
).strip().rstrip("/")

BACKEND_URL = os.getenv(
    "TOKA_BACKEND_URL", "http://localhost:8000"
).strip().rstrip("/")

EMAIL_VERIFICATION_HOURS = 24
PASSWORD_RESET_MINUTES = 60

FRONTEND_DIST_DIR = (
    BACKEND_DIR.parent / "my-react" / "dist"
)

password_hasher = PasswordHash.recommended()

mongo_client: MongoClient | None = None
mongo_db = None


# ---------------------------------------------------------------------------
# DATABASE / AUTHENTICATION HELPERS
# ---------------------------------------------------------------------------

def require_database():
    if mongo_db is None:
        raise HTTPException(
            status_code=503,
            detail="The database is not currently available. Please try again later.",
        )

    return mongo_db


def normalized_email(value: str) -> str:
    email = value.strip().lower()

    if email.count("@") != 1 or "." not in email.rsplit("@", 1)[-1]:
        raise HTTPException(
            status_code=422,
            detail="Enter a valid email address.",
        )

    return email


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_one_time_token() -> tuple[str, str]:
    raw_token = secrets.token_urlsafe(32)

    return raw_token, hash_token(raw_token)


def create_access_token(user_id: str) -> str:
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET is missing from backend/.env")

    expires = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    return jwt.encode(
        {"sub": user_id, "exp": expires},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=os.getenv("TOKA_COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


def get_authenticated_user(request: Request) -> dict:

    if not JWT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured on the server.",
        )

    token = request.cookies.get(AUTH_COOKIE_NAME)

    if not token:
        raise HTTPException(
            status_code=401,
            detail="Please sign in to access your account.",
        )

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

        user_id = payload.get("sub")

        if not user_id or not ObjectId.is_valid(user_id):
            raise HTTPException(
                status_code=401,
                detail="Invalid login session.",
            )

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Your login session has expired. Please sign in again.",
        )

    db = require_database()

    user = db.users.find_one({"_id": ObjectId(user_id)})

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Your account could not be found. Please sign in again.",
        )

    if not user.get("is_verified", False):
        raise HTTPException(
            status_code=403,
            detail="Please verify your email address before using your account.",
        )

    return user


def public_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "full_name": user.get("full_name", ""),
        "phone": user.get("phone", ""),
        "date_of_birth": user.get("date_of_birth", ""),
        "address": user.get("address", ""),
        "city": user.get("city", ""),
        "postcode": user.get("postcode", ""),
        "membership_interest": user.get("membership_interest", ""),
        "is_verified": bool(user.get("is_verified", False)),
    }


# ---------------------------------------------------------------------------
# REQUEST MODELS
# ---------------------------------------------------------------------------

class EmailAddress(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=100)
    phone: str = Field(default="", max_length=30)
    date_of_birth: str = Field(min_length=10, max_length=10)
    address: str = Field(default="", max_length=200)
    city: str = Field(default="", max_length=100)
    postcode: str = Field(default="", max_length=20)
    membership_interest: str = Field(default="", max_length=100)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=1, max_length=500)
    password: str = Field(min_length=8, max_length=128)


class UpdatePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# ---------------------------------------------------------------------------
# EMAIL (BREVO)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# EMAIL CONFIGURATION (BREVO)
# ---------------------------------------------------------------------------

def email_configuration() -> tuple[str, str, str]:

    api_key = os.getenv("TOKA_BREVO_API_KEY", "").strip()
    sender_email = os.getenv("TOKA_EMAIL_FROM", "").strip()

    if not api_key or not sender_email:
        raise HTTPException(
            status_code=503,
            detail=(
                "ToKa Fitness email is not configured. Set "
                "TOKA_BREVO_API_KEY and TOKA_EMAIL_FROM in backend/.env."
            ),
        )

    sender_name = os.getenv(
        "TOKA_EMAIL_SENDER_NAME", "ToKa Fitness"
    ).strip()

    return api_key, sender_email, sender_name


def send_email(
    recipient: str,
    subject: str,
    text_body: str,
    html_body: str,
) -> None:

    api_key, sender_email, sender_name = email_configuration()

    payload = json.dumps(
        {
            "sender": {
                "name": sender_name,
                "email": sender_email,
            },
            "to": [
                {"email": recipient}
            ],
            "subject": subject,
            "textContent": text_body,
            "htmlContent": html_body,
        }
    ).encode("utf-8")

    request = UrlRequest(
        "https://api.brevo.com/v3/smtp/email",
        data=payload,
        headers={
            "api-key": api_key,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:

        with urlopen(request, timeout=20) as response:

            if response.status not in (200, 201, 202):

                raise HTTPException(
                    status_code=502,
                    detail=(
                        "Brevo did not accept the email. "
                        "Check your API key and verified sender."
                    ),
                )

    except HTTPError as error:

        raise HTTPException(
            status_code=502,
            detail=(
                f"Brevo rejected the email request (HTTP {error.code}). "
                "Check your API key and verified sender."
            ),
        ) from error

    except (URLError, TimeoutError, OSError) as error:

        raise HTTPException(
            status_code=502,
            detail=(
                "ToKa Fitness could not reach Brevo. "
                "Check your internet connection and try again."
            ),
        ) from error


# ---------------------------------------------------------------------------
# EMAIL VERIFICATION EMAIL
# ---------------------------------------------------------------------------

def send_verification_email(
    email: str,
    full_name: str,
    token: str,
) -> None:

    verification_url = (
        f"{BACKEND_URL}/api/auth/verify-email?token={token}"
    )

    safe_name = escape(full_name or "there")

    send_email(
        email,
        "Verify your ToKa Fitness account",

        (
            f"Hello {full_name or 'there'},\n\n"
            "Please verify your ToKa Fitness email address "
            "by opening this link:\n\n"
            f"{verification_url}\n\n"
            f"This link expires in {EMAIL_VERIFICATION_HOURS} hours.\n\n"
            "If you did not create this account, you can ignore this email."
        ),

        (
            '<div style="font-family:Arial,sans-serif;'
            'background:#f5f3ef;padding:32px;color:#202020">'

            '<div style="max-width:560px;margin:auto;'
            'background:#fff;padding:32px">'

            '<h2>ToKa Fitness</h2>'

            f"<p>Hello {safe_name},</p>"

            "<h1>Verify your email address</h1>"

            "<p>Thanks for creating a ToKa Fitness account. "
            "Confirm your email address using the button below.</p>"

            f'<p><a href="{verification_url}" '
            'style="display:inline-block;padding:14px 22px;'
            'background:#202020;color:#fff;'
            'text-decoration:none;border-radius:6px">'

            "Verify my email"

            "</a></p>"

            f"<p>This link expires in {EMAIL_VERIFICATION_HOURS} hours.</p>"

            "<p>If you did not create this account, "
            "you can ignore this email.</p>"

            "</div></div>"
        ),
    )


# ---------------------------------------------------------------------------
# PASSWORD RESET EMAIL
# ---------------------------------------------------------------------------

def send_password_reset_email(
    email: str,
    full_name: str,
    token: str,
) -> None:

    reset_url = (
        f"{FRONTEND_URL}/reset-password?token={token}"
    )

    safe_name = escape(full_name or "there")

    send_email(
        email,
        "Reset your ToKa Fitness password",

        (
            f"Hello {full_name or 'there'},\n\n"
            "A password reset was requested for your ToKa Fitness account.\n\n"
            f"Open this link to choose a new password:\n{reset_url}\n\n"
            f"This link expires in {PASSWORD_RESET_MINUTES} minutes.\n\n"
            "If you did not request this, ignore this email."
        ),

        (
            '<div style="font-family:Arial,sans-serif;'
            'background:#f5f3ef;padding:32px;color:#202020">'

            '<div style="max-width:560px;margin:auto;'
            'background:#fff;padding:32px">'

            "<h2>ToKa Fitness</h2>"

            f"<p>Hello {safe_name},</p>"

            "<h1>Reset your password</h1>"

            "<p>We received a request to reset your "
            "ToKa Fitness password.</p>"

            f'<p><a href="{reset_url}" '
            'style="display:inline-block;padding:14px 22px;'
            'background:#202020;color:#fff;'
            'text-decoration:none;border-radius:6px">'

            "Reset my password"

            "</a></p>"

            f"<p>This link expires in {PASSWORD_RESET_MINUTES} minutes.</p>"

            "<p>If you did not request this, "
            "you can ignore this email.</p>"

            "</div></div>"
        ),
    )


# ---------------------------------------------------------------------------
# SUPABASE CONFIGURATION
# ---------------------------------------------------------------------------

def supabase_configuration(
    variable_name: str,
) -> tuple[str, str] | None:

    supabase_url = os.getenv(
        "TOKA_SUPABASE_URL", ""
    ).strip().rstrip("/")

    api_key = os.getenv(variable_name, "").strip()

    try:
        parsed_url = urlsplit(supabase_url)

    except ValueError:
        return None

    if (
        not api_key
        or not parsed_url.netloc
        or parsed_url.username
        or parsed_url.password
        or parsed_url.path
        or parsed_url.query
        or parsed_url.fragment
        or (
            parsed_url.scheme != "https"
            and not (
                parsed_url.scheme == "http"
                and parsed_url.hostname in {
                    "localhost",
                    "127.0.0.1",
                }
            )
        )
    ):

        return None

    return supabase_url, api_key


# ---------------------------------------------------------------------------
# ADD SUBSCRIBER TO SUPABASE MAILING LIST
# ---------------------------------------------------------------------------

def add_supabase_mailing_subscriber(email: str) -> None:

    configuration = supabase_configuration(
        "TOKA_SUPABASE_SECRET_KEY"
    )

    if configuration is None:

        raise HTTPException(
            status_code=503,
            detail=(
                "ToKa Fitness mailing list is not configured. "
                "Set TOKA_SUPABASE_URL and "
                "TOKA_SUPABASE_SECRET_KEY on the API server."
            ),
        )

    supabase_url, secret_key = configuration

    payload = json.dumps(
        {"email": email}
    ).encode("utf-8")

    request = UrlRequest(
        (
            f"{supabase_url}/rest/v1/"
            "mailing_list_subscribers?on_conflict=email"
        ),

        data=payload,

        headers={
            "apikey": secret_key,
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },

        method="POST",
    )

    try:

        with urlopen(request, timeout=20) as response:

            if response.status not in (200, 201, 204):

                raise HTTPException(
                    status_code=502,
                    detail=(
                        "Supabase did not accept the mailing-list subscription. "
                        "Check the key and table."
                    ),
                )

    except HTTPError as error:

        raise HTTPException(
            status_code=502,
            detail=(
                f"Supabase rejected the mailing-list subscription "
                f"(HTTP {error.code}). Check the key and table."
            ),
        ) from error

    except (URLError, TimeoutError, OSError) as error:

        raise HTTPException(
            status_code=502,
            detail=(
                "ToKa Fitness could not reach Supabase "
                "to save this subscription."
            ),
        ) from error


# ---------------------------------------------------------------------------
# MAILING LIST WELCOME EMAIL
# ---------------------------------------------------------------------------

def mailing_list_welcome_email(recipient: str) -> None:

    send_email(
        recipient,

        "Welcome to the ToKa Fitness mailing list",

        (
            "Thanks for joining the ToKa Fitness mailing list.\n\n"
            "You will receive updates about training, wellbeing, "
            "and club news. You can unsubscribe using the link "
            "in any future newsletter."
        ),

        (
            '<div style="padding:32px;background:#f5f3ef;'
            'font-family:Arial,sans-serif;color:#202020">'

            '<div style="max-width:560px;margin:auto;'
            'padding:32px;background:#fff">'

            '<p style="font-weight:bold">ToKa Fitness</p>'

            "<h1>Welcome to our mailing list</h1>"

            "<p>Thanks for joining ToKa Fitness. "
            "You will receive updates about training, "
            "wellbeing, and club news.</p>"

            "<p>You can unsubscribe using the link "
            "in any future newsletter.</p>"

            "</div></div>"
        ),
    )


# ---------------------------------------------------------------------------
# END OF PART 2
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# FASTAPI STARTUP AND MONGODB CONNECTION
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_: FastAPI):

    global mongo_client, mongo_db

    if not MONGODB_URI:
        raise RuntimeError(
            "MONGODB_URI is missing from backend/.env"
        )

    if not JWT_SECRET:
        raise RuntimeError(
            "JWT_SECRET is missing from backend/.env"
        )

    try:

        mongo_client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=10000,
        )

        # Test MongoDB connection.
        mongo_client.admin.command("ping")

        # Select database.
        mongo_db = mongo_client[DATABASE_NAME]

        # Create unique email index.
        mongo_db.users.create_index(
            "email",
            unique=True,
        )

        # Create indexes for verification and reset tokens.
        mongo_db.users.create_index(
            "email_verification_token_hash",
            sparse=True,
        )

        mongo_db.users.create_index(
            "password_reset_token_hash",
            sparse=True,
        )

        print("Successfully connected to MongoDB!")

        yield

    except PyMongoError as error:

        raise RuntimeError(
            "Could not connect to MongoDB. Check your Atlas connection settings and network access."
        ) from error

    finally:

        if mongo_client is not None:
            mongo_client.close()

        mongo_client = None
        mongo_db = None


# ---------------------------------------------------------------------------
# CREATE FASTAPI APPLICATION
# ---------------------------------------------------------------------------

app = FastAPI(
    title="ToKa Fitness API",
    version="2.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# USER REGISTRATION
# ---------------------------------------------------------------------------

@app.post("/api/auth/register", status_code=201)
def register_member(payload: RegisterRequest):

    db = require_database()

    email = normalized_email(payload.email)

    # Validate date of birth.
    try:

        birth_date = datetime.strptime(
            payload.date_of_birth,
            "%Y-%m-%d",
        ).date()

    except ValueError:

        raise HTTPException(
            status_code=422,
            detail="Enter a valid date of birth.",
        )

    # Calculate user's age.
    today = datetime.now(timezone.utc).date()

    age = today.year - birth_date.year

    if (today.month, today.day) < (
        birth_date.month,
        birth_date.day,
    ):
        age -= 1

    # Minimum registration age.
    if birth_date > today or age < 14:

        raise HTTPException(
            status_code=422,
            detail="You must be at least 14 years old to register.",
        )

    # Generate secure verification token.
    raw_token, token_hash = create_one_time_token()

    now = datetime.now(timezone.utc)

    # Create new user record.
    user = {

        "email": email,

        "password_hash": password_hasher.hash(
            payload.password
        ),

        "full_name": payload.full_name.strip(),

        "phone": payload.phone.strip(),

        "date_of_birth": payload.date_of_birth,

        "address": payload.address.strip(),

        "city": payload.city.strip(),

        "postcode": payload.postcode.strip(),

        "membership_interest": payload.membership_interest.strip(),

        "is_verified": False,

        "email_verification_token_hash": token_hash,

        "email_verification_expires_at": (
            now + timedelta(hours=EMAIL_VERIFICATION_HOURS)
        ),

        "created_at": now,
    }

    # Save account in MongoDB.
    try:

        result = db.users.insert_one(user)

    except DuplicateKeyError:

        raise HTTPException(
            status_code=409,
            detail="An account with this email address already exists.",
        )

    # Send verification email.
    try:

        send_verification_email(
            email,
            user["full_name"],
            raw_token,
        )

    except HTTPException as error:

        # Account stays saved so the user can request
        # another verification email.
        raise HTTPException(
            status_code=502,
            detail=(
                "Your account was created, but the verification email "
                "could not be sent. Check your email settings, then "
                "use the resend verification option."
            ),
        ) from error

    return {

        "message": (
            "Your account has been created. "
            "Check your email to verify it before signing in."
        ),

        "user_id": str(result.inserted_id),

        "email": email,

        "is_verified": False,
    }


# ---------------------------------------------------------------------------
# VERIFY EMAIL ADDRESS
# ---------------------------------------------------------------------------

@app.get("/api/auth/verify-email")
def verify_email(token: str):

    db = require_database()

    # Hash supplied token.
    token_hash = hash_token(token)

    now = datetime.now(timezone.utc)

    # Find account with matching, unexpired token.
    user = db.users.find_one(
        {

            "email_verification_token_hash": token_hash,

            "email_verification_expires_at": {
                "$gt": now
            },

            "is_verified": False,
        }
    )

    if not user:

        raise HTTPException(
            status_code=400,
            detail=(
                "This verification link is invalid, expired, "
                "or has already been used. Request a new verification email."
            ),
        )

    # Verify account and remove verification token.
    db.users.update_one(
        {
            "_id": user["_id"]
        },

        {
            "$set": {

                "is_verified": True,

                "email_verified_at": now,
            },

            "$unset": {

                "email_verification_token_hash": "",

                "email_verification_expires_at": "",
            },
        },
    )

    return {

        "message": (
            "Your email address has been verified. "
            "You can now sign in to ToKa Fitness."
        ),

        "is_verified": True,
    }


# ---------------------------------------------------------------------------
# RESEND EMAIL VERIFICATION
# ---------------------------------------------------------------------------

@app.post("/api/auth/resend")
def resend_verification_email(payload: EmailAddress):

    db = require_database()

    email = normalized_email(payload.email)

    user = db.users.find_one(
        {
            "email": email
        }
    )

    # Generic response prevents exposing whether an email
    # address has an account.
    generic_response = {

        "message": (
            "If your account exists and still needs verification, "
            "a new verification email will be sent."
        )
    }

    # No need to resend if account does not exist
    # or is already verified.
    if not user or user.get("is_verified", False):

        return generic_response

    # Generate a new verification token.
    raw_token, token_hash = create_one_time_token()

    now = datetime.now(timezone.utc)

    # Replace previous verification token.
    db.users.update_one(
        {
            "_id": user["_id"]
        },

        {
            "$set": {

                "email_verification_token_hash": token_hash,

                "email_verification_expires_at": (
                    now + timedelta(hours=EMAIL_VERIFICATION_HOURS)
                ),
            }
        },
    )

    # Send new verification email.
    send_verification_email(
        email,
        user.get("full_name", ""),
        raw_token,
    )

    return generic_response


# ---------------------------------------------------------------------------
# END OF PART 3
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# USER LOGIN
# ---------------------------------------------------------------------------

@app.post("/api/auth/login")
def login_member(
    payload: LoginRequest,
    response: Response,
):

    db = require_database()

    email = normalized_email(payload.email)

    # Find user by email.
    user = db.users.find_one(
        {
            "email": email
        }
    )

    # Check account exists.
    if not user:

        raise HTTPException(
            status_code=401,
            detail="Incorrect email address or password.",
        )

    # Check password.
    try:

        password_is_valid = password_hasher.verify(
            payload.password,
            user["password_hash"],
        )

    except Exception:

        password_is_valid = False

    if not password_is_valid:

        raise HTTPException(
            status_code=401,
            detail="Incorrect email address or password.",
        )

    # Require email verification before login.
    if not user.get("is_verified", False):

        raise HTTPException(
            status_code=403,
            detail=(
                "Please verify your email address before signing in. "
                "You can request another verification email."
            ),
        )

    # Create JWT authentication token.
    access_token = create_access_token(
        str(user["_id"])
    )

    # Store token in secure HTTP-only cookie.
    set_auth_cookie(
        response,
        access_token,
    )

    return {

        "message": "You have successfully signed in.",

        "user": public_user(user),
    }


# ---------------------------------------------------------------------------
# USER LOGOUT
# ---------------------------------------------------------------------------

@app.post("/api/auth/logout")
def logout_member(response: Response):

    # Remove authentication cookie.
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        httponly=True,
        secure=os.getenv(
            "TOKA_COOKIE_SECURE",
            "false",
        ).lower() == "true",
        samesite="lax",
    )

    return {

        "message": "You have successfully signed out."
    }


# ---------------------------------------------------------------------------
# GET CURRENTLY LOGGED-IN USER
# ---------------------------------------------------------------------------

@app.get("/api/auth/me")
def get_current_user(request: Request):

    # This checks the JWT cookie and verifies the account.
    user = get_authenticated_user(request)

    return {

        "message": "Authenticated successfully.",

        "user": public_user(user),
    }


# ---------------------------------------------------------------------------
# END OF PART 4
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# FORGOT PASSWORD
# ---------------------------------------------------------------------------

@app.post("/api/auth/forgot-password")
def forgot_password(payload: ForgotPasswordRequest):

    db = require_database()

    email = normalized_email(payload.email)

    # Always return the same message to protect user privacy.
    generic_response = {
        "message": (
            "If an account exists with that email address, "
            "a password reset link will be sent."
        )
    }

    user = db.users.find_one(
        {
            "email": email
        }
    )

    if not user:
        return generic_response

    if not user.get("is_verified", False):
        return generic_response

    # Generate a secure one-time reset token.
    raw_token, token_hash = create_one_time_token()

    now = datetime.now(timezone.utc)

    # Store the hashed token, not the original token.
    db.users.update_one(
        {
            "_id": user["_id"]
        },

        {
            "$set": {
                "password_reset_token_hash": token_hash,

                "password_reset_expires_at": (
                    now + timedelta(minutes=PASSWORD_RESET_MINUTES)
                ),
            }
        },
    )

    # Send reset email.
    send_password_reset_email(
        email,
        user.get("full_name", ""),
        raw_token,
    )

    return generic_response


# ---------------------------------------------------------------------------
# RESET PASSWORD
# ---------------------------------------------------------------------------

@app.post("/api/auth/reset-password")
def reset_password(payload: ResetPasswordRequest):

    db = require_database()

    token_hash = hash_token(payload.token)

    now = datetime.now(timezone.utc)

    # Find account with valid reset token.
    user = db.users.find_one(
        {
            "password_reset_token_hash": token_hash,

            "password_reset_expires_at": {
                "$gt": now
            },
        }
    )

    if not user:

        raise HTTPException(
            status_code=400,
            detail=(
                "This password reset link is invalid, expired, "
                "or has already been used. Request another link."
            ),
        )

    # Hash the new password.
    new_password_hash = password_hasher.hash(
        payload.password
    )

    # Update password and remove the reset token.
    db.users.update_one(
        {
            "_id": user["_id"]
        },

        {
            "$set": {

                "password_hash": new_password_hash,

                "password_updated_at": now,
            },

            "$unset": {

                "password_reset_token_hash": "",

                "password_reset_expires_at": "",
            },
        },
    )

    return {

        "message": (
            "Your password has been successfully updated. "
            "You can now sign in using your new password."
        )
    }


# ---------------------------------------------------------------------------
# UPDATE PASSWORD WHILE LOGGED IN
# ---------------------------------------------------------------------------

@app.post("/api/auth/update-password")
def update_password(
    payload: UpdatePasswordRequest,
    request: Request,
):

    db = require_database()

    # Require a valid login session.
    user = get_authenticated_user(request)

    # Check the existing password.
    try:

        current_password_is_valid = password_hasher.verify(
            payload.current_password,
            user["password_hash"],
        )

    except Exception:

        current_password_is_valid = False

    if not current_password_is_valid:

        raise HTTPException(
            status_code=400,
            detail="Your current password is incorrect.",
        )

    # Prevent reusing the same password.
    if payload.current_password == payload.new_password:

        raise HTTPException(
            status_code=400,
            detail="Your new password must be different.",
        )

    # Hash and save the new password.
    new_password_hash = password_hasher.hash(
        payload.new_password
    )

    db.users.update_one(
        {
            "_id": user["_id"]
        },

        {
            "$set": {

                "password_hash": new_password_hash,

                "password_updated_at": datetime.now(timezone.utc),
            }
        },
    )

    return {

        "message": "Your password has been successfully updated."
    }


# ---------------------------------------------------------------------------
# CORS CONFIGURATION
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        FRONTEND_URL,
    ],

    allow_credentials=True,

    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],

    allow_headers=[
        "Content-Type",
        "Authorization",
    ],
)


# ---------------------------------------------------------------------------
# HEALTH CHECK
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health_check():

    database_status = "disconnected"

    if mongo_db is not None:

        try:

            mongo_db.command("ping")

            database_status = "connected"

        except PyMongoError:

            database_status = "disconnected"

    email_status = (
        "configured"
        if (
            os.getenv("TOKA_BREVO_API_KEY", "").strip()
            and os.getenv("TOKA_EMAIL_FROM", "").strip()
        )
        else "not configured"
    )

    supabase_status = (
        "configured"
        if supabase_configuration(
            "TOKA_SUPABASE_SECRET_KEY"
        )
        else "not configured"
    )

    return {

        "status": (
            "healthy"
            if database_status == "connected"
            else "degraded"
        ),

        "database": database_status,

        "email": email_status,

        "mailing_list": supabase_status,

        "authentication": (
            "configured"
            if JWT_SECRET
            else "not configured"
        ),
    }


# ---------------------------------------------------------------------------
# PUBLIC FRONTEND CONFIGURATION
# ---------------------------------------------------------------------------

@app.get("/api/config")
def public_configuration():

    return {

        "api_url": BACKEND_URL,

        "frontend_url": FRONTEND_URL,

        "email_verification_required": True,
    }


# ---------------------------------------------------------------------------
# MAILING LIST SUBSCRIPTION
# ---------------------------------------------------------------------------

@app.post("/api/mailing-list/subscribe")
def subscribe_to_mailing_list(payload: EmailAddress):

    email = normalized_email(payload.email)

    # Save subscriber in Supabase.
    add_supabase_mailing_subscriber(email)

    # Send welcome email.
    mailing_list_welcome_email(email)

    return {

        "message": (
            "Thank you for subscribing to the ToKa Fitness mailing list."
        ),

        "email": email,
    }


# ---------------------------------------------------------------------------
# OPTIONAL REACT FRONTEND HOSTING
# ---------------------------------------------------------------------------

if (
    os.getenv("TOKA_SERVE_FRONTEND", "false").lower() == "true"
    and FRONTEND_DIST_DIR.exists()
):

    app.mount(
        "/",
        StaticFiles(
            directory=str(FRONTEND_DIST_DIR),
            html=True,
        ),
        name="frontend",
    )
