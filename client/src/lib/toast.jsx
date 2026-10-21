import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const show = useCallback((message, tone = 'success') => {
    clearTimeout(timer.current);
    setToast({ message, tone, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 4200);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={`toast-banner ${toast ? 'show' : ''} ${toast?.tone === 'error' ? 'toast-error' : ''}`} role="status" aria-live="polite">
        {toast && (
          <>
            {toast.tone === 'error' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2.5" aria-hidden="true">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" aria-hidden="true">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
            <span>{toast.message}</span>
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
