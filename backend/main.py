from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from html import escape
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request as UrlRequest, urlopen

import jwt
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
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

    if (
        len(email) > 254
        or re.fullmatch(
            r"[a-z0-9!#$%&'*+/=?^_`{|}~-]+"
            r"(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@"
            r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
            r"(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+",
            email,
        )
        is None
    ):
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
        "membership_tier": user.get("membership_tier", "free"),
        "membership_status": user.get("membership_status", "free"),
    }


def valid_object_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=422, detail="Invalid member identifier.")

    return ObjectId(value)


def member_public_profile(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "full_name": user.get("full_name", ""),
        "membership_interest": user.get("membership_interest", ""),
    }


def stripe_api_key() -> str:
    api_key = os.getenv("TOKA_STRIPE_SECRET_KEY", "").strip()
    if not re.fullmatch(r"sk_(?:test|live)_[A-Za-z0-9]{16,}", api_key):
        raise HTTPException(
            status_code=503,
            detail=(
                "Secure payments are not configured. Set "
                "TOKA_STRIPE_SECRET_KEY on the API server."
            ),
        )

    return api_key


def stripe_price_id(plan: str) -> str:
    price_variable = {
        "premium": "TOKA_STRIPE_PRICE_PREMIUM",
        "pro": "TOKA_STRIPE_PRICE_PRO",
        "ultimate": "TOKA_STRIPE_PRICE_ULTIMATE",
    }.get(plan)
    if price_variable is None:
        raise HTTPException(status_code=422, detail="Choose a valid membership plan.")

    price_id = os.getenv(price_variable, "").strip()
    if not re.fullmatch(r"price_[A-Za-z0-9]+", price_id):
        raise HTTPException(
            status_code=503,
            detail=(
                f"The {plan.title()} plan is not configured for checkout. "
                f"Set {price_variable} to its Stripe Price ID."
            ),
        )

    return price_id


def stripe_request(
    endpoint: str,
    api_key: str,
    data: dict,
    method: str = "POST",
) -> dict:
    encoded_data = urlencode(data).encode("utf-8") if method == "POST" else None
    url = f"https://api.stripe.com/v1/{endpoint}"
    if method == "GET" and data:
        url = f"{url}?{urlencode(data)}"

    request = UrlRequest(
        url,
        data=encoded_data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method=method,
    )

    try:
        with urlopen(request, timeout=20) as response:
            result = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Stripe rejected the payment request (HTTP {error.code}).",
        ) from error
    except (URLError, TimeoutError, OSError) as error:
        raise HTTPException(
            status_code=502,
            detail="ToKa Fitness could not reach Stripe. Please try again.",
        ) from error
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=502,
            detail="Stripe returned an invalid response. Please try again.",
        ) from error

    if not isinstance(result, dict):
        raise HTTPException(status_code=502, detail="Stripe returned an invalid response.")

    return result


def validate_membership_price(api_key: str, price_id: str, expected_amount: int) -> None:
    price = stripe_request(
        f"prices/{quote(price_id, safe='')}",
        api_key,
        {},
        method="GET",
    )
    recurring = price.get("recurring")
    if not (
        price.get("active") is True
        and price.get("currency") == "gbp"
        and price.get("unit_amount") == expected_amount * 100
        and isinstance(recurring, dict)
        and recurring.get("interval") == "month"
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                f"The configured Stripe Price must be active, £{expected_amount}.00 GBP, "
                "and billed monthly."
            ),
        )


def stripe_payment_configuration_ready() -> bool:
    api_key = os.getenv("TOKA_STRIPE_SECRET_KEY", "").strip()
    webhook_secret = os.getenv("TOKA_STRIPE_WEBHOOK_SECRET", "").strip()
    return bool(
        re.fullmatch(r"sk_(?:test|live)_[A-Za-z0-9]{16,}", api_key)
        and re.fullmatch(r"whsec_[A-Za-z0-9]{16,}", webhook_secret)
    )


def membership_plan_configuration() -> list[dict]:
    plans = [
        {
            "id": "free",
            "name": "Free",
            "price_gbp": 0,
            "interval": None,
            "benefits": [
                "Fitness and healthy-living articles",
                "Introductory exercise videos and general guidance",
                "BMI calculator and display accessibility tools",
                "Member community and private messaging",
            ],
            "checkout_enabled": False,
        },
        {
            "id": "premium",
            "name": "Premium",
            "price_gbp": 18,
            "interval": "month",
            "benefits": [
                "Everything in Free",
                "Create and save private custom training routines",
                "Log exercises, sets, reps, weights, and workout history",
            ],
            "checkout_enabled": False,
        },
        {
            "id": "pro",
            "name": "Pro",
            "price_gbp": 30,
            "interval": "month",
            "benefits": [
                "Everything in Premium",
                "Small-group coaching sessions",
                "Monthly coach check-in and progress review",
            ],
            "checkout_enabled": False,
        },
        {
            "id": "ultimate",
            "name": "Ultimate",
            "price_gbp": 40,
            "interval": "month",
            "benefits": [
                "Everything in Pro",
                "One personal training session each month",
                "Monthly training and nutrition-guidance review",
                "Priority support from the ToKa Fitness team",
            ],
            "checkout_enabled": False,
        },
    ]
    return [
        {
            **plan,
            "checkout_enabled": (
                stripe_payment_configuration_ready()
                and plan["id"] != "free"
                and re.fullmatch(r"price_[A-Za-z0-9]+", os.getenv(
                    {
                        "premium": "TOKA_STRIPE_PRICE_PREMIUM",
                        "pro": "TOKA_STRIPE_PRICE_PRO",
                        "ultimate": "TOKA_STRIPE_PRICE_ULTIMATE",
                    }[plan["id"]],
                    "",
                ).strip()) is not None
            ),
        }
        if plan["id"] != "free"
        else plan
        for plan in plans
    ]


