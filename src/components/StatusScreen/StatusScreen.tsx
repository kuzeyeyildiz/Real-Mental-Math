import s from './StatusScreen.module.css';

interface StatusScreenProps {
  title: string;
  detail?: string;
  tone?: 'neutral' | 'error';
  onRetry?: () => void;
  retryLabel?: string;
  busy?: boolean;
  /** Sized to sit inside a panel rather than to fill the page. */
  compact?: boolean;
  children?: React.ReactNode;
}

export function StatusScreen({
  title,
  detail,
  tone = 'neutral',
  onRetry,
  retryLabel = 'Try again',
  busy = false,
  compact = false,
  children,
}: StatusScreenProps) {
  return (
    <div className={`${s.wrap} ${compact ? s.wrapCompact : ''}`} role="status" aria-live="polite">
      <div className={s.card}>
        {tone === 'error' && <div className={s.icon} aria-hidden="true">!</div>}
        {tone === 'neutral' && <div className={s.spinner} aria-hidden="true" />}
        <h2 className={`${s.title} ${tone === 'error' ? s.titleError : ''}`}>{title}</h2>
        {detail && <p className={s.detail}>{detail}</p>}
        {children}
        {onRetry && (
          <button className={s.retry} onClick={onRetry} disabled={busy}>
            {busy ? 'Retrying…' : retryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default StatusScreen;
