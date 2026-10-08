import json
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main


class AccountApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        main.DATABASE_PATH = Path(self.temp_dir.name) / "test.sqlite3"
        main.init_db()
        self.client_context = TestClient(main.app)
        self.client = self.client_context.__enter__()
        self.email_token = None
        self.profile = {
            "email": "member@example.com",
            "password": "correct-horse-battery",
            "full_name": "Taylor Member",
            "phone": "+441234567890",
            "date_of_birth": "2000-01-01",
            "address": "1 Example Road",
            "city": "London",
            "postcode": "AB1 2CD",
            "membership_interest": "general-fitness",
        }

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.temp_dir.cleanup()

    def register_with_mail_capture(self):
        def capture_token(_email, _name, token):
            self.email_token = token

        return patch.object(main, "verification_email", side_effect=capture_token)

    def test_registration_sends_confirmation_and_verification_allows_login(self):
        with self.register_with_mail_capture() as send_email:
            response = self.client.post("/api/auth/register", json=self.profile)

        self.assertEqual(response.status_code, 201)
        send_email.assert_called_once()
        self.assertIn("verification email", response.json()["message"])
        verified = self.client.get("/api/auth/verify", params={"token": self.email_token})
        self.assertIn("Email confirmed", verified.text)

        login = self.client.post(
            "/api/auth/login",
            json={"email": self.profile["email"], "password": self.profile["password"]},
        )
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.json()["user"]["full_name"], self.profile["full_name"])
        self.assertTrue(login.json()["user"]["is_verified"])
        self.assertEqual(self.client.get("/api/auth/me").json()["user"]["email"], self.profile["email"])

        self.client.post("/api/auth/logout")
        self.assertIsNone(self.client.get("/api/auth/me").json()["user"])

    def test_registration_rejects_underage_member_before_sending_email(self):
        underage_date = date.today() - timedelta(days=13 * 365)
        payload = {**self.profile, "date_of_birth": underage_date.isoformat()}
        with patch.object(main, "verification_email") as send_email:
            response = self.client.post("/api/auth/register", json=payload)

        self.assertEqual(response.status_code, 422)
        self.assertIn("14 years old", response.json()["detail"])
        send_email.assert_not_called()

    def test_registration_does_not_keep_account_when_email_fails(self):
        with patch.dict(
            "os.environ",
            {
                "TOKA_BREVO_API_KEY": "",
                "TOKA_EMAIL_FROM": "",
            },
        ):
            response = self.client.post("/api/auth/register", json=self.profile)

        self.assertEqual(response.status_code, 503)
        with main.connect_db() as connection:
            count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        self.assertEqual(count, 0)

    def test_resend_sends_new_verification_email_after_cooldown(self):
        with self.register_with_mail_capture():
            self.client.post("/api/auth/register", json=self.profile)
        with main.connect_db() as connection:
            connection.execute(
                "UPDATE users SET verification_sent_at = ? WHERE email = ?",
                ((main.utc_now() - timedelta(seconds=61)).isoformat(), self.profile["email"]),
            )

        with self.register_with_mail_capture() as send_email:
            response = self.client.post("/api/auth/resend", json={"email": self.profile["email"]})

        self.assertEqual(response.status_code, 200)
        send_email.assert_called_once()
        self.assertIn("new verification email", response.json()["message"])

    def test_password_reset_email_updates_password(self):
        with self.register_with_mail_capture():
            self.client.post("/api/auth/register", json=self.profile)
        self.client.get("/api/auth/verify", params={"token": self.email_token})
        reset_token = None

        def capture_reset_token(_email, _name, token):
            nonlocal reset_token
            reset_token = token

        with patch.object(main, "password_reset_email", side_effect=capture_reset_token):
            response = self.client.post(
                "/api/auth/forgot-password",
                json={"email": self.profile["email"]},
            )

        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(reset_token)
        reset = self.client.post(
            "/api/auth/reset-password",
            json={"token": reset_token, "password": "new-correct-password"},
        )
        self.assertEqual(reset.status_code, 200)
        login = self.client.post(
            "/api/auth/login",
            json={"email": self.profile["email"], "password": "new-correct-password"},
        )
        self.assertEqual(login.status_code, 200)


class BrevoEmailTests(unittest.TestCase):
    def test_send_email_calls_brevo_with_api_key_and_branded_payload(self):
        class Response:
            status = 201

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        with patch.dict(
            "os.environ",
            {
                "TOKA_BREVO_API_KEY": "test-api-key",
                "TOKA_EMAIL_FROM": "members@example.com",
                "TOKA_EMAIL_SENDER_NAME": "ToKa Fitness",
            },
        ), patch.object(main, "urlopen", return_value=Response()) as send_request:
            main.send_email(
                "member@example.com",
                "Confirm your email",
                "Plain text",
                "<p>HTML message</p>",
            )

        request = send_request.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(request.get_header("Api-key"), "test-api-key")
        self.assertEqual(request.get_header("Content-type"), "application/json")
        self.assertEqual(send_request.call_args.kwargs["timeout"], 20)
        self.assertEqual(
            json.loads(request.data),
            {
                "sender": {"name": "ToKa Fitness", "email": "members@example.com"},
                "to": [{"email": "member@example.com"}],
                "subject": "Confirm your email",
                "textContent": "Plain text",
                "htmlContent": "<p>HTML message</p>",
            },
        )


if __name__ == "__main__":
    unittest.main()
