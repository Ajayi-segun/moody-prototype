from __future__ import annotations

import hashlib
import html
import json
import os
import secrets
import sqlite3
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterator
from urllib.parse import quote
from urllib.error import HTTPError, URLError
from urllib.request import Request as UrlRequest, urlopen

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field


BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")
DATABASE_PATH = Path(os.getenv("TOKA_DATABASE_PATH", BACKEND_DIR / "toka.sqlite3"))
FRONTEND_URL = os.getenv("TOKA_FRONTEND_URL", "http://localhost:5173").rstrip("/")
PUBLIC_API_URL = os.getenv("TOKA_PUBLIC_API_URL", "http://127.0.0.1:8000").rstrip("/")
SESSION_COOKIE = "toka_session"
SESSION_DAYS = 30
TOKEN_HOURS = 24
RESEND_COOLDOWN_SECONDS = 60
MEMBERSHIP_INTERESTS = {
    "general-fitness",
    "strength-training",
    "weight-management",
    "flexibility-mobility",
    "group-classes",
    "not-sure",
}


class Registration(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=3, max_length=30)
    date_of_birth: date
    address: str = Field(min_length=1, max_length=200)
    city: str = Field(min_length=1, max_length=100)
    postcode: str = Field(min_length=1, max_length=20)
    membership_interest: str


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class EmailAddress(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class PasswordReset(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)


class PasswordUpdate(BaseModel):
    password: str = Field(min_length=8, max_length=128)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_timestamp(value: str) -> datetime:
    return datetime.fromisoformat(value)


def normalized_email(value: str) -> str:
    email = value.strip().lower()
    if email.count("@") != 1 or "." not in email.rsplit("@", 1)[-1]:
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return email


def age_on(date_of_birth: date, today: date | None = None) -> int:
    today = today or date.today()
    return today.year - date_of_birth.year - (
        (today.month, today.day) < (date_of_birth.month, date_of_birth.day)
    )


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    derived_key = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}:{derived_key.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, expected_hex = stored_hash.split(":", 1)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=2**14,
            r=8,
            p=1,
        ).hex()
        return secrets.compare_digest(actual, expected_hex)
    except (ValueError, TypeError):
        return False


