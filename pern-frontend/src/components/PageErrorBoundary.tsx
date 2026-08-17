import React from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { showToast } from './Toast';

interface PageErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: string;
  prevResetKey?: string | number;
}

/**
 * Per-route error boundary. Catches render/lifecycle errors inside a single
 * page so the rest of the app (sidebar, header, other routes) keeps working.
 * Keying by location.pathname resets the boundary on every navigation.
 */
export class PageErrorBoundary extends React.Component<
  { children: React.ReactNode; resetKey?: string | number; pageName?: string },
  PageErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, prevResetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(
    props: { resetKey?: string | number },
    state: PageErrorBoundaryState
  ): Partial<PageErrorBoundaryState> | null {
    if (props.resetKey !== state.prevResetKey && state.hasError) {
      return { prevResetKey: props.resetKey, hasError: false, error: undefined, errorInfo: undefined };
    }
    return props.resetKey !== state.prevResetKey ? { prevResetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('PageErrorBoundary caught:', error.message, errorInfo.componentStack);
    this.setState({ errorInfo: errorInfo.componentStack || '' });
    showToast('This page hit an unexpected error.', 'error');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-panel rounded-2xl p-8 max-w-lg mx-auto mt-12 text-center animate-fade-in-up" role="alert">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-[var(--rose-dim)] text-[var(--rose)] flex items-center justify-center">
            <AlertTriangle size={26} />
          </div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">This page hit an unexpected error{this.props.pageName ? ` (${this.props.pageName})` : ''}</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-2 leading-relaxed">
            The rest of the platform is still running. You can retry the page or head back to the dashboard.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="text-left text-[11px] text-[var(--text-tertiary)] bg-black/30 p-4 rounded-[var(--radius-sm)] overflow-auto max-h-40 mt-4 whitespace-pre-wrap">
              {this.state.error.message}
              {this.state.errorInfo}
            </pre>
          )}
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--emerald)] text-white text-sm font-medium hover:bg-emerald-500 transition-colors flex items-center gap-2"
            >
              <RotateCcw size={14} /> Reload
            </button>
            <button
              onClick={() => { window.location.hash = '#/'; }}
              className="px-4 py-2 rounded-[var(--radius-sm)] bg-[var(--surface)] text-[var(--text-secondary)] text-sm font-medium border border-[var(--border)] hover:border-[var(--border-hover)] transition-colors flex items-center gap-2"
            >
              <Home size={14} /> Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
