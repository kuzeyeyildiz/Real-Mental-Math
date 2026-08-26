import { retryWrite, toUserMessage } from './errors';

/**
 * Reads report failure explicitly instead of collapsing it into an empty value.
 * A missing row and an unreachable server mean very different things — treating
 * an outage as "no benchmark yet" would push a placed student back into the test.
 */
export type Fetched<T> = { ok: true; data: T } | { ok: false; error: string };

export async function fetched<T>(run: () => Promise<T>): Promise<Fetched<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (err) {
    return { ok: false, error: toUserMessage(err) };
  }
}

export type Written = { error: string | null };

export async function written(run: () => Promise<Written>): Promise<Written> {
  return retryWrite(async () => {
    try {
      return await run();
    } catch (err) {
      return { error: toUserMessage(err) };
    }
  });
}

/** Collapses a PostgREST `{ error }` into the shape `written` expects. */
export function pgError(error: { message: string } | null): Written {
  return { error: error ? toUserMessage(error) : null };
}