@contextmanager
def connect_db() -> Iterator[sqlite3.Connection]:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_db() -> None:
    with connect_db() as connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                full_name TEXT NOT NULL,
                phone TEXT NOT NULL,
                date_of_birth TEXT NOT NULL,
                address TEXT NOT NULL,
                city TEXT NOT NULL,
                postcode TEXT NOT NULL,
                membership_interest TEXT NOT NULL,
                is_verified INTEGER NOT NULL DEFAULT 0,
                verification_token_hash TEXT,
                verification_expires_at TEXT,
                verification_sent_at TEXT,
                reset_token_hash TEXT,
                reset_expires_at TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            )
            """
        )


def email_configuration() -> tuple[str, str, str]:
    api_key = os.getenv("TOKA_BREVO_API_KEY", "").strip()
    sender_email = os.getenv("TOKA_EMAIL_FROM", "").strip()
    if not all((api_key, sender_email)):
        raise HTTPException(
            status_code=503,
            detail=(
                "ToKa Fitness email is not configured yet. Set TOKA_BREVO_API_KEY "
                "and TOKA_EMAIL_FROM "
                "in the FastAPI server environment."
            ),
        )
    sender_name = os.getenv("TOKA_EMAIL_SENDER_NAME", "ToKa Fitness").strip()
    return api_key, sender_email, sender_name


def send_email(recipient: str, subject: str, text_body: str, html_body: str) -> None:
    api_key, sender_email, sender_name = email_configuration()
    payload = json.dumps(
        {
            "sender": {"name": sender_name, "email": sender_email},
            "to": [{"email": recipient}],
            "subject": subject,
            "textContent": text_body,
            "htmlContent": html_body,
        }
    ).encode("utf-8")
    request = UrlRequest(
        "https://api.brevo.com/v3/smtp/email",
        data=payload,
        headers={"api-key": api_key, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            if response.status not in (200, 201, 202):
                raise HTTPException(
                    status_code=502,
                    detail="Brevo did not accept the email request. Check the API key and verified sender.",
                )
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Brevo rejected the email request (HTTP {error.code}). "
                "Check the API key and verified sender."
            ),
        ) from error
    except (URLError, TimeoutError, OSError) as error:
        raise HTTPException(
            status_code=502,
            detail="ToKa Fitness could not reach Brevo to send the email. Check the server connection and try again.",
        ) from error


def verification_email(recipient: str, name: str, token: str) -> None:
    confirmation_url = f"{PUBLIC_API_URL}/api/auth/verify?token={quote(token)}"
    safe_name = html.escape(name)
    safe_url = html.escape(confirmation_url, quote=True)
    send_email(
        recipient,
        "Welcome to ToKa Fitness - confirm your email",
        (
            f"Welcome to ToKa Fitness, {name}!\n\n"
            "Confirm your email address to activate your account:\n"
            f"{confirmation_url}\n\n"
            "If you did not register for ToKa Fitness, you can ignore this email."
        ),
        (
            '<div style="margin:0;padding:32px 16px;background:#f5f3ef;font-family:Arial,sans-serif;color:#202020">'
            '<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e3dfd8">'
            '<div style="padding:24px 32px;background:#202020;color:#fff;font-weight:bold">ToKa Fitness</div>'
            '<div style="padding:32px"><h1>Welcome to ToKa Fitness</h1>'
            f'<p>Hello {safe_name}, thanks for joining our supportive fitness community.</p>'
            '<p>Confirm your email to activate your account and get started.</p>'
            f'<p><a href="{safe_url}" style="display:inline-block;padding:14px 22px;background:#e66b2e;color:#fff;font-weight:bold;text-decoration:none">Confirm my email</a></p>'
            f'<p style="overflow-wrap:anywhere">If the button does not work, use this link: <a href="{safe_url}">{safe_url}</a></p>'
            '<p style="font-size:12px;color:#666">If you did not register, you can ignore this email.</p>'
            "</div></div></div>"
        ),
    )


def password_reset_email(recipient: str, name: str, token: str) -> None:
    reset_url = f"{FRONTEND_URL}/account?reset_token={quote(token)}"
    safe_name = html.escape(name)
    safe_url = html.escape(reset_url, quote=True)
    send_email(
        recipient,
        "ToKa Fitness - reset your password",
        f"Hello {name}, reset your ToKa Fitness password using this link:\n{reset_url}\n\nIf you did not request this, ignore this email.",
        (
            '<div style="padding:32px;background:#f5f3ef;font-family:Arial,sans-serif;color:#202020">'
            '<div style="max-width:560px;margin:auto;padding:32px;background:#fff">'
            '<p style="font-weight:bold">ToKa Fitness</p><h1>Reset your password</h1>'
            f'<p>Hello {safe_name}, use the link below to choose a new password.</p>'
            f'<p><a href="{safe_url}" style="display:inline-block;padding:14px 22px;background:#e66b2e;color:#fff;font-weight:bold;text-decoration:none">Choose a new password</a></p>'
            '<p style="font-size:12px;color:#666">If you did not request this, ignore this email.</p>'
            "</div></div>"
        ),
    )


def public_user(user: sqlite3.Row) -> dict[str, object]:
    return {
        "id": user["id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "phone": user["phone"],
        "date_of_birth": user["date_of_birth"],
        "address": user["address"],
        "city": user["city"],
        "postcode": user["postcode"],
        "membership_interest": user["membership_interest"],
        "is_verified": bool(user["is_verified"]),
    }


def current_user(request: Request) -> sqlite3.Row | None:
    session_token = request.cookies.get(SESSION_COOKIE)
    if not session_token:
        return None
    with connect_db() as connection:
        return connection.execute(
            """
            SELECT users.* FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ? AND sessions.expires_at > ?
            """,
            (hash_secret(session_token), utc_now().isoformat()),
        ).fetchone()


def verified_account_page(title: str, body: str) -> HTMLResponse:
    return HTMLResponse(
        "<!doctype html><html lang='en'><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{html.escape(title)} | ToKa Fitness</title>"
        "<body style='margin:0;padding:48px 20px;background:#f5f3ef;font-family:Arial,sans-serif;color:#202020'>"
        "<main style='max-width:560px;margin:auto;padding:32px;background:white;border:1px solid #e3dfd8'>"
        "<p style='font-weight:bold'>ToKa Fitness</p>"
        f"<h1>{html.escape(title)}</h1><p>{html.escape(body)}</p>"
        f"<p><a href='{html.escape(FRONTEND_URL + '/sign-in', quote=True)}'>Return to ToKa Fitness sign in</a></p>"
        "</main></body></html>"
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="ToKa Fitness API", version="1.0.0", lifespan=lifespan)
allowed_origins = [
    origin.strip()
    for origin in os.getenv("TOKA_ALLOWED_ORIGINS", FRONTEND_URL).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    email_configured = all(
        os.getenv(key, "").strip()
        for key in (
            "TOKA_BREVO_API_KEY",
            "TOKA_EMAIL_FROM",
        )
    )
    return {
        "status": "ok",
        "service": "ToKa Fitness",
        "email": "configured" if email_configured else "needs-setup",
    }


@app.post("/api/auth/register", status_code=201)
def register(payload: Registration) -> dict[str, str]:
    email = normalized_email(payload.email)
    full_name = payload.full_name.strip()
    if not full_name:
        raise HTTPException(status_code=422, detail="Enter your full name.")
    if age_on(payload.date_of_birth) < 14:
        raise HTTPException(status_code=422, detail="You must be at least 14 years old to register.")
    if payload.date_of_birth > date.today():
        raise HTTPException(status_code=422, detail="Date of birth cannot be in the future.")
    if payload.membership_interest not in MEMBERSHIP_INTERESTS:
        raise HTTPException(status_code=422, detail="Choose a valid membership interest.")

    verification_token = secrets.token_urlsafe(32)
    now = utc_now()
    expires = now + timedelta(hours=TOKEN_HOURS)
    try:
        with connect_db() as connection:
            cursor = connection.execute(
                """
                INSERT INTO users (
                    email, password_hash, full_name, phone, date_of_birth, address,
                    city, postcode, membership_interest, verification_token_hash,
                    verification_expires_at, verification_sent_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    email,
                    hash_password(payload.password),
                    full_name,
                    payload.phone.strip(),
                    payload.date_of_birth.isoformat(),
                    payload.address.strip(),
                    payload.city.strip(),
                    payload.postcode.strip(),
                    payload.membership_interest,
                    hash_secret(verification_token),
                    expires.isoformat(),
                    now.isoformat(),
                    now.isoformat(),
                ),
            )
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError as error:
        raise HTTPException(status_code=409, detail="An account already exists for this email address.") from error

    try:
        verification_email(email, full_name, verification_token)
    except HTTPException:
        with connect_db() as connection:
            connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        raise
    return {"message": "ToKa Fitness sent a verification email. Check your inbox and spam folder."}


