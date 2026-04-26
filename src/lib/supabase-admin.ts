// src/lib/supabase-admin.ts
//
// Server-only Supabase client. Uses the service role key, which BYPASSES
// Row-Level Security. NEVER import this from browser / client component code.
//
// Safe import sites:
//   - src/app/api/**/route.ts  (Next.js route handlers — server-only)
//   - server-only helpers in src/lib/* that are only called from those routes
//     (currently: email.ts, sequencer.ts, telegram.ts, pricing.ts)
//
// SUPABASE_SERVICE_ROLE_KEY is intentionally NOT prefixed with NEXT_PUBLIC_,
// so Next.js will refuse to bundle it into client output. If a client
// component accidentally imports this module the key will be empty at runtime
// and every request will fail — a loud failure, not a silent leak.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
