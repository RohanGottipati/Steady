"use client";

import { Component, type ReactNode } from "react";

interface State {
  failed: boolean;
  message: string;
}

/** Keeps a render crash on the train/replay screen from blanking the page. */
export class SessionBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : "This screen hit a problem.";
    return { failed: true, message };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        role="alert"
        data-testid="session-recovery"
        className="mt-8 space-y-3 rounded-xl border border-amber-400 bg-amber-50 p-5 text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
      >
        <p className="font-medium">This screen hit a problem. You can try it again or return to the library.</p>
        <p className="text-sm">{this.state.message}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            data-testid="retry-session-screen"
            className="rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white"
            onClick={() => this.setState({ failed: false, message: "" })}
          >
            Try this screen again
          </button>
          <a href="/library" className="rounded-md border border-amber-500 px-4 py-2 text-sm font-medium">
            Back to library
          </a>
        </div>
      </div>
    );
  }
}
