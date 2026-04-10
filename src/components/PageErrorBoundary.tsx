import React from 'react';

type Props = {
  pageLabel: string;
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
  stack: string;
};

export class PageErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '', stack: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
      stack: '',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error(`[${this.props.pageLabel}] render failure`, error);
    this.setState({ stack: info.componentStack || '' });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-[60vh] items-center justify-center bg-zinc-950 px-6 text-zinc-100">
          <div className="w-full max-w-xl rounded-2xl border border-red-500/40 bg-red-950/20 p-6">
            <h2 className="text-lg font-semibold text-red-200">Unable to render {this.props.pageLabel}</h2>
            <p className="mt-2 text-sm text-zinc-300">
              A runtime rendering error occurred. Refresh the page to retry.
            </p>
            {this.state.message ? (
              <p className="mt-2 rounded border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-xs text-zinc-300">
                Error: {this.state.message}
              </p>
            ) : null}
            {this.state.stack ? (
              <pre className="mt-2 max-h-28 overflow-auto rounded border border-zinc-700 bg-zinc-900/70 p-2 text-[10px] text-zinc-400">
                {this.state.stack}
              </pre>
            ) : null}
            <div className="mt-4">
              <a
                href="/dashboard"
                className="inline-flex rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-800"
              >
                Go to Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
