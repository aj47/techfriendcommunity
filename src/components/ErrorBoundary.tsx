import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

// Without this, one throw in any query or render blanks the whole app — nav
// included — and the only way out is a manual reload. App.tsx keys this by
// pathname, so navigating away also clears it.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error("Unhandled render error", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
        <h1 className="text-lg font-semibold">This page hit an error.</h1>
        <p className="text-sm text-zinc-400">
          The rest of the site still works — try again, or head back to the latest messages.
        </p>
        <p className="overflow-x-auto rounded-md bg-zinc-950 p-3 font-mono text-xs text-zinc-500">
          {error.message || String(error)}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
          >
            Try again
          </button>
          <a href="/" className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800">
            Go to latest
          </a>
        </div>
      </div>
    );
  }
}
