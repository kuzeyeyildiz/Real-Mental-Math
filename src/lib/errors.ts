/**
 * Network-failure detection and user-facing error text.
 *
 * Supabase surfaces connectivity problems inconsistently: PostgREST returns them
 * in `error`, while the auth client throws. Everything here tolerates both.
 */

const NETWORK_HINTS = [
  'failed to fetch',
  'fetch failed',
  'load failed',
  'networkerror',
  'network request failed',
  'err_name_not_resolved',
  'err_internet_disconnected',
  'err_connection',
  'timeout',
  'socket hang up',
];

export function errorMessage(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && 'message' in err) {
    return String((err as { message?: unknown }).message ?? '');
  }
  return String(err);
}

export function isNetworkError(err: unknown): boolean {
  const msg = errorMessage(err).toLowerCase();
  if (!msg) return false;
  return NETWORK_HINTS.some((hint) => msg.includes(hint));
}

export const OFFLINE_MESSAGE =
  "Can't reach the Numo server. Check your internet connection, then try again.";

export function toUserMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (isNetworkError(err)) return OFFLINE_MESSAGE;
  return errorMessage(err) || fallback;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Retries a write only when it failed for connectivity reasons — a rejected RLS
 * policy or constraint violation is deterministic and retrying it just stalls
 * the user.
 */
export async function retryWrite(
  run: () => Promise<{ error: string | null }>,
  attempts = 3,
  baseDelayMs = 400
): Promise<{ error: string | null }> {
  let last: { error: string | null } = { error: null };
  for (let attempt = 0; attempt < attempts; attempt++) {
    last = await run();
    if (!last.error || !isNetworkError(last.error)) return last;
    if (attempt < attempts - 1) await sleep(baseDelayMs * 2 ** attempt);
  }
  return last;
}