@app.post("/api/auth/resend")
def resend_verification(payload: EmailAddress) -> dict[str, str]:
    email = normalized_email(payload.email)
    now = utc_now()
    with connect_db() as connection:
        user = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if user is None or user["is_verified"]:
        return {"message": "If the account needs verification, a new email will be sent shortly."}

    sent_at = user["verification_sent_at"]
    if sent_at and (now - parse_timestamp(sent_at)).total_seconds() < RESEND_COOLDOWN_SECONDS:
        return {"message": "Please wait before requesting another verification email."}

    token = secrets.token_urlsafe(32)
    verification_email(email, user["full_name"], token)
    with connect_db() as connection:
        connection.execute(
            """
            UPDATE users SET verification_token_hash = ?, verification_expires_at = ?,
                verification_sent_at = ? WHERE id = ? AND is_verified = 0
            """,
            (
                hash_secret(token),
                (now + timedelta(hours=TOKEN_HOURS)).isoformat(),
                now.isoformat(),
                user["id"],
            ),
        )
    return {"message": "ToKa Fitness sent a new verification email. Check your inbox and spam folder."}


@app.get("/api/auth/verify", response_class=HTMLResponse)
def verify_email(token: str) -> HTMLResponse:
    now = utc_now().isoformat()
    with connect_db() as connection:
        user = connection.execute(
            """
            SELECT id FROM users
            WHERE verification_token_hash = ? AND verification_expires_at > ? AND is_verified = 0
            """,
            (hash_secret(token), now),
        ).fetchone()
        if user is None:
            return verified_account_page(
                "This link has expired",
                "Request a new verification email from the ToKa Fitness sign-in page.",
            )
        connection.execute(
            """
            UPDATE users SET is_verified = 1, verification_token_hash = NULL,
                verification_expires_at = NULL WHERE id = ?
            """,
            (user["id"],),
        )
    return verified_account_page(
        "Email confirmed",
        "Your ToKa Fitness account is verified. You can now sign in.",
    )


