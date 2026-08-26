import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    'Numo is not configured: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env, then the dev server restarted.'
  );
}

const REQUEST_TIMEOUT_MS = 15_000;

/** Without a deadline a stalled connection leaves the UI spinning indefinitely. */
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = init?.signal;
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

  return fetch(input, { ...init, signal: controller.signal })
    .catch((err) => {
      if (controller.signal.aborted && !signal?.aborted) {
        throw new Error('Network request timed out. Please try again.');
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
};

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: { fetch: fetchWithTimeout },
});
