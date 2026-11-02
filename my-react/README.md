# ToKa Fitness

ToKa Fitness is a React/Vite website with a FastAPI backend. FastAPI uses
MongoDB for member accounts and Brevo for account verification and
password-reset and mailing-list welcome emails. Supabase stores mailing-list
subscriptions.

## Run locally on Windows

1. Install Python 3.11 or newer and Node.js.
2. From the repository root, create a virtual environment and install the API
   requirements. Copy `backend\.env.example` to `backend\.env` and set the
   MongoDB URI, JWT secret, Brevo API key and verified sender address, and
   Supabase project URL and service-role key:

   ```powershell
   py -m venv backend\.venv
   backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
   if (-not (Test-Path backend\.env)) { Copy-Item backend\.env.example backend\.env }
   ```

3. If any secret key has been shared or committed, revoke and rotate it. Keep
   `TOKA_SUPABASE_SECRET_KEY`, `TOKA_BREVO_API_KEY`, and `JWT_SECRET` private in
   the FastAPI environment.
4. Verify the sender address/domain in Brevo. FastAPI sends account verification,
   password-reset, and mailing-list welcome emails through Brevo. Set
   `TOKA_BACKEND_URL` and `TOKA_FRONTEND_URL` to the correct addresses so links
   in those emails work.
5. Start the FastAPI server from the repository root:

   ```powershell
   backend\.venv\Scripts\python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
   ```

6. In a second terminal, switch to `my-react`, install frontend packages if
   needed, and start Vite:

   ```powershell
   Set-Location my-react
   npm install
   npm run dev
   ```

7. Open `http://localhost:5173/register`, submit a registration, and follow the
   verification link sent by Brevo.

## Email providers and deployment

Configure MongoDB, Supabase, and Brevo in the FastAPI environment. Apply
`backend\supabase_schema.sql` in the Supabase SQL editor to create the
subscriber table. The mailing-list form requires explicit consent, validates
and normalizes addresses, saves the subscription in Supabase, and sends a
welcome email with an unsubscribe link through Brevo. The unsubscribe page
requires confirmation before revoking the subscription. `/api/health` reports
the mailing-list service as configured only when Supabase, Brevo, and the
signing secret are set.

Run backend tests from the repository root with
`backend\.venv\Scripts\python -m unittest backend.test_main`.

For deployment, configure MongoDB (`MONGODB_URI` and `DATABASE_NAME`),
`JWT_SECRET`, `TOKA_BREVO_API_KEY`, and `TOKA_EMAIL_FROM` as private FastAPI
environment variables. For mailing-list sign-ups, also set
`TOKA_SUPABASE_URL` and `TOKA_SUPABASE_SECRET_KEY` on the API server; never
expose the service-role key to frontend code. `TOKA_EMAIL_FROM` must be a sender
address/domain verified in Brevo. Set `TOKA_FRONTEND_URL` and
`TOKA_BACKEND_URL` to the deployed HTTPS origins so account links work. The
root `Dockerfile` builds the Vite site and packages the FastAPI backend;
Render's `render.yaml` declares the required server-side settings. Set each
secret in the deployment dashboard. Apply the Supabase schema before testing
a mailing-list sign-up.

The registration form saves member details in MongoDB. Registration is limited
to people aged 14 or older.
The homepage includes a Make It Count workout interval timer with one-, five-,
ten-, and twenty-minute presets, pause/resume, and reset controls.

## Membership payments and member messages

The Membership page offers Free access and three monthly paid memberships:
Premium at £18, Pro at £30, and Ultimate at £40. Create Stripe Prices in GBP
that exactly match the displayed monthly amounts. Checkout and subscription
management use Stripe-hosted pages; card details never pass through ToKa Fitness.

Set `TOKA_STRIPE_SECRET_KEY`, `TOKA_STRIPE_PRICE_PREMIUM`,
`TOKA_STRIPE_PRICE_PRO`, `TOKA_STRIPE_PRICE_ULTIMATE`, and
`TOKA_STRIPE_WEBHOOK_SECRET` in the FastAPI environment. Create a monthly GBP
Stripe Price for each paid plan, enable the Stripe customer billing portal, and enable
Stripe email receipts. Register
`https://<your-api-host>/api/payments/webhook` in Stripe for
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`,
and `invoice.payment_failed`. The webhook signing secret is the
`TOKA_STRIPE_WEBHOOK_SECRET` value. Keep all Stripe secrets on the API server,
never in Vite environment variables or browser code. Use Stripe test-mode keys
until the full checkout and webhook flow has been verified.

Verified members can search for other members by name, send private messages,
and block or report a member. Reports are stored for the ToKa Fitness team to
review. The messaging page reveals only a member's name and stated fitness
interest; it does not expose email addresses or contact details. Messages are
stored in MongoDB, with live updates when the member chat WebSocket is
available and automatic polling as a reconnect fallback.

Coaching, personal-training, and nutrition-review benefits are coordinated
directly with ToKa Fitness staff; the website does not schedule appointments.
Live gym occupancy, turnstile check-ins, and class booking require real gym
equipment and scheduling integrations and are not currently available.

## Accessibility and wellbeing

The read-aloud controls use the browser's built-in Speech Synthesis API. They
support play/pause, five-word rewind, default narration, and the available
Susan, George, and Hazel voices using short Voice 1–3 labels, plus adjustable
0.75x–1.5x speed, selected text, and optional click-to-read. Voice availability
depends on the user's browser and operating system. Dark mode, high contrast,
and warm reading colours are available in the header. BMI calculations happen
in the browser and are not saved to the account; results are general information,
not medical advice.

The Training page plays the included CC BY 3.0 exercise demonstration clips
locally as browser-friendly MP4 files. Original WebM downloads are kept beside
the converted copies. Creator, source, licence, and conversion credits are
listed in the page.
