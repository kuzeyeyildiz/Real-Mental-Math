import React from 'react';
import { StatusScreen } from '../StatusScreen/StatusScreen';

interface State {
  error: Error | null;
}

/** Prevents an unexpected render error from leaving the student on a blank page. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <StatusScreen
          tone="error"
          title="Something went wrong"
          detail="Numo hit an unexpected problem. Reloading usually fixes it — your saved progress is safe."
          retryLabel="Reload Numo"
          onRetry={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
