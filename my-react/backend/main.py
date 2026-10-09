from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request as UrlRequest, urlopen

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import Scope


BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BACKEND_DIR, ".env"))
FRONTEND_URL = os.getenv("TOKA_FRONTEND_URL", "http://localhost:5173").rstrip("/")
FRONTEND_DIST_DIR = os.path.join(os.path.dirname(BACKEND_DIR), "dist")


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as error:
            if error.status_code != 404 or path == "api" or path.startswith("api/"):
                raise
            return await super().get_response("index.html", scope)


class EmailAddress(BaseModel):
    email: str = Field(min_length=3, max_length=254)


def normalized_email(value: str) -> str:
    email = value.strip().lower()
    if email.count("@") != 1 or "." not in email.rsplit("@", 1)[-1]:
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return email


def email_configuration() -> tuple[str, str, str]:
    api_key = os.getenv("TOKA_BREVO_API_KEY", "").strip()
    sender_email = os.getenv("TOKA_EMAIL_FROM", "").strip()
    if not all((api_key, sender_email)):
        raise HTTPException(
            status_code=503,
            detail=(
                "ToKa Fitness email is not configured yet. Set TOKA_BREVO_API_KEY "
                "and TOKA_EMAIL_FROM in the FastAPI server environment."
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


def supabase_configuration(variable_name: str) -> tuple[str, str] | None:
    supabase_url = os.getenv("TOKA_SUPABASE_URL", "").strip().rstrip("/")
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
                and parsed_url.hostname in {"localhost", "127.0.0.1"}
            )
        )
    ):
        return None
    return supabase_url, api_key


def add_supabase_mailing_subscriber(email: str) -> None:
    configuration = supabase_configuration("TOKA_SUPABASE_SECRET_KEY")
    if configuration is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "ToKa Fitness mailing list is not configured. Set "
                "TOKA_SUPABASE_URL and TOKA_SUPABASE_SECRET_KEY on the API server."
            ),
        )
    supabase_url, secret_key = configuration
    payload = json.dumps({"email": email}).encode("utf-8")
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
                    detail="Supabase did not accept the mailing-list subscription. Check the API key and table setup.",
                )
    except HTTPError as error:
        raise HTTPException(
            status_code=502,
            detail=(
                f"Supabase rejected the mailing-list subscription (HTTP {error.code}). "
                "Check the API key and table setup."
            ),
        ) from error
    except (URLError, TimeoutError, OSError) as error:
        raise HTTPException(
            status_code=502,
            detail="ToKa Fitness could not reach Supabase to save this subscription. Check the server connection and try again.",
        ) from error


def mailing_list_welcome_email(recipient: str) -> None:
    send_email(
        recipient,
        "Welcome to the ToKa Fitness mailing list",
        (
            "Thanks for joining the ToKa Fitness mailing list.\n\n"
            "You will receive updates about training, wellbeing, and club news. "
            "You can unsubscribe using the link in any future newsletter."
        ),
        (
            '<div style="padding:32px;background:#f5f3ef;font-family:Arial,sans-serif;color:#202020">'
            '<div style="max-width:560px;margin:auto;padding:32px;background:#fff">'
            '<p style="font-weight:bold">ToKa Fitness</p><h1>Welcome to our mailing list</h1>'
            '<p>Thanks for joining ToKa Fitness. You will receive updates about '
            'training, wellbeing, and club news.</p>'
            '<p>You can unsubscribe using the link in any future newsletter.</p>'
            "</div></div>"
        ),
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
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
        for key in ("TOKA_BREVO_API_KEY", "TOKA_EMAIL_FROM")
    )
    return {
        "status": "ok",
        "service": "ToKa Fitness",
        "email": "configured" if email_configured else "needs-setup",
        "auth": (
            "configured"
            if supabase_configuration("TOKA_SUPABASE_PUBLISHABLE_KEY")
            else "needs-setup"
        ),
        "mailing_list": (
            "configured"
            if email_configured and supabase_configuration("TOKA_SUPABASE_SECRET_KEY")
            else "needs-setup"
        ),
    }


@app.get("/api/config")
def public_configuration() -> dict[str, str]:
    configuration = supabase_configuration("TOKA_SUPABASE_PUBLISHABLE_KEY")
    if configuration is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Supabase Auth is not configured. Set TOKA_SUPABASE_URL and "
                "TOKA_SUPABASE_PUBLISHABLE_KEY on the API server."
            ),
        )
    supabase_url, publishable_key = configuration
    return {
        "supabase_url": supabase_url,
        "supabase_publishable_key": publishable_key,
    }


@app.post("/api/mailing-list")
def subscribe_to_mailing_list(payload: EmailAddress) -> dict[str, str]:
    email = normalized_email(payload.email)
    email_configuration()
    add_supabase_mailing_subscriber(email)
    mailing_list_welcome_email(email)
    return {"message": "Thanks for joining! A welcome email is on its way."}


if os.getenv("TOKA_SERVE_FRONTEND", "false").lower() == "true":
    if not os.path.isdir(FRONTEND_DIST_DIR):
        raise RuntimeError(f"Frontend build directory does not exist: {FRONTEND_DIST_DIR}")
    app.mount("/", SPAStaticFiles(directory=FRONTEND_DIST_DIR, html=True), name="frontend")
