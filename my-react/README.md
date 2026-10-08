# ToKa Fitness

ToKa Fitness is a React/Vite website with a FastAPI account backend. The API
stores member profiles in SQLite, hashes passwords, issues HttpOnly session
cookies, and sends verification and password-reset emails through Brevo's
transactional email API. The
account flow does not use Supabase.

## Run locally on Windows

1. Install Python 3.11 or newer and Node.js.
2. From this `my-react` directory, create a virtual environment and install the
   API requirements:

   ```powershell
   py -m venv backend\.venv
   backend\.venv\Scripts\python -m pip install -r backend\requirements.txt
   ```

3. Create a Brevo account, verify the sender address you want ToKa Fitness to
   send from, and create a transactional API key. Copy
   `backend\.env.example` to `backend\.env`; set `TOKA_BREVO_API_KEY` and
   `TOKA_EMAIL_FROM` to the key and verified sender address. These are
   server-only settings; never put the API key in a Vite `VITE_` variable or
   commit `backend\.env`.
4. Leave the local frontend and API URLs as supplied for a local run.
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

7. Open `http://localhost:5173/register`. Check
   `http://127.0.0.1:8000/api/health`; its `email` value must be `configured`.
   Register using an inbox you can access, open the ToKa Fitness email, and
   confirm its link.

## Email providers and deployment

Verify the sender address/domain in Brevo before testing real delivery. The app
does not send email if the API key is missing or Brevo rejects the request:
registration returns an error instead of reporting false success.

For deployment, run FastAPI and React behind HTTPS on the same origin (route
`/api/*` to FastAPI and the remaining paths to the Vite build). Set
`TOKA_FRONTEND_URL`, `TOKA_PUBLIC_API_URL`, and `TOKA_ALLOWED_ORIGINS` to the
deployed HTTPS origin, set `TOKA_COOKIE_SECURE=true`, and provide the Brevo API
key and verified sender as private server environment variables. Persist the SQLite database file or
replace it with a managed database before scaling to multiple API instances.

The registration form saves name, phone, date of birth, address, city, postcode,
and membership interest. Registration is limited to people aged 14 or older.
The homepage includes a Make It Count workout interval timer with one-, five-,
ten-, and twenty-minute presets, pause/resume, and reset controls.

The Training page plays the included CC BY 3.0 exercise demonstration clips
locally as browser-friendly MP4 files. Original WebM downloads are kept beside
the converted copies. Creator, source, licence, and conversion credits are
listed in the page.
