# ToKa Fitness

ToKa Fitness is a React and Vite website with Supabase email/password accounts.
Supabase stores registered users and their name metadata, keeps sign-in sessions
available across devices, and sends account verification and password reset
emails.

## Configure Supabase

1. Create a project at [supabase.com](https://supabase.com/).
2. In the Supabase project's API settings, copy the project URL and the
   publishable key (or legacy `anon` key). Never put a `service_role` key in a
   frontend app.
3. Copy `.env.example` to `.env` in this directory and set
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Restart Vite after changing
   environment variables.
4. In Supabase Authentication settings, enable email confirmation. Set the site
   URL to the deployed site's origin and add the local and deployed account
   callback URLs (for example, `http://localhost:5173/account` and
   `https://your-domain.example/account`) to the redirect allow list.
5. For reliable delivery to real users, configure a custom SMTP provider in
   Supabase's authentication email settings. Supabase's built-in sender is
   intended for testing and has delivery/recipient limits.
6. Set the same two `VITE_` values in the hosting provider's build environment
   and deploy the `my-react` Vite app. Configure the host to serve `index.html`
   for application routes such as `/register`, `/sign-in`, and `/account`.

The registration form creates the user in Supabase Auth and stores the provided
name in that user's metadata. Supabase sends the verification email; password
reset emails are handled by the same configured email provider. No account data
is stored only in browser local storage. Without the project settings, the
account page reports that configuration is missing and does not simulate a
successful sign-up.
