import { useEffect, useRef } from 'react';

export default function TransactionToast({ type, message, onClose, duration = 5000 }) {
    // Read the latest onClose through a ref so a parent re-render (which hands
    // down a fresh callback) does not restart the auto-dismiss timer.
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        // A zero duration means the toast stays until it is dismissed (pending).
        if (!duration) return undefined;
        const timer = setTimeout(() => onCloseRef.current(), duration);
        return () => clearTimeout(timer);
    }, [duration]);

    const getStyles = () => {
        switch (type) {
            case 'success':
                return 'bg-emerald-900/90 border-emerald-600 text-emerald-100';
            case 'error':
                return 'bg-red-900/90 border-red-600 text-red-100';
            case 'pending':
                return 'bg-amber-900/90 border-amber-600 text-amber-100';
            default:
                return 'bg-slate-800/90 border-slate-600 text-slate-100';
        }
    };

    const getIcon = () => {
        switch (type) {
            case 'success':
                return 'check_circle';
            case 'error':
                return 'error';
            case 'pending':
                return 'schedule';
            default:
                return 'info';
        }
    };

    return (
        <div
            role={type === 'error' ? 'alert' : 'status'}
            className={`flex items-start gap-3 p-4 rounded-lg border shadow-2xl max-w-md ${getStyles()}`}
        >
            <span className="material-symbols-outlined text-[20px] mt-0.5" aria-hidden="true">
                {getIcon()}
            </span>
            <div className="flex-1">
                <p className="text-sm font-bold">{type === 'pending' ? 'Processing...' : type === 'success' ? 'Success!' : 'Error'}</p>
                <p className="text-xs mt-1 opacity-90">{message}</p>
            </div>
            <button
                type="button"
                onClick={onClose}
                aria-label="Dismiss notification"
                className="text-white/60 hover:text-white transition-colors"
            >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">close</span>
            </button>
        </div>
    );
}
