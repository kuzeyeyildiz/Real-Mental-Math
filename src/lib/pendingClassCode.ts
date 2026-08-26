/** Carries a class code whose join failed during signup over to the Studio. */
export const PENDING_CLASS_CODE_KEY = 'numo:pendingClassCode';

export function takePendingClassCode(): string | null {
  try {
    const code = sessionStorage.getItem(PENDING_CLASS_CODE_KEY);
    if (code) sessionStorage.removeItem(PENDING_CLASS_CODE_KEY);
    return code;
  } catch {
    return null;
  }
}
