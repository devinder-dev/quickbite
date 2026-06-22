import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

// A backstop, not the fix for any specific bug — render errors anywhere
// below this (a bad localStorage shape, a malformed API response, anything
// unanticipated) should never silently unmount the whole app to a blank
// white page. Catching it here means there's always SOMETHING visible to
// react to, instead of a page that looks like it just didn't load.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("❌ unhandled render error", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <p>Something went wrong displaying this page.</p>
          <button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
