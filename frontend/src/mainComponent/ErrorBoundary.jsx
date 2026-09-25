import { Component } from 'react';

/*
  [2.37.2] Error Boundary для диагностики. Ловит ошибки рендера
  Chat.jsx (и всего дерева) и отправляет в логи Amvera с
  component stack. React 19 не всегда триггерит window.onerror
  при ошибках рендера — этот барьер работает надёжнее.
*/

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    const err = error || {};
    const msg = err.message || String(err);
    const stack = err.stack || '';
    const componentStack = (info && info.componentStack) || '';

    if (typeof window !== 'undefined' && typeof window.__clientLog === 'function') {
      window.__clientLog(
        'react-error-boundary',
        `${msg}\n\n--- component stack ---\n${componentStack}`,
        stack
      );
    }

    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  handleReload = () => {
    try { window.location.reload(); } catch { /* noop */ }
  };

  render() {
    if (this.state.hasError) {
      const msg = (this.state.error && this.state.error.message) || 'unknown';
      return (
        <div style={{
          padding: '32px 20px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          background: '#F5A9C0',
          color: '#111',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}>
          <h2 style={{ margin: 0 }}>Что-то сломалось</h2>
          <p style={{ opacity: 0.7, margin: 0, maxWidth: 400 }}>
            Ошибка отправлена в лог. Попробуй перезагрузить страницу.
          </p>
          <code style={{
            fontSize: 11,
            background: 'rgba(0,0,0,0.08)',
            padding: '6px 10px',
            borderRadius: 8,
            maxWidth: '90vw',
            overflowWrap: 'anywhere',
          }}>
            {msg.slice(0, 200)}
          </code>
          <button
            onClick={this.handleReload}
            style={{
              padding: '12px 26px',
              borderRadius: 22,
              background: '#3BB5E8',
              color: '#FFF',
              border: '3px solid #111',
              fontWeight: 800,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;