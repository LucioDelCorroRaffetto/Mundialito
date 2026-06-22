import { Component, ReactNode, ErrorInfo } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

const RELOAD_KEY = 'mundialito_chunk_reload_attempt';

/**
 * Recognises errors that happen because the user has a stale index.html
 * still referencing chunk hashes from a previous deploy. These need a
 * full page reload to pull fresh asset URLs — re-rendering inside the
 * boundary does nothing because the module specifier is permanently gone.
 */
function isStaleChunkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message ?? '';
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\w\d_-]+ failed/i.test(msg) ||
    /MIME type/i.test(msg) ||
    /not a valid JavaScript MIME type/i.test(msg)
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
    // Defence-in-depth: lazyWithReload should already have caught these,
    // but if anything slips through (e.g. an error thrown during render of
    // an already-loaded module that itself referenced a stale dynamic
    // import), trigger one reload here. The sessionStorage flag prevents
    // an infinite reload loop on genuine app bugs.
    if (isStaleChunkError(error) && !sessionStorage.getItem(RELOAD_KEY)) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      window.location.reload();
    }
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center h-40 text-muted gap-3 px-4 text-center"
        >
          <span className="text-3xl" aria-hidden="true">⚠️</span>
          <p className="text-sm text-text">Algo salió mal. Intentá recargar.</p>
          <button
            type="button"
            className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-md bg-elevated border border-border text-text text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            onClick={() => {
              sessionStorage.removeItem(RELOAD_KEY);
              window.location.reload();
            }}
          >
            Recargar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
