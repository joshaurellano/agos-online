import { Component } from 'react';
import { logger } from '../lib/logger';

// Catches render errors so one broken page shows a message instead of a
// blank screen. MainLayout keys it by route, so moving to another page
// clears the error.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    logger.error('Page crashed:', error?.message, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="card" role="alert" style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center' }}>
        <h2 className="registry-dialog-title">Something went wrong</h2>
        <p className="settings-desc" style={{ marginBottom: 16 }}>This page failed to load.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
          <a href="/dashboard" className="btn btn-ghost" style={{ textDecoration: 'none' }}>Dashboard</a>
        </div>
      </div>
    );
  }
}
