import { Component } from 'react';

export class ChatErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('Chat failed to render');
    if (error && error.name) {
      console.error(error.name);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6" data-testid="chat-error">
          <div className="text-center max-w-sm">
            <p className="text-2xl mb-2">Chat hit a problem</p>
            <p className="text-muted-foreground mb-4">
              Reload the page to try again.
            </p>
            <button
              type="button"
              className="text-primary underline font-medium"
              onClick={() => window.location.assign('/chat')}
            >
              Reload chat
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
