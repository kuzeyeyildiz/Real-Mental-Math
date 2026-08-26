import { useCallback, useEffect, useRef, useState } from 'react';

const CONFIRM_MS = 1500;

/**
 * Copy-to-clipboard with a short "Copied!" confirmation.
 *
 * The Clipboard API is unavailable on insecure origins and can be denied
 * outright, so `copy` reports failure rather than silently doing nothing —
 * a join code the teacher thinks they copied but didn't is worse than no
 * button at all.
 */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), CONFIRM_MS);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { copied, copy };
}
