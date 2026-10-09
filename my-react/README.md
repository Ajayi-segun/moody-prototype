# ToKa Fitness

ToKa Fitness is a React/Vite website using Supabase Auth for member accounts
and email verification, Supabase Postgres for member profiles and mailing-list
subscriptions, and FastAPI/Brevo for mailing-list welcome emails.

## Run locally on Windows

1. Install Python 3.11 or newer and Node.js.
2. From this `my-react` directory, create a virtual environment and install the
   API requirements. Copy `backend\.env.example` to `backend\.env` and set the
   Supabase project URL, publishable/anon key, and server-only secret key,
   along with Brevo's API key and verified sender address:

   ```powershell
   py -m venv backend\.venv
   backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
   Copy-Item backend\.env.example backend\.env
   ```

3. Rotate any Supabase secret key previously pasted into chat. The Supabase
   publishable (or legacy anon) key is safe to expose; never use a secret or
   service-role key as the publishable key. Keep `TOKA_SUPABASE_SECRET_KEY`
   and `TOKA_BREVO_API_KEY` private in the FastAPI environment.
4. In Supabase Auth, enable email confirmation and set the local Site URL to
   `http://localhost:5173`. Add `http://localhost:5173/account` to the allowed
   redirect URLs. Configure Supabase Auth SMTP for dependable confirmation and
   password-reset email delivery (Brevo SMTP credentials can be configured in
   Supabase; its transactional API key is used by FastAPI for welcome email).
   Set Supabase Auth's password policy to at least 12 characters and require
   uppercase and lowercase letters, numbers, and symbols to match form
   validation.
   Run `backend\supabase_schema.sql` in the Supabase SQL editor to create the
   protected profiles and mailing-list tables and the profile creation trigger.
5. Start the FastAPI server from this directory:

   ```powershell
   backend\.venv\Scripts\python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
   ```

6. In a second terminal at this directory, install frontend packages if
   needed and start Vite:

   ```powershell
   npm install
   npm run dev
   ```

7. Open `http://localhost:5173/register`, submit a registration, and confirm
   the email sent by Supabase Auth. Check `http://127.0.0.1:8000/api/health`;
   `auth` must be `configured`. MongoDB is no longer needed for account
   registration, login, password resets, or member profiles.

## Email providers and deployment

Configure and test Supabase Auth SMTP for account confirmation and password
reset email. Verify the sender address/domain in Brevo before testing mailing
list welcome emails; subscribing reports an error if Brevo is not configured or
rejects delivery.

Run backend tests from this directory with
`backend\.venv\Scripts\python -m unittest backend.test_main`.

For deployment, set `TOKA_SUPABASE_URL` and
`TOKA_SUPABASE_PUBLISHABLE_KEY` for the public Auth client and configure the
Supabase Auth Site URL and redirect allow-list for the deployed HTTPS origin.
Keep `TOKA_SUPABASE_SECRET_KEY`, `TOKA_BREVO_API_KEY`, and the verified sender
as private FastAPI environment variables. The Supabase secret is used only by
FastAPI to write mailing-list subscriptions. Mailing-list subscribers receive
a welcome email through Brevo.

The registration form saves name, phone, date of birth, address, city, postcode,
and membership interest. Registration is limited to people aged 14 or older.
The homepage includes a Make It Count workout interval timer with one-, five-,
ten-, and twenty-minute presets, pause/resume, and reset controls.

The Training page plays the included CC BY 3.0 exercise demonstration clips
locally as browser-friendly MP4 files. Original WebM downloads are kept beside
the converted copies. Creator, source, licence, and conversion credits are
listed in the page.
