/* =====================================================================
   Designated Drivers — configuration template
   1. Copy this file to config.js  (cp config.example.js config.js)
   2. Paste your Supabase Project URL and PUBLISHABLE key
      (Supabase → Project Settings → API Keys → "Publishable key",
       or the legacy "anon public" key — both work).
   3. Commit config.js and deploy.

   ✅ Safe to expose:  Project URL, publishable/anon key.
   ❌ NEVER put here:  service_role key, secret key (sb_secret_…), DB password.
   Writes are protected in the database (Row Level Security plus validated,
   rate-limited functions) — not by hiding this key.

   Leave both values empty to run in DEMO MODE.
   Add ?demo to any URL to force demo mode even when configured.
   ===================================================================== */
window.DD_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT-REF.supabase.co',
  supabasePublishableKey: 'sb_publishable_XXXXXXXXXXXXXXXXXXXXXXXX'
};
