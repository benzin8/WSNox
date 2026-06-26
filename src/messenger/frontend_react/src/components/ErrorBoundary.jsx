import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  handleReload = () => {
    // Unregister service workers to clear potentially stale caches
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100%', background: 'var(--color-zinc-950)',
          color: 'var(--color-zinc-100)', fontFamily: 'system-ui, sans-serif', padding: 24,
          textAlign: 'center',
        }}>
          <p style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            Что-то пошло не так
          </p>
          <p style={{ fontSize: 15, color: 'var(--color-zinc-400)', marginBottom: 20, maxWidth: 320, lineHeight: 1.5 }}>
            Бывает. Обычно помогает обновить — сообщения и данные на месте, ничего не потеряется.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: 'var(--color-lime-400)', color: '#18181b', fontWeight: 600,
              fontSize: 15, cursor: 'pointer',
            }}
          >
            Обновить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
