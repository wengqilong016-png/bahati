import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f5f5f5',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 32,
              maxWidth: 400,
              width: '100%',
              boxShadow: '0 2px 16px rgba(0,0,0,0.1)',
            }}
          >
            <h2 style={{ color: '#CC0000', margin: '0 0 12px', fontSize: 20 }}>
              Something went wrong
            </h2>
            {this.state.message && (
              <p
                style={{
                  color: '#666',
                  fontSize: 13,
                  fontFamily: 'monospace',
                  background: '#f9f0f0',
                  padding: '8px 12px',
                  borderRadius: 6,
                  wordBreak: 'break-word',
                  margin: '0 0 20px',
                }}
              >
                {this.state.message}
              </p>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px',
                background: '#0066CC',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
