import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorScreen } from '../ErrorScreen/ErrorScreen';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render errors anywhere below it and shows a way back to safety. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorScreen
          message="An unexpected error occurred. Try heading back home."
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}
