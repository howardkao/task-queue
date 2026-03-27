import { useState, useCallback, createContext, useContext } from 'react';

interface ToastMessage {
  id: number;
  text: string;
  type: 'error' | 'success';
}

interface ToastContextValue {
  showToast: (text: string, type?: 'error' | 'success') => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((text: string, type: 'error' | 'success' = 'error') => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: '20px', right: '20px',
        display: 'flex', flexDirection: 'column', gap: '8px',
        zIndex: 1000,
      }}>
        {toasts.map(toast => (
          <div
            key={toast.id}
            style={{
              padding: '12px 18px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#fff',
              background: toast.type === 'error' ? '#FF6B6B' : '#4ade80',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              animation: 'slideIn 0.2s ease',
              maxWidth: '320px',
            }}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
