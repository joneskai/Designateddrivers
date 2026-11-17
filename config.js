/* Designated Drivers configuration.
   Leave the values empty to run in DEMO MODE (fictional data, this browser only).
   Fill them in to run the real championship from Supabase.
   The publishable (anon) key is designed to be public — security comes from
   Row Level Security. NEVER put a service_role / secret key here. */
window.DD_CONFIG = {
  supabaseUrl: '',
  supabasePublishableKey: '',

  // --- The Tee Sheet (both optional) ---
  // Time zone the competition runs in. Proposed dates, deadlines and tee times use it.
  timezone: 'Australia/Perth',
  // The public address of the site, used in WhatsApp messages and calendar entries.
  // Leave empty to use whatever address the page is opened from.
  siteUrl: ''
};