@app.post("/api/auth/login")
def login(payload: Credentials, response: Response) -> dict[str, object]:
    email = normalized_email(payload.email)
    with connect_db() as connection:
        user = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email address or password is incorrect.")
    if not user["is_verified"]:
        raise HTTPException(
            status_code=403,
            detail="Confirm your ToKa Fitness email address before signing in.",
        )

    session_token = secrets.token_urlsafe(32)
    expires = utc_now() + timedelta(days=SESSION_DAYS)
    with connect_db() as connection:
        connection.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (hash_secret(session_token), user["id"], expires.isoformat()),
        )
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (utc_now().isoformat(),))
    response.set_cookie(
        SESSION_COOKIE,
        session_token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=os.getenv("TOKA_COOKIE_SECURE", "false").lower() == "true",
        samesite="lax",
        path="/",
    )
    return {"user": public_user(user)}


@app.get("/api/auth/me")
def me(request: Request) -> dict[str, object | None]:
    user = current_user(request)
    return {"user": public_user(user) if user else None}


@app.post("/api/auth/logout")
def logout(request: Request, response: Response) -> dict[str, str]:
    session_token = request.cookies.get(SESSION_COOKIE)
    if session_token:
        with connect_db() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_secret(session_token),))
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax")
    return {"message": "You are signed out."}


@app.post("/api/auth/forgot-password")
def forgot_password(payload: EmailAddress) -> dict[str, str]:
    email = normalized_email(payload.email)
    with connect_db() as connection:
        user = connection.execute(
            "SELECT id, full_name, is_verified FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    if user is not None and user["is_verified"]:
        token = secrets.token_urlsafe(32)
        now = utc_now()
        password_reset_email(email, user["full_name"], token)
        with connect_db() as connection:
            connection.execute(
                "UPDATE users SET reset_token_hash = ?, reset_expires_at = ? WHERE id = ?",
                (
                    hash_secret(token),
                    (now + timedelta(hours=1)).isoformat(),
                    user["id"],
                ),
            )
    return {"message": "If a verified account exists for that address, a reset email has been sent."}


@app.post("/api/auth/reset-password")
def reset_password(payload: PasswordReset) -> dict[str, str]:
    now = utc_now().isoformat()
    with connect_db() as connection:
        user = connection.execute(
            "SELECT id FROM users WHERE reset_token_hash = ? AND reset_expires_at > ?",
            (hash_secret(payload.token), now),
        ).fetchone()
        if user is None:
            raise HTTPException(status_code=400, detail="This password reset link is invalid or expired.")
        connection.execute(
            """
            UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL
            WHERE id = ?
            """,
            (hash_password(payload.password), user["id"]),
        )
        connection.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
    return {"message": "Your ToKa Fitness password has been updated. Please sign in."}


@app.post("/api/auth/update-password")
def update_password(payload: PasswordUpdate, request: Request) -> dict[str, str]:
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to update your password.")
    with connect_db() as connection:
        connection.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(payload.password), user["id"]),
        )
        connection.execute(
            "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
            (user["id"], hash_secret(request.cookies.get(SESSION_COOKIE, ""))),
        )
    return {"message": "Your ToKa Fitness password has been updated."}
