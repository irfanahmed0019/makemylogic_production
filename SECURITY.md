# Security notes

## Secrets

Keep `SARVAM_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` only in the server/deployment environment. Never prefix a secret with `VITE_`: Vite intentionally embeds `VITE_*` values in browser JavaScript.

`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_GOOGLE_CLIENT_ID` are public client configuration. The Supabase anon key is not a server secret; database safety depends on Row Level Security (RLS).

## Browser JavaScript

Client-side JavaScript cannot be hidden from visitors. Do not import server-only modules (`*.server.ts`) into browser modules and do not put secrets, privileged queries, or authorization decisions in client code. Production source maps remain disabled.

## Deployment checks

1. Apply `supabase-schema.sql` in the production Supabase SQL editor and verify all six tables have RLS enabled and no `Allow public access for dev` policy remains.
2. Apply `supabase-learning-sessions.sql` for the server-managed session tables.
3. Store the real keys in the deployment environment, not in Git or `.env` files committed to Git.
4. Set `ALLOWED_ORIGINS` only if another trusted web origin must call the session API. Separate multiple origins with commas.
5. Rotate any secret immediately if it is ever committed, logged, or copied into a browser-visible variable.
