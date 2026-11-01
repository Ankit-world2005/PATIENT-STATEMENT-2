import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { ToastProvider } from './lib/toast.jsx';
import './styles/base.css';
import './styles/app.css';

// No <StrictMode>: its double-run effects would record each statement view and
// print twice in the audit log during development.
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <ErrorBoundary title="An application error occurred">
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </BrowserRouter>,
);