def plan_for_stripe_price(price_id: str, fallback: str = "premium") -> str:
    for plan_id, environment_name in (
        ("premium", "TOKA_STRIPE_PRICE_PREMIUM"),
        ("pro", "TOKA_STRIPE_PRICE_PRO"),
        ("ultimate", "TOKA_STRIPE_PRICE_ULTIMATE"),
    ):
        if price_id and price_id == os.getenv(environment_name, "").strip():
            return plan_id

    if price_id:
        return "free"

    return fallback if fallback in {"premium", "pro", "ultimate"} else "premium"


def verify_stripe_signature(payload: bytes, signature: str, secret: str) -> bool:
    timestamp = None
    signatures = []
    for item in signature.split(","):
        key, separator, value = item.strip().partition("=")
        if not separator:
            continue
        if key == "t":
            timestamp = value
        elif key == "v1":
            signatures.append(value)

    if not timestamp or not signatures:
        return False

    try:
        issued_at = int(timestamp)
    except ValueError:
        return False

    if abs(time.time() - issued_at) > 300:
        return False

    signed_payload = f"{timestamp}.".encode("ascii") + payload
    expected = hmac.new(
        secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()

    return any(hmac.compare_digest(expected, candidate) for candidate in signatures)


# ---------------------------------------------------------------------------
# REQUEST MODELS
# ---------------------------------------------------------------------------

class EmailAddress(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class MailingListSubscriptionRequest(EmailAddress):
    consent: bool


class MailingListUnsubscribeRequest(BaseModel):
    token: str = Field(min_length=1, max_length=2000)


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


class CheckoutRequest(BaseModel):
    plan: str = Field(pattern=r"^(premium|pro|ultimate)$")


class ChatMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    client_message_id: str | None = Field(default=None, max_length=80)


class MemberReportRequest(BaseModel):
    reason: str = Field(pattern=r"^(spam|harassment|other)$")


class RoutineRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    goal: str = Field(pattern=r"^(strength|fitness|mobility|endurance)$")
    exercises: list[str] = Field(min_length=1, max_length=30)
    consent: bool


class WorkoutExercise(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    sets: int = Field(ge=1, le=20)
    reps: int = Field(ge=1, le=1000)
    weight_kg: float = Field(ge=0, le=1000, allow_inf_nan=False)


class WorkoutLogRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    workout_date: date
    duration_minutes: int = Field(ge=1, le=300)
    exercises: list[WorkoutExercise] = Field(min_length=1, max_length=30)
    consent: bool


premium_router = APIRouter()


def require_premium_member(request: Request) -> dict:
    user = get_authenticated_user(request)
    if (
        user.get("membership_tier") not in {"premium", "pro", "ultimate"}
        or user.get("membership_status") not in {"active", "trialing"}
    ):
        raise HTTPException(
            status_code=403,
            detail="An active Premium membership is required for this feature.",
        )

    return user


def stored_training_item(item: dict) -> dict:
    return {
        "id": str(item["_id"]),
        "name": item["name"],
        "created_at": item["created_at"].isoformat(),
        **{
            key: value
            for key, value in item.items()
            if key not in {"_id", "member_id", "name", "created_at"}
        },
    }


@premium_router.get("/api/premium/training")
def get_premium_training(request: Request):
    user = require_premium_member(request)
    db = require_database()
    member_id = str(user["_id"])
    routines = db.custom_routines.find(
        {"member_id": member_id}
    ).sort("created_at", -1).limit(50)
    workouts = db.workout_logs.find(
        {"member_id": member_id}
    ).sort("workout_date", -1).limit(100)

    return {
        "routines": [stored_training_item(item) for item in routines],
        "workouts": [
            {
                **stored_training_item(item),
                "workout_date": (
                    item["workout_date"].date().isoformat()
                    if isinstance(item["workout_date"], datetime)
                    else item["workout_date"].isoformat()
                    if isinstance(item["workout_date"], date)
                    else str(item["workout_date"])
                ),
            }
            for item in workouts
        ],
    }


@premium_router.post("/api/premium/routines", status_code=201)
def create_custom_routine(payload: RoutineRequest, request: Request):
    user = require_premium_member(request)
    if not payload.consent:
        raise HTTPException(
            status_code=422,
            detail="Consent is required before saving a personal workout routine.",
        )
    exercises = [name.strip() for name in payload.exercises]
    if any(not name for name in exercises):
        raise HTTPException(
            status_code=422,
            detail="Each exercise in your routine needs a name.",
        )

    created_at = datetime.now(timezone.utc)
    result = require_database().custom_routines.insert_one(
        {
            "member_id": str(user["_id"]),
            "name": payload.name.strip(),
            "goal": payload.goal,
            "exercises": exercises,
            "created_at": created_at,
            "consent_at": created_at,
        }
    )
    return {
        "routine": {
            "id": str(result.inserted_id),
            "name": payload.name.strip(),
            "goal": payload.goal,
            "exercises": exercises,
            "created_at": created_at.isoformat(),
        }
    }


@premium_router.delete("/api/premium/routines/{routine_id}")
def delete_custom_routine(routine_id: str, request: Request):
    user = require_premium_member(request)
    result = require_database().custom_routines.delete_one(
        {
            "_id": valid_object_id(routine_id),
            "member_id": str(user["_id"]),
        }
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workout routine not found.")

    return {"message": "Workout routine deleted."}


@premium_router.post("/api/premium/workouts", status_code=201)
def create_workout_log(payload: WorkoutLogRequest, request: Request):
    user = require_premium_member(request)
    if not payload.consent:
        raise HTTPException(
            status_code=422,
            detail="Consent is required before saving workout history.",
        )

    created_at = datetime.now(timezone.utc)
    exercises = [exercise.model_dump() for exercise in payload.exercises]
    result = require_database().workout_logs.insert_one(
        {
            "member_id": str(user["_id"]),
            "name": payload.name.strip(),
            "workout_date": payload.workout_date.isoformat(),
            "duration_minutes": payload.duration_minutes,
            "exercises": exercises,
            "created_at": created_at,
            "consent_at": created_at,
        }
    )
    return {
        "workout": {
            "id": str(result.inserted_id),
            "name": payload.name.strip(),
            "workout_date": payload.workout_date.isoformat(),
            "duration_minutes": payload.duration_minutes,
            "exercises": exercises,
            "created_at": created_at.isoformat(),
        }
    }


@premium_router.delete("/api/premium/workouts/{workout_id}")
def delete_workout_log(workout_id: str, request: Request):
    user = require_premium_member(request)
    result = require_database().workout_logs.delete_one(
        {
            "_id": valid_object_id(workout_id),
            "member_id": str(user["_id"]),
        }
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workout record not found.")

    return {"message": "Workout record deleted."}


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
# MAILING LIST STORAGE AND UNSUBSCRIBE
# ---------------------------------------------------------------------------

def supabase_configuration() -> tuple[str, str]:
    supabase_url = os.getenv("TOKA_SUPABASE_URL", "").strip().rstrip("/")
    secret_key = os.getenv("TOKA_SUPABASE_SECRET_KEY", "").strip()
    if not supabase_url or not secret_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "Mailing-list sign-up is not configured. Set "
                "TOKA_SUPABASE_URL and TOKA_SUPABASE_SECRET_KEY on the API server."
            ),
        )
    return supabase_url, secret_key


def add_supabase_mailing_subscriber(email: str) -> None:
    supabase_url, secret_key = supabase_configuration()
    consented_at = datetime.now(timezone.utc).isoformat()
    payload = json.dumps({
        "email": email,
        "subscribed_at": consented_at,
        "consent_at": consented_at,
        "unsubscribed_at": None,
    }).encode("utf-8")
    request = UrlRequest(
        f"{supabase_url}/rest/v1/mailing_list_subscribers?on_conflict=email",
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
                    detail="Supabase did not accept the mailing-list sign-up.",
                )
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Supabase rejected the mailing-list sign-up (HTTP {error.code}).",
        ) from error
    except (URLError, TimeoutError, OSError) as error:
        raise HTTPException(
            status_code=502,
            detail="ToKa Fitness could not reach Supabase to save your sign-up.",
        ) from error


def remove_supabase_mailing_subscriber(email: str) -> None:
    supabase_url, secret_key = supabase_configuration()
    query = urlencode({"email": f"eq.{email}"})
    request = UrlRequest(
        f"{supabase_url}/rest/v1/mailing_list_subscribers?{query}",
        data=json.dumps({
            "unsubscribed_at": datetime.now(timezone.utc).isoformat(),
        }).encode("utf-8"),
        headers={
            "apikey": secret_key,
            "Authorization": f"Bearer {secret_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="PATCH",
    )

    try:
        with urlopen(request, timeout=20) as response:
            if response.status not in (200, 204):
                raise HTTPException(
                    status_code=502,
                    detail="Supabase did not accept the unsubscribe request.",
                )
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=f"Supabase rejected the unsubscribe request (HTTP {error.code}).",
        ) from error
    except (URLError, TimeoutError, OSError) as error:
        raise HTTPException(
            status_code=502,
            detail="ToKa Fitness could not reach Supabase to unsubscribe this address.",
        ) from error


def create_mailing_list_unsubscribe_token(email: str) -> str:
    return jwt.encode(
        {
            "sub": email,
            "purpose": "mailing-list-unsubscribe",
            "exp": datetime.now(timezone.utc) + timedelta(days=365 * 5),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def mailing_list_email_from_unsubscribe_token(token: str) -> str:
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError as error:
        raise HTTPException(
            status_code=400,
            detail="This unsubscribe link is invalid or has expired.",
        ) from error

    email = claims.get("sub")
    if claims.get("purpose") != "mailing-list-unsubscribe" or not isinstance(email, str):
        raise HTTPException(
            status_code=400,
            detail="This unsubscribe link is invalid or has expired.",
        )
    return normalized_email(email)


def mailing_list_welcome_email(recipient: str, unsubscribe_url: str) -> None:
    safe_unsubscribe_url = escape(unsubscribe_url, quote=True)
    send_email(
        recipient,
        "Welcome to the ToKa Fitness mailing list",
        (
            "Thanks for joining the ToKa Fitness mailing list.\n\n"
            "You will receive updates about training, wellbeing, and club news.\n"
            f"Unsubscribe at any time: {unsubscribe_url}"
        ),
        (
            '<div style="padding:32px;background:#f5f3ef;'
            'font-family:Arial,sans-serif;color:#202020">'
            '<div style="max-width:560px;margin:auto;padding:32px;background:#fff">'
            '<p style="font-weight:bold">ToKa Fitness</p>'
            "<h1>Welcome to our mailing list</h1>"
            "<p>Thanks for joining ToKa Fitness. You will receive updates about "
            "training, wellbeing, and club news.</p>"
            f'<p><a href="{safe_unsubscribe_url}">Unsubscribe from ToKa Fitness emails</a></p>'
            "</div></div>"
        ),
    )


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

        mongo_db.messages.create_index(
            [("sender_id", 1), ("recipient_id", 1), ("created_at", -1)]
        )
        mongo_db.messages.create_index(
            [("recipient_id", 1), ("sender_id", 1), ("created_at", -1)]
        )
        mongo_db.messages.create_index(
            [("recipient_id", 1), ("read_at", 1), ("created_at", -1)]
        )
        mongo_db.member_blocks.create_index(
            [("blocker_id", 1), ("blocked_id", 1)],
            unique=True,
        )
        mongo_db.member_reports.create_index("created_at")
        mongo_db.custom_routines.create_index(
            [("member_id", 1), ("created_at", -1)]
        )
        mongo_db.workout_logs.create_index(
            [("member_id", 1), ("workout_date", -1)]
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
app.include_router(premium_router)


# ---------------------------------------------------------------------------
# MAILING LIST SUBSCRIPTION
# ---------------------------------------------------------------------------

@app.post("/api/mailing-list")
@app.post("/api/mailing-list/subscribe")
def subscribe_to_mailing_list(payload: MailingListSubscriptionRequest):
    if not payload.consent:
        raise HTTPException(
            status_code=422,
            detail="Please agree to receive ToKa Fitness email updates.",
        )

    email = normalized_email(payload.email)
    add_supabase_mailing_subscriber(email)
    token = create_mailing_list_unsubscribe_token(email)
    unsubscribe_url = (
        f"{FRONTEND_URL}/unsubscribe?token={quote(token, safe='')}"
    )
    mailing_list_welcome_email(email, unsubscribe_url)
    return {
        "message": "You are subscribed to ToKa Fitness email updates. Welcome!",
        "welcome_email_sent": True,
    }


@app.post("/api/mailing-list/unsubscribe")
def unsubscribe_from_mailing_list(payload: MailingListUnsubscribeRequest):
    email = mailing_list_email_from_unsubscribe_token(payload.token)
    remove_supabase_mailing_subscriber(email)
    return {"message": "You have been unsubscribed from ToKa Fitness emails."}


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
# MEMBERSHIP AND PAYMENTS (STRIPE CHECKOUT)
# ---------------------------------------------------------------------------

@app.get("/api/membership")
def get_membership(request: Request):
    user = get_authenticated_user(request)
    membership_status = user.get("membership_status", "free")
    membership_tier = user.get("membership_tier", "free")
    is_premium = (
        membership_tier in {"premium", "pro", "ultimate"}
        and membership_status in {"active", "trialing"}
    )

    return {
        "tier": membership_tier if is_premium else "free",
        "status": membership_status,
        "is_premium": is_premium,
        "payments_enabled": stripe_payment_configuration_ready(),
        "plans": membership_plan_configuration(),
    }


@app.post("/api/payments/checkout")
def create_checkout_session(
    payload: CheckoutRequest,
    request: Request,
):
    user = get_authenticated_user(request)
    if user.get("membership_tier") in {"premium", "pro", "ultimate"} and user.get(
        "membership_status"
    ) in {"active", "trialing"}:
        raise HTTPException(
            status_code=409,
            detail=(
                "Your paid membership is already active. Use the billing portal "
                "to change your plan without creating a second subscription."
            ),
        )

    if not stripe_payment_configuration_ready():
        raise HTTPException(
            status_code=503,
            detail=(
                "Secure payments are not fully configured. Set a valid Stripe API key "
                "and webhook signing secret before enabling checkout."
            ),
        )

    api_key = stripe_api_key()
    price_id = stripe_price_id(payload.plan)
    plan = next(
        item for item in membership_plan_configuration()
        if item["id"] == payload.plan
    )
    validate_membership_price(api_key, price_id, plan["price_gbp"])
    user_id = str(user["_id"])
    result = stripe_request(
        "checkout/sessions",
        api_key,
        {
            "mode": "subscription",
            "line_items[0][price]": price_id,
            "line_items[0][quantity]": "1",
            "client_reference_id": user_id,
            "customer_email": user["email"],
            "metadata[user_id]": user_id,
            "metadata[plan]": payload.plan,
            "subscription_data[metadata][user_id]": user_id,
            "subscription_data[metadata][plan]": payload.plan,
            "success_url": f"{FRONTEND_URL}/membership?payment=success",
            "cancel_url": f"{FRONTEND_URL}/membership?payment=cancelled",
        },
    )

    checkout_url = result.get("url")
    parsed_url = urlsplit(checkout_url or "")
    if parsed_url.scheme != "https" or parsed_url.hostname != "checkout.stripe.com":
        raise HTTPException(
            status_code=502,
            detail="Stripe did not return a valid secure checkout link.",
        )

    return {"checkout_url": checkout_url}


@app.post("/api/payments/portal")
def create_billing_portal_session(request: Request):
    user = get_authenticated_user(request)
    customer_id = user.get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(
            status_code=409,
            detail="There is no Stripe subscription to manage for this account.",
        )

    result = stripe_request(
        "billing_portal/sessions",
        stripe_api_key(),
        {
            "customer": customer_id,
            "return_url": f"{FRONTEND_URL}/membership",
        },
    )
    portal_url = result.get("url")
    parsed_url = urlsplit(portal_url or "")
    if parsed_url.scheme != "https" or parsed_url.hostname != "billing.stripe.com":
        raise HTTPException(
            status_code=502,
            detail="Stripe did not return a valid secure billing link.",
        )

    return {"portal_url": portal_url}


@app.post("/api/payments/webhook")
async def stripe_webhook(request: Request):
    webhook_secret = os.getenv("TOKA_STRIPE_WEBHOOK_SECRET", "").strip()
    if not re.fullmatch(r"whsec_[A-Za-z0-9]{16,}", webhook_secret):
        raise HTTPException(
            status_code=503,
            detail="Stripe webhook processing is not configured.",
        )

    payload = await request.body()
    signature = request.headers.get("stripe-signature", "")
    if not verify_stripe_signature(payload, signature, webhook_secret):
        raise HTTPException(status_code=400, detail="Invalid Stripe webhook signature.")

    try:
        event = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=400, detail="Invalid Stripe event payload.") from error

    event_type = event.get("type")
    stripe_object = event.get("data", {}).get("object", {})
    db = require_database()
    if event_type == "checkout.session.completed":
        user_id = (
            stripe_object.get("client_reference_id")
            or stripe_object.get("metadata", {}).get("user_id")
        )
        if user_id and ObjectId.is_valid(user_id):
            subscription_id = stripe_object.get("subscription")
            customer_id = stripe_object.get("customer")
            paid = stripe_object.get("payment_status") in {
                "paid",
                "no_payment_required",
            }
            plan = stripe_object.get("metadata", {}).get("plan", "premium")
            db.users.update_one(
                {"_id": ObjectId(user_id)},
                {
                    "$set": {
                        "membership_tier": plan if paid else "free",
                        "membership_status": "active" if paid else "incomplete",
                        "stripe_subscription_id": subscription_id,
                        "stripe_customer_id": customer_id,
                        "membership_updated_at": datetime.now(timezone.utc),
                    }
                },
            )
    elif event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        user_id = stripe_object.get("metadata", {}).get("user_id")
        price_items = stripe_object.get("items", {}).get("data", [])
        price_id = (
            price_items[0].get("price", {}).get("id", "")
            if price_items
            else ""
        )
        if user_id and ObjectId.is_valid(user_id):
            status = stripe_object.get("status", "")
            is_active = (
                event_type != "customer.subscription.deleted"
                and status in {"active", "trialing"}
            )
            db.users.update_one(
                {"_id": ObjectId(user_id)},
                {
                    "$set": {
                        "membership_tier": (
                            plan_for_stripe_price(
                                price_id,
                                stripe_object.get("metadata", {}).get("plan", "premium"),
                            )
                            if is_active
                            else "free"
                        ),
                        "membership_status": (
                            status if is_active else "canceled"
                        ),
                        "stripe_subscription_id": stripe_object.get("id"),
                        "stripe_customer_id": stripe_object.get("customer"),
                        "membership_updated_at": datetime.now(timezone.utc),
                    }
                },
            )
    elif event_type in {"invoice.paid", "invoice.payment_failed"}:
        subscription_id = stripe_object.get("subscription")
        if isinstance(subscription_id, dict):
            subscription_id = subscription_id.get("id")
        if subscription_id:
            is_paid = event_type == "invoice.paid"
            db.users.update_one(
                {"stripe_subscription_id": subscription_id},
                {
                    "$set": {
                        "membership_status": "active" if is_paid else "past_due",
                        "membership_updated_at": datetime.now(timezone.utc),
                    }
                },
            )

    return {"received": True}


# ---------------------------------------------------------------------------
# MEMBER SEARCH, DIRECT MESSAGES, BLOCKING, AND REPORTING
# ---------------------------------------------------------------------------

def ensure_member_is_not_blocked(db, current_user_id: str, other_user_id: str):
    block = db.member_blocks.find_one(
        {
            "$or": [
                {"blocker_id": current_user_id, "blocked_id": other_user_id},
                {"blocker_id": other_user_id, "blocked_id": current_user_id},
            ]
        }
    )
    if block:
        raise HTTPException(
            status_code=403,
            detail="This conversation is unavailable because a member has been blocked.",
        )


def find_chat_member(db, member_id: str) -> dict:
    target_id = valid_object_id(member_id)
    target = db.users.find_one(
        {"_id": target_id, "is_verified": True},
        {"full_name": 1, "membership_interest": 1},
    )
    if not target:
        raise HTTPException(status_code=404, detail="Member not found.")

    return target


def allowed_websocket_origins() -> set[str]:
    configured_origins = os.getenv("TOKA_ALLOWED_ORIGINS", FRONTEND_URL)
    return {
        origin.strip().rstrip("/")
        for origin in configured_origins.split(",")
        if origin.strip()
    } | {FRONTEND_URL}


def authenticated_websocket_member(websocket: WebSocket) -> dict | None:
    token = websocket.cookies.get(AUTH_COOKIE_NAME)
    if not token or not JWT_SECRET or mongo_db is None:
        return None

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        member_id = payload.get("sub", "")
        if not ObjectId.is_valid(member_id):
            return None
    except jwt.InvalidTokenError:
        return None

    member = mongo_db.users.find_one({"_id": ObjectId(member_id)})
    if not member or not member.get("is_verified", False):
        return None

    return member


class ChatConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[str, set[WebSocket]] = {}

    async def connect(self, member_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.setdefault(member_id, set()).add(websocket)

    def disconnect(self, member_id: str, websocket: WebSocket) -> None:
        member_connections = self.connections.get(member_id)
        if member_connections is None:
            return

        member_connections.discard(websocket)
        if not member_connections:
            self.connections.pop(member_id, None)

    def is_online(self, member_id: str) -> bool:
        return bool(self.connections.get(member_id))

    async def send_to_member(self, member_id: str, message: dict) -> int:
        delivered = 0
        for websocket in tuple(self.connections.get(member_id, ())):
            try:
                await websocket.send_json(message)
                delivered += 1
            except (OSError, RuntimeError, WebSocketDisconnect):
                self.disconnect(member_id, websocket)
        return delivered

    async def send_to_conversation(
        self,
        member_ids: tuple[str, str],
        message: dict,
    ) -> int:
        delivered = 0
        for member_id in set(member_ids):
            delivered += await self.send_to_member(member_id, message)
        return delivered


chat_connections = ChatConnectionManager()


def save_chat_message(
    db,
    sender_id: str,
    recipient_id: str,
    text: str,
    delivered_at: datetime | None = None,
) -> dict:
    created_at = datetime.now(timezone.utc)
    result = db.messages.insert_one(
        {
            "sender_id": sender_id,
            "recipient_id": recipient_id,
            "message": text,
            "created_at": created_at,
            "delivered_at": delivered_at,
            "read_at": None,
        }
    )
    return {
        "id": str(result.inserted_id),
        "sender_id": sender_id,
        "recipient_id": recipient_id,
        "message": text,
        "created_at": created_at.isoformat(),
        "delivered_at": delivered_at.isoformat() if delivered_at else None,
        "read_at": None,
    }


@app.get("/api/chat/members")
def search_chat_members(
    request: Request,
    search: str = Query(min_length=2, max_length=80),
):
    user = get_authenticated_user(request)
    db = require_database()
    normalized_search = search.strip()
    if len(normalized_search) < 2:
        raise HTTPException(
            status_code=422,
            detail="Enter at least two letters to search for members.",
        )
    search_pattern = re.escape(normalized_search)
    members = db.users.find(
        {
            "_id": {"$ne": user["_id"]},
            "is_verified": True,
            "full_name": {"$regex": search_pattern, "$options": "i"},
        },
        {"full_name": 1, "membership_interest": 1},
    ).limit(20)

    return {"members": [member_public_profile(member) for member in members]}


@app.get("/api/chat/conversations")
def get_chat_conversations(request: Request):
    user = get_authenticated_user(request)
    db = require_database()
    user_id = str(user["_id"])
    messages = db.messages.find(
        {"$or": [{"sender_id": user_id}, {"recipient_id": user_id}]},
        {
            "sender_id": 1,
            "recipient_id": 1,
            "message": 1,
            "created_at": 1,
            "read_at": 1,
        },
    ).sort("created_at", -1).limit(1000)

    conversations = {}
    for message in messages:
        other_id = (
            message["recipient_id"]
            if message["sender_id"] == user_id
            else message["sender_id"]
        )
        conversation = conversations.setdefault(
            other_id,
            {
                "member_id": other_id,
                "last_message": message["message"],
                "last_message_at": (
                    message["created_at"].replace(tzinfo=timezone.utc)
                    if message["created_at"].tzinfo is None
                    else message["created_at"]
                ).isoformat(),
                "unread_count": 0,
            },
        )
        if message["recipient_id"] == user_id and not message.get("read_at"):
            conversation["unread_count"] += 1

    if not conversations:
        return {"conversations": []}

    member_ids = [
        ObjectId(member_id)
        for member_id in conversations
        if ObjectId.is_valid(member_id)
    ]
    members = db.users.find(
        {"_id": {"$in": member_ids}, "is_verified": True},
        {"full_name": 1, "membership_interest": 1},
    )
    profiles = {str(member["_id"]): member_public_profile(member) for member in members}
    blocks = db.member_blocks.find(
        {
            "$or": [
                {"blocker_id": user_id},
                {"blocked_id": user_id},
            ]
        },
        {"blocker_id": 1, "blocked_id": 1},
    )
    blocked_ids = {
        block["blocked_id"]
        if block["blocker_id"] == user_id
        else block["blocker_id"]
        for block in blocks
    }

    results = []
    for member_id, conversation in conversations.items():
        profile = profiles.get(member_id)
        if profile and member_id not in blocked_ids:
            results.append({**conversation, "member": profile})
    results.sort(key=lambda item: item["last_message_at"], reverse=True)

    return {"conversations": results}


@app.get("/api/chat/conversations/{member_id}")
async def get_chat_messages(member_id: str, request: Request):
    user = get_authenticated_user(request)
    db = require_database()
    target = find_chat_member(db, member_id)
    user_id = str(user["_id"])
    other_user_id = str(target["_id"])
    ensure_member_is_not_blocked(db, user_id, other_user_id)

    read_at = datetime.now(timezone.utc)
    read_result = db.messages.update_many(
        {
            "sender_id": other_user_id,
            "recipient_id": user_id,
            "read_at": None,
        },
        {"$set": {"read_at": read_at}},
    )
    db.messages.update_many(
        {
            "sender_id": user_id,
            "recipient_id": other_user_id,
            "delivered_at": None,
        },
        {"$set": {"delivered_at": read_at}},
    )
    if read_result.modified_count:
        await chat_connections.send_to_member(
            other_user_id,
            {"type": "read", "member_id": user_id, "read_at": read_at.isoformat()},
        )
    messages = db.messages.find(
        {
            "$or": [
                {"sender_id": user_id, "recipient_id": other_user_id},
                {"sender_id": other_user_id, "recipient_id": user_id},
            ]
        },
        {
            "sender_id": 1,
            "recipient_id": 1,
            "message": 1,
            "created_at": 1,
            "delivered_at": 1,
            "read_at": 1,
        },
    ).sort("created_at", -1).limit(100)

    return {
        "messages": [
            {
                "id": str(message["_id"]),
                "sender_id": message["sender_id"],
                "recipient_id": message["recipient_id"],
                "message": message["message"],
                "created_at": (
                    message["created_at"].replace(tzinfo=timezone.utc)
                    if message["created_at"].tzinfo is None
                    else message["created_at"]
                ).isoformat(),
                "delivered_at": (
                    message["delivered_at"].replace(tzinfo=timezone.utc)
                    if message.get("delivered_at")
                    and message["delivered_at"].tzinfo is None
                    else message.get("delivered_at")
                ).isoformat()
                if message.get("delivered_at")
                else None,
                "read_at": (
                    message["read_at"].replace(tzinfo=timezone.utc)
                    if message.get("read_at") and message["read_at"].tzinfo is None
                    else message.get("read_at")
                ).isoformat()
                if message.get("read_at")
                else None,
            }
            for message in reversed(list(messages))
        ]
    }


@app.post("/api/chat/conversations/{member_id}", status_code=201)
async def send_chat_message(
    member_id: str,
    payload: ChatMessageRequest,
    request: Request,
):
    user = get_authenticated_user(request)
    db = require_database()
    target = find_chat_member(db, member_id)
    user_id = str(user["_id"])
    other_user_id = str(target["_id"])
    if user_id == other_user_id:
        raise HTTPException(status_code=422, detail="You cannot message yourself.")
    ensure_member_is_not_blocked(db, user_id, other_user_id)
    message_text = payload.message.strip()
    if not message_text:
        raise HTTPException(status_code=422, detail="Enter a message before sending.")

    delivered_at = datetime.now(timezone.utc) if chat_connections.is_online(
        other_user_id
    ) else None
    message = save_chat_message(
        db,
        user_id,
        other_user_id,
        message_text,
        delivered_at,
    )
    await chat_connections.send_to_conversation(
        (user_id, other_user_id),
        {"type": "message", "message": message},
    )

    return {"message": message}


@app.websocket("/api/chat/ws/{member_id}")
async def chat_websocket(websocket: WebSocket, member_id: str):
    origin = websocket.headers.get("origin", "").rstrip("/")
    if not origin or origin not in allowed_websocket_origins():
        await websocket.close(code=4403, reason="Origin is not allowed.")
        return

    current_user = authenticated_websocket_member(websocket)
    if not current_user:
        await websocket.close(code=4401, reason="Sign in to use member chat.")
        return

    if not ObjectId.is_valid(member_id):
        await websocket.close(code=4400, reason="Invalid member identifier.")
        return

    db = mongo_db
    user_id = str(current_user["_id"])
    other_user_id = str(member_id)
    if user_id == other_user_id:
        await websocket.close(code=4400, reason="You cannot chat with yourself.")
        return

    try:
        target = find_chat_member(db, other_user_id)
        ensure_member_is_not_blocked(db, user_id, other_user_id)
    except HTTPException as error:
        await websocket.close(
            code=4404 if error.status_code == 404 else 4403,
            reason=str(error.detail),
        )
        return

    await chat_connections.connect(user_id, websocket)
    await chat_connections.send_to_member(
        other_user_id,
        {"type": "presence", "member_id": user_id, "online": True},
    )
    try:
        while True:
            event = await websocket.receive_json()
            event_type = event.get("type") if isinstance(event, dict) else None
            if event_type == "typing":
                await chat_connections.send_to_member(
                    other_user_id,
                    {"type": "typing", "member_id": user_id, "is_typing": True},
                )
            elif event_type == "stop_typing":
                await chat_connections.send_to_member(
                    other_user_id,
                    {"type": "typing", "member_id": user_id, "is_typing": False},
                )
            elif event_type == "message":
                try:
                    message_request = ChatMessageRequest.model_validate(event)
                except ValueError:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message": "Messages must contain between 1 and 2,000 characters.",
                        }
                    )
                    continue

                ensure_member_is_not_blocked(db, user_id, other_user_id)
                message_text = message_request.message.strip()
                if not message_text:
                    await websocket.send_json(
                        {"type": "error", "message": "Enter a message before sending."}
                    )
                    continue

                message = save_chat_message(
                    db,
                    user_id,
                    str(target["_id"]),
                    message_text,
                    datetime.now(timezone.utc)
                    if chat_connections.is_online(other_user_id)
                    else None,
                )
                await chat_connections.send_to_conversation(
                    (user_id, other_user_id),
                    {
                        "type": "message",
                        "message": message,
                        "client_message_id": message_request.client_message_id,
                    },
                )
            else:
                await websocket.send_json(
                    {"type": "error", "message": "That chat action is not supported."}
                )
    except WebSocketDisconnect:
        chat_connections.disconnect(user_id, websocket)
        if not chat_connections.is_online(user_id):
            await chat_connections.send_to_member(
                other_user_id,
                {"type": "presence", "member_id": user_id, "online": False},
            )
    except HTTPException as error:
        await websocket.send_json({"type": "error", "message": str(error.detail)})
        await websocket.close(code=4403, reason="Conversation is unavailable.")
        chat_connections.disconnect(user_id, websocket)


@app.post("/api/chat/members/{member_id}/block")
async def block_chat_member(member_id: str, request: Request):
    user = get_authenticated_user(request)
    db = require_database()
    target = find_chat_member(db, member_id)
    user_id = str(user["_id"])
    other_user_id = str(target["_id"])
    if user_id == other_user_id:
        raise HTTPException(status_code=422, detail="You cannot block your own account.")

    db.member_blocks.update_one(
        {"blocker_id": user_id, "blocked_id": other_user_id},
        {
            "$setOnInsert": {
                "blocker_id": user_id,
                "blocked_id": other_user_id,
                "created_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )
    await chat_connections.send_to_conversation(
        (user_id, other_user_id),
        {"type": "blocked", "member_id": user_id},
    )
    return {"message": f"{target.get('full_name', 'This member')} has been blocked."}


@app.delete("/api/chat/members/{member_id}/block")
def unblock_chat_member(member_id: str, request: Request):
    user = get_authenticated_user(request)
    db = require_database()
    target_id = valid_object_id(member_id)
    db.member_blocks.delete_one(
        {"blocker_id": str(user["_id"]), "blocked_id": str(target_id)}
    )
    return {"message": "Member unblocked."}


@app.post("/api/chat/members/{member_id}/report", status_code=201)
def report_chat_member(
    member_id: str,
    payload: MemberReportRequest,
    request: Request,
):
    user = get_authenticated_user(request)
    db = require_database()
    target = find_chat_member(db, member_id)
    user_id = str(user["_id"])
    other_user_id = str(target["_id"])
    if user_id == other_user_id:
        raise HTTPException(status_code=422, detail="You cannot report your own account.")

    db.member_reports.insert_one(
        {
            "reporter_id": user_id,
            "reported_member_id": other_user_id,
            "reason": payload.reason,
            "created_at": datetime.now(timezone.utc),
            "status": "open",
        }
    )
    return {"message": "Your report has been sent to the ToKa Fitness team."}


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

    allow_origins=sorted(allowed_websocket_origins()),

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
    mailing_list_status = (
        "configured"
        if (
            os.getenv("TOKA_SUPABASE_URL", "").strip()
            and os.getenv("TOKA_SUPABASE_SECRET_KEY", "").strip()
            and email_status == "configured"
            and JWT_SECRET
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

        "mailing_list": mailing_list_status,

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
