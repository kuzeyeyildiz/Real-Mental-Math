import { StatusScreen } from '../StatusScreen/StatusScreen';

/**
 * Loading and failure states sized for a panel inside a page. Kept together so
 * every classroom panel reports trouble the same way — and always reports it,
 * rather than rendering as empty.
 */

export function PanelLoading({ label }: { label: string }) {
  return <StatusScreen compact title={label} />;
}

export function PanelError({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return <StatusScreen compact tone="error" title={title} detail={message} onRetry={onRetry} />;
}
