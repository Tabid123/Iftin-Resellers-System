import React from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  isSo?: boolean;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a failed admin tab (e.g. a lazy chunk that failed to download, or a
 * render error inside one view) from taking down the whole page.
 */
export class AdminViewErrorBoundary extends React.Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error('[AdminView] render error:', error);
  }

  override render() {
    const { error } = this.state;
    const isSo = this.props.isSo ?? true;

    if (!error) return this.props.children;

    const isChunkError = /Failed to fetch dynamically imported module|Loading chunk|importing a module script failed/i.test(
      error.message || '',
    );

    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          {isSo ? 'Boggan lama soo saarin' : "This section didn't load"}
        </p>
        <p className="max-w-xs text-xs text-gray-500 dark:text-gray-400">
          {isChunkError
            ? isSo
              ? 'Isku xirka internet-ka ayaa jabay ama app-ka waa la cusboonaysiiyay. Fadlan isku day mar kale.'
              : 'The connection dropped or the app was updated. Please try again.'
            : error.message}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => this.setState({ error: null })}
            className="flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-xs font-medium text-white dark:bg-gray-100 dark:text-gray-900"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {isSo ? 'Isku day mar kale' : 'Try again'}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 dark:border-gray-600 dark:text-gray-200"
          >
            {isSo ? 'Cusboonaysii' : 'Reload'}
          </button>
        </div>
      </div>
    );
  }
}
