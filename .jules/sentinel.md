## 2024-07-25 - Overly Permissive CORS Policy

**Vulnerability:** The Supabase Edge Function server in `src/supabase/functions/server/index.tsx` was configured with `app.use('*', cors());`, which allows cross-origin requests from any domain.

**Learning:** This misconfiguration likely existed to simplify local development but was never secured for production, exposing the backend to requests from malicious websites.

**Prevention:** Always configure CORS policies to explicitly whitelist trusted frontend domains. Use environment variables to manage different URLs for development, staging, and production environments. Never use a wildcard (`*`) origin in a production environment.