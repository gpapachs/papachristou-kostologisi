import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../config';

let client: SupabaseClient | null = null;

/** Supabase client για τον browser. */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY, {
      // Ξεχωριστό όνομα cookie ώστε να μη μπερδεύεται με τη σύνδεση των Κρατήσεων
      // αν ανοίγουν από τον ίδιο browser στο ίδιο domain (github.io).
      cookieOptions: { name: 'sb-kostologisi-auth' },
    });
  }
  return client;
}

/** Ελληνικό μήνυμα από σφάλμα rpc/Supabase. */
export function errMsg(e: unknown): string {
  if (!e) return 'Σφάλμα';
  if (typeof e === 'object' && 'message' in e) return String((e as { message: string }).message);
  return String(e);
}
