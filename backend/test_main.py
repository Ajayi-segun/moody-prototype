import hashlib
import hmac
import json
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from bson import ObjectId

from backend import main


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client_context = TestClient(main.app)
        self.client = self.client_context.__enter__()
        self.addCleanup(self.client_context.__exit__, None, None, None)

    def test_health_reports_database_email_and_authentication_configuration(self):
        with patch.dict(
            "os.environ",
            {
                "TOKA_BREVO_API_KEY": "brevo-key",
                "TOKA_EMAIL_FROM": "members@example.com",
                "TOKA_SUPABASE_URL": "https://example.supabase.co",
                "TOKA_SUPABASE_SECRET_KEY": "supabase-key",
            },
        ), patch.object(
            main,
            "mongo_db",
            SimpleNamespace(command=lambda _command: None),
        ), patch.object(
            main,
            "JWT_SECRET",
            "test-jwt-secret",
        ):
            response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "status": "healthy",
                "database": "connected",
                "email": "configured",
                "mailing_list": "configured",
                "authentication": "configured",
            },
        )

    def test_public_config_returns_frontend_and_api_urls(self):
        with patch.dict(
            "os.environ",
            {
            },
        ):
            response = self.client.get("/api/config")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "api_url": main.BACKEND_URL,
                "frontend_url": main.FRONTEND_URL,
                "email_verification_required": True,
            },
        )
    def test_mailing_list_subscription_normalizes_email_and_sends_welcome(self):
        with (
            patch.object(main, "add_supabase_mailing_subscriber") as save_email,
            patch.object(main, "JWT_SECRET", "test-jwt-secret"),
            patch.object(main, "mailing_list_welcome_email") as send_welcome,
        ):
            response = self.client.post(
                "/api/mailing-list",
                json={"email": "  MEMBER@EXAMPLE.COM ", "consent": True},
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["welcome_email_sent"])
        save_email.assert_called_once_with("member@example.com")
        self.assertEqual(send_welcome.call_args.args[0], "member@example.com")
        self.assertIn("/unsubscribe?token=", send_welcome.call_args.args[1])

    def test_mailing_list_subscription_requires_consent(self):
        response = self.client.post(
            "/api/mailing-list",
            json={"email": "member@example.com", "consent": False},
        )

        self.assertEqual(response.status_code, 422)

    def test_mailing_list_subscription_rejects_invalid_email(self):
        response = self.client.post(
            "/api/mailing-list",
            json={"email": "member..fitness@example.com", "consent": True},
        )

        self.assertEqual(response.status_code, 422)

    def test_mailing_list_unsubscribe_requires_a_valid_token(self):
        token = main.jwt.encode(
            {"sub": "member@example.com", "purpose": "password-reset"},
            "test-jwt-secret",
            algorithm=main.JWT_ALGORITHM,
        )
        with patch.object(main, "JWT_SECRET", "test-jwt-secret"):
            response = self.client.post(
                "/api/mailing-list/unsubscribe",
                json={"token": token},
            )

        self.assertEqual(response.status_code, 400)

    def test_stripe_signature_rejects_tampered_and_expired_events(self):
        body = b'{"type":"checkout.session.completed"}'
        secret = "whsec_test"
        timestamp = str(int(time.time()))
        digest = hmac.new(
            secret.encode("utf-8"),
            timestamp.encode("ascii") + b"." + body,
            hashlib.sha256,
        ).hexdigest()

        self.assertTrue(
            main.verify_stripe_signature(
                body,
                f"t={timestamp},v1={digest}",
                secret,
            )
        )
        self.assertFalse(
            main.verify_stripe_signature(
                body + b" ",
                f"t={timestamp},v1={digest}",
                secret,
            )
        )
        self.assertFalse(
            main.verify_stripe_signature(
                body,
                f"t={int(timestamp) - 600},v1={digest}",
                secret,
            )
        )

    def test_checkout_creates_a_hosted_premium_subscription_session(self):
        user = {
            "_id": ObjectId(),
            "email": "member@example.com",
            "membership_tier": "free",
        }
        checkout_url = "https://checkout.stripe.com/c/pay/cs_test"

        with (
            patch.dict(
                "os.environ",
                {
                    "TOKA_STRIPE_SECRET_KEY": "sk_test_1234567890123456",
                    "TOKA_STRIPE_PRICE_PREMIUM": "price_monthly",
                    "TOKA_STRIPE_WEBHOOK_SECRET": "whsec_1234567890123456",
                },
            ),
            patch.object(main, "get_authenticated_user", return_value=user),
            patch.object(
                main,
                "stripe_request",
                side_effect=[
                    {
                        "active": True,
                        "currency": "gbp",
                        "unit_amount": 1800,
                        "recurring": {"interval": "month"},
                    },
                    {"url": checkout_url},
                ],
            ) as stripe_request,
        ):
            response = self.client.post(
                "/api/payments/checkout",
                json={"plan": "premium"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"checkout_url": checkout_url})
        price_endpoint, api_key, _price_data = stripe_request.call_args_list[0].args
        self.assertEqual(price_endpoint, "prices/price_monthly")
        self.assertEqual(
            stripe_request.call_args_list[0].kwargs,
            {"method": "GET"},
        )
        endpoint, api_key, form = stripe_request.call_args_list[1].args
        self.assertEqual(endpoint, "checkout/sessions")
        self.assertEqual(api_key, "sk_test_1234567890123456")
        self.assertEqual(form["mode"], "subscription")
        self.assertEqual(form["line_items[0][price]"], "price_monthly")
        self.assertEqual(form["metadata[user_id]"], str(user["_id"]))

    def test_pro_and_ultimate_checkout_validate_their_monthly_gbp_prices(self):
        user = {
            "_id": ObjectId(),
            "email": "member@example.com",
            "membership_tier": "free",
        }
        plans = (
            ("pro", "TOKA_STRIPE_PRICE_PRO", "price_pro", 3000),
            ("ultimate", "TOKA_STRIPE_PRICE_ULTIMATE", "price_ultimate", 4000),
        )

        for plan_id, price_variable, price_id, amount in plans:
            with self.subTest(plan=plan_id), patch.dict(
                "os.environ",
                {
                    "TOKA_STRIPE_SECRET_KEY": "sk_test_1234567890123456",
                    price_variable: price_id,
                    "TOKA_STRIPE_WEBHOOK_SECRET": "whsec_1234567890123456",
                },
            ), patch.object(
                main,
                "get_authenticated_user",
                return_value=user,
            ), patch.object(
                main,
                "stripe_request",
                side_effect=[
                    {
                        "active": True,
                        "currency": "gbp",
                        "unit_amount": amount,
                        "recurring": {"interval": "month"},
                    },
                    {"url": "https://checkout.stripe.com/c/pay/cs_test"},
                ],
            ) as stripe_request:
                response = self.client.post(
                    "/api/payments/checkout",
                    json={"plan": plan_id},
                )

            self.assertEqual(response.status_code, 200)
            self.assertEqual(
                stripe_request.call_args_list[0].args[0],
                f"prices/{price_id}",
            )
            checkout_form = stripe_request.call_args_list[1].args[2]
            self.assertEqual(checkout_form["metadata[plan]"], plan_id)
            self.assertEqual(checkout_form["line_items[0][price]"], price_id)

    def test_membership_lists_all_four_plan_prices_and_benefits(self):
        with patch.object(
            main,
            "get_authenticated_user",
            return_value={
                "_id": ObjectId(),
                "membership_tier": "free",
                "membership_status": "free",
            },
        ):
            response = self.client.get("/api/membership")

        self.assertEqual(response.status_code, 200)
        plans = response.json()["plans"]
        self.assertEqual(
            [(plan["id"], plan["price_gbp"]) for plan in plans],
            [("free", 0), ("premium", 18), ("pro", 30), ("ultimate", 40)],
        )
        self.assertIn("Small-group coaching sessions", plans[2]["benefits"])
        self.assertIn("One personal training session each month", plans[3]["benefits"])

    def test_checkout_fails_clearly_when_stripe_is_not_configured(self):
        with (
            patch.dict(
                "os.environ",
                {
                    "TOKA_STRIPE_SECRET_KEY": "",
                    "TOKA_STRIPE_PRICE_PREMIUM": "",
                },
            ),
            patch.object(
                main,
                "get_authenticated_user",
                return_value={"_id": ObjectId(), "email": "member@example.com"},
            ),
        ):
            response = self.client.post(
                "/api/payments/checkout",
                json={"plan": "premium"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("configured", response.json()["detail"])
        self.assertIn("Stripe", response.json()["detail"])

    def test_stripe_checkout_refuses_a_mispriced_plan(self):
        user = {"_id": ObjectId(), "email": "member@example.com"}
        with (
            patch.dict(
                "os.environ",
                {
                    "TOKA_STRIPE_SECRET_KEY": "sk_test_1234567890123456",
                    "TOKA_STRIPE_PRICE_PREMIUM": "price_monthly",
                    "TOKA_STRIPE_WEBHOOK_SECRET": "whsec_1234567890123456",
                },
            ),
            patch.object(main, "get_authenticated_user", return_value=user),
            patch.object(
                main,
                "stripe_request",
                return_value={
                    "active": True,
                    "currency": "gbp",
                    "unit_amount": 2000,
                    "recurring": {"interval": "month"},
                },
            ) as stripe_request,
        ):
            response = self.client.post(
                "/api/payments/checkout",
                json={"plan": "premium"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("£18.00 GBP", response.json()["detail"])
        self.assertEqual(stripe_request.call_count, 1)

    def test_stripe_request_authenticates_without_exposing_credentials(self):
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b'{"id":"cs_test"}'

        with patch.object(
            main,
            "urlopen",
            return_value=Response(),
        ) as send_request:
            result = main.stripe_request(
                "checkout/sessions",
                "sk_test_1234567890123456",
                {"mode": "subscription"},
            )

        self.assertEqual(result, {"id": "cs_test"})
        request = send_request.call_args.args[0]
        self.assertEqual(
            request.get_header("Authorization"),
            "Bearer sk_test_1234567890123456",
        )

    def test_chat_message_is_stored_only_for_a_verified_recipient(self):
        sender_id = ObjectId()
        recipient_id = ObjectId()
        inserted_id = ObjectId()
        recipient = {
            "_id": recipient_id,
            "full_name": "Member Two",
            "membership_interest": "strength-training",
        }
        message_collection = SimpleNamespace(
            insert_one=lambda message: (
                setattr(self, "saved_message", message)
                or SimpleNamespace(inserted_id=inserted_id)
            )
        )
        database = SimpleNamespace(
            users=SimpleNamespace(find_one=lambda *_args, **_kwargs: recipient),
            member_blocks=SimpleNamespace(find_one=lambda *_args, **_kwargs: None),
            messages=message_collection,
        )

        with (
            patch.object(
                main,
                "get_authenticated_user",
                return_value={"_id": sender_id, "full_name": "Member One"},
            ),
            patch.object(main, "require_database", return_value=database),
        ):
            response = self.client.post(
                f"/api/chat/conversations/{recipient_id}",
                json={"message": "  See you at training.  "},
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["message"]["id"], str(inserted_id))
        self.assertEqual(response.json()["message"]["message"], "See you at training.")
        self.assertEqual(self.saved_message["sender_id"], str(sender_id))
        self.assertEqual(self.saved_message["recipient_id"], str(recipient_id))

    def test_authenticated_chat_websocket_persists_and_delivers_messages(self):
        sender_id = ObjectId()
        recipient_id = ObjectId()
        inserted_id = ObjectId()
        recipient = {
            "_id": recipient_id,
            "full_name": "Member Two",
            "membership_interest": "strength-training",
        }
        database = SimpleNamespace(
            users=SimpleNamespace(find_one=lambda *_args, **_kwargs: recipient),
            member_blocks=SimpleNamespace(find_one=lambda *_args, **_kwargs: None),
            messages=SimpleNamespace(
                insert_one=lambda message: (
                    setattr(self, "saved_websocket_message", message)
                    or SimpleNamespace(inserted_id=inserted_id)
                )
            ),
        )
        main.chat_connections.connections.clear()

        with (
            patch.object(main, "allowed_websocket_origins", return_value={"http://testserver"}),
            patch.object(
                main,
                "authenticated_websocket_member",
                return_value={"_id": sender_id},
            ),
            patch.object(main, "mongo_db", database),
            self.client.websocket_connect(
                f"/api/chat/ws/{recipient_id}",
                headers={"origin": "http://testserver"},
            ) as websocket,
        ):
            websocket.send_json({"type": "message", "message": "  Nice work!  "})
            event = websocket.receive_json()

        self.assertEqual(event["type"], "message")
        self.assertEqual(event["message"]["id"], str(inserted_id))
        self.assertEqual(event["message"]["message"], "Nice work!")
        self.assertEqual(self.saved_websocket_message["sender_id"], str(sender_id))
        self.assertEqual(self.saved_websocket_message["recipient_id"], str(recipient_id))
        self.assertFalse(main.chat_connections.connections)

    def test_chat_is_disabled_when_either_member_has_blocked_the_other(self):
        sender_id = ObjectId()
        recipient_id = ObjectId()
        recipient = {
            "_id": recipient_id,
            "full_name": "Member Two",
            "membership_interest": "",
        }
        database = SimpleNamespace(
            users=SimpleNamespace(find_one=lambda *_args, **_kwargs: recipient),
            member_blocks=SimpleNamespace(find_one=lambda *_args, **_kwargs: {"blocked": True}),
        )

        with (
            patch.object(
                main,
                "get_authenticated_user",
                return_value={"_id": sender_id},
            ),
            patch.object(main, "require_database", return_value=database),
        ):
            response = self.client.get(
                f"/api/chat/conversations/{recipient_id}",
            )

        self.assertEqual(response.status_code, 403)
        self.assertIn("blocked", response.json()["detail"])

    def test_free_member_cannot_access_premium_training_data(self):
        with patch.object(
            main,
            "get_authenticated_user",
            return_value={
                "_id": ObjectId(),
                "membership_tier": "free",
                "membership_status": "free",
            },
        ):
            response = self.client.get("/api/premium/training")

        self.assertEqual(response.status_code, 403)
        self.assertIn("Premium", response.json()["detail"])

    def test_workout_log_requires_consent_and_stores_iso_date(self):
        member_id = ObjectId()
        inserted_id = ObjectId()
        saved = {}
        workout_logs = SimpleNamespace(
            insert_one=lambda item: (
                saved.update(item) or SimpleNamespace(inserted_id=inserted_id)
            )
        )
        database = SimpleNamespace(workout_logs=workout_logs)
        member = {
            "_id": member_id,
            "membership_tier": "premium",
            "membership_status": "active",
        }

        with (
            patch.object(main, "get_authenticated_user", return_value=member),
            patch.object(main, "require_database", return_value=database),
        ):
            response = self.client.post(
                "/api/premium/workouts",
                json={
                    "name": "Strength session",
                    "workout_date": "2026-10-31",
                    "duration_minutes": 45,
                    "exercises": [
                        {
                            "name": "Squat",
                            "sets": 3,
                            "reps": 8,
                            "weight_kg": 40,
                        }
                    ],
                    "consent": True,
                },
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(saved["member_id"], str(member_id))
        self.assertEqual(saved["workout_date"], "2026-10-31")
        self.assertEqual(saved["exercises"][0]["weight_kg"], 40)
        self.assertEqual(response.json()["workout"]["id"], str(inserted_id))


if __name__ == "__main__":
    unittest.main()
