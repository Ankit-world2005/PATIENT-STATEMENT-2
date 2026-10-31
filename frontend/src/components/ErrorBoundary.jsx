import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ padding: '24px', margin: '20px 0', border: '1px solid #FECACA', background: '#FEF2F2', borderRadius: '10px' }}>
          <h3 style={{ color: '#991B1B', margin: '0 0 8px 0', fontSize: '15px', fontWeight: 600 }}>
            {this.props.title || 'Unable to display this view'}
          </h3>
          <p style={{ color: '#7F1D1D', fontSize: '13px', margin: '0 0 16px 0' }}>
            {this.state.error?.message || 'An unexpected error occurred while rendering.'}
          </p>
          <button
            type="button"
            className="btn-clean-navy"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{ padding: '6px 14px', fontSize: '12.5px', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
