import { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
import TransactionToast from '../components/TransactionToast';

const TransactionContext = createContext();

export function TransactionProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(0);

    const showToast = useCallback((type, message, duration) => {
        const id = ++nextId.current;
        setToasts(prev => [...prev, { id, type, message, duration }]);
        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    const showPending = useCallback((message) => {
        return showToast('pending', message, 0); // Don't auto-close pending
    }, [showToast]);

    const showSuccess = useCallback((message, duration) => {
        return showToast('success', message, duration || 5000);
    }, [showToast]);

    const showError = useCallback((message, duration) => {
        return showToast('error', message, duration || 5000);
    }, [showToast]);

    // Stable identity so consumers can safely list these helpers in effect deps.
    const value = useMemo(
        () => ({ showPending, showSuccess, showError, removeToast }),
        [showPending, showSuccess, showError, removeToast]
    );

    return (
        <TransactionContext.Provider value={value}>
            {children}
            <div className="fixed top-4 right-4 z-[100000] space-y-2">
                {toasts.map(toast => (
                    <TransactionToast
                        key={toast.id}
                        type={toast.type}
                        message={toast.message}
                        onClose={() => removeToast(toast.id)}
                        duration={toast.duration}
                    />
                ))}
            </div>
        </TransactionContext.Provider>
    );
}

export function useTransaction() {
    const context = useContext(TransactionContext);
    if (!context) {
        throw new Error('useTransaction must be used within TransactionProvider');
    }
    return context;
}