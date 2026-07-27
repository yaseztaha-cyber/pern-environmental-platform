import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error.message, errorInfo.componentStack);
    this.setState({ errorInfo: errorInfo.componentStack || '' });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-8 text-center max-w-2xl mx-auto">
          <div className="text-red-400 text-xl mb-2">Something went wrong</div>
          <div className="text-sm text-slate-400 mb-2">{this.state.error?.message}</div>
          {import.meta.env.DEV && this.state.errorInfo && (
            <pre className="text-left text-xs text-slate-500 bg-black/30 p-4 rounded-xl overflow-auto max-h-60 mt-4 whitespace-pre-wrap">
              {this.state.errorInfo}
            </pre>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: undefined, errorInfo: undefined })}
            className="mt-4 px-4 py-2 bg-white/10 rounded-2xl text-sm"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}