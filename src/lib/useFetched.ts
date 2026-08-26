import { useCallback, useEffect, useRef, useState } from 'react';
import type { Fetched } from './result';

export type Load<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string };

/**
 * One read, with its loading and failure states.
 *
 * `key` is what the read depends on (usually a classroom id) — the fetcher
 * itself is held in a ref, so passing an inline arrow does not cause a refetch
 * loop. A stale response is discarded rather than overwriting a newer one.
 */
export function useFetched<T>(run: () => Promise<Fetched<T>>, key: string) {
  const [state, setState] = useState<Load<T>>({ status: 'loading' });
  const requestId = useRef(0);
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  });

  /**
   * `quiet` is for background refreshes: it leaves whatever is on screen alone
   * while the read is in flight, and keeps it if the read fails. A poll that
   * blanked the panel — or replaced it with an error over one dropped
   * request — would be worse than showing data a minute out of date.
   */
  const reload = useCallback(async (quiet = false) => {
    const id = ++requestId.current;
    if (!quiet) setState({ status: 'loading' });
    const res = await runRef.current();
    if (id !== requestId.current) return;
    if (res.ok) {
      setState({ status: 'ready', data: res.data });
    } else if (!quiet) {
      setState({ status: 'error', message: res.error });
    }
  }, []);

  useEffect(() => {
    void reload();
    // Bump the id on unmount so an in-flight response can't set state after.
    return () => {
      requestId.current++;
    };
  }, [reload, key]);

  /** Apply a local change without a round trip — for optimistic updates. */
  const patch = useCallback((update: (current: T) => T) => {
    setState((current) =>
      current.status === 'ready' ? { status: 'ready', data: update(current.data) } : current
    );
  }, []);

  return { state, reload, patch };
}
