/* Supabase connection (see supabase/README.md).
   Paste your project URL and its public key: the "anon" key, or the newer
   "publishable" key (starts sb_publishable_). Both are meant to be public; the Row
   Level Security rules in supabase/schema.sql decide what they can read and write.
   NEVER put the service_role / secret key here: it bypasses those rules.
   Leave both empty and the site runs on the offline catalogue in js/products.js. */
window.SS_CONFIG = {
  supabaseUrl: "https://dbfaesytgsymemiydqly.supabase.co",
  supabaseKey: "sb_publishable_Ba8huLdV-V5flUUPcDEyuA_Q1JNgTZ5"
};
