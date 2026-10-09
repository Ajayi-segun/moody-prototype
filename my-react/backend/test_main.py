import json
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import main


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client_context = TestClient(main.app)
        self.client = self.client_context.__enter__()
        self.addCleanup(self.client_context.__exit__, None, None, None)

    def test_health_reports_supabase_and_email_configuration(self):
        with patch.dict(
            "os.environ",
            {
                "TOKA_SUPABASE_URL": "https://example.supabase.co",
                "TOKA_SUPABASE_PUBLISHABLE_KEY": "public-key",
                "TOKA_SUPABASE_SECRET_KEY": "server-secret",
                "TOKA_BREVO_API_KEY": "brevo-key",
                "TOKA_EMAIL_FROM": "members@example.com",
            },
        ):
            response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status": "ok",
                "service": "ToKa Fitness",
                "email": "configured",
                "auth": "configured",
                "mailing_list": "configured",
            },
        )

    def test_public_config_returns_only_publishable_key(self):
        with patch.dict(
            "os.environ",
            {
                "TOKA_SUPABASE_URL": "https://example.supabase.co",
                "TOKA_SUPABASE_PUBLISHABLE_KEY": "public-key",
                "TOKA_SUPABASE_SECRET_KEY": "server-secret",
            },
        ):
            response = self.client.get("/api/config")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "supabase_url": "https://example.supabase.co",
                "supabase_publishable_key": "public-key",
            },
        )
        self.assertNotIn("server-secret", response.text)

    def test_public_config_requires_supabase_project_settings(self):
        with patch.dict(
            "os.environ",
            {
                "TOKA_SUPABASE_URL": "",
                "TOKA_SUPABASE_PUBLISHABLE_KEY": "",
            },
        ):
            response = self.client.get("/api/config")

        self.assertEqual(response.status_code, 503)

    def test_subscription_normalizes_email_then_sends_welcome(self):
        with (
            patch.dict(
                "os.environ",
                {
                    "TOKA_BREVO_API_KEY": "test-brevo-key",
                    "TOKA_EMAIL_FROM": "members@example.com",
                },
            ),
            patch.object(main, "add_supabase_mailing_subscriber") as save_email,
            patch.object(main, "mailing_list_welcome_email") as send_welcome,
        ):
            response = self.client.post(
                "/api/mailing-list",
                json={"email": "  MEMBER@EXAMPLE.COM "},
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn("welcome email", response.json()["message"])
        save_email.assert_called_once_with("member@example.com")
        send_welcome.assert_called_once_with("member@example.com")

    def test_subscription_does_not_report_success_when_supabase_fails(self):
        with patch.object(
            main,
            "add_supabase_mailing_subscriber",
            side_effect=main.HTTPException(status_code=502, detail="Supabase failed."),
        ), patch.object(main, "mailing_list_welcome_email") as send_welcome, patch.dict(
            "os.environ",
            {
                "TOKA_BREVO_API_KEY": "test-brevo-key",
                "TOKA_EMAIL_FROM": "members@example.com",
            },
        ):
            response = self.client.post(
                "/api/mailing-list",
                json={"email": "member@example.com"},
            )

        self.assertEqual(response.status_code, 502)
        send_welcome.assert_not_called()

    def test_supabase_subscription_upserts_into_configured_table(self):
        class Response:
            status = 201

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        with patch.dict(
            "os.environ",
            {
                "TOKA_SUPABASE_URL": "https://example.supabase.co",
                "TOKA_SUPABASE_SECRET_KEY": "test-secret",
            },
        ), patch.object(main, "urlopen", return_value=Response()) as send_request:
            main.add_supabase_mailing_subscriber("member@example.com")

        request = send_request.call_args.args[0]
        self.assertEqual(
            request.full_url,
            "https://example.supabase.co/rest/v1/mailing_list_subscribers?on_conflict=email",
        )
        self.assertEqual(request.get_header("Apikey"), "test-secret")
        self.assertEqual(
            request.get_header("Authorization"),
            "Bearer test-secret",
        )
        self.assertEqual(
            request.get_header("Prefer"),
            "resolution=merge-duplicates,return=minimal",
        )
        self.assertEqual(
            json.loads(request.data),
            {"email": "member@example.com"},
        )

    def test_welcome_email_is_sent_through_brevo(self):
        class Response:
            status = 201

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

        with patch.dict(
            "os.environ",
            {
                "TOKA_BREVO_API_KEY": "test-brevo-key",
                "TOKA_EMAIL_FROM": "members@example.com",
                "TOKA_EMAIL_SENDER_NAME": "ToKa Fitness",
            },
        ), patch.object(main, "urlopen", return_value=Response()) as send_request:
            main.mailing_list_welcome_email("member@example.com")

        request = send_request.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(request.get_header("Api-key"), "test-brevo-key")
        payload = json.loads(request.data)
        self.assertEqual(payload["to"], [{"email": "member@example.com"}])
        self.assertIn("Welcome", payload["subject"])

    def test_email_api_failure_is_reported(self):
        with patch.dict(
            "os.environ",
            {
                "TOKA_BREVO_API_KEY": "",
                "TOKA_EMAIL_FROM": "",
            },
        ):
            response = self.client.post(
                "/api/mailing-list",
                json={"email": "member@example.com"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("email is not configured", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
