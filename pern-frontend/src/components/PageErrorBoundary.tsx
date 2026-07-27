import React from 'react';

interface Props {
  children: React.ReactNode;
  pageName?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class PageErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) console.error(`[PageErrorBoundary] Error in ${this.props.pageName || 'page'}:`, error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-slate-400 mb-6">
              An error occurred in {this.props.pageName || 'this page'}.
            </p>
            <button 
              onClick={() => this.setState({ hasError: false })}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-2xl text-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}