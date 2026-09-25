import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import useModalA11y from '../../hooks/useModalA11y';

const TONES = {
    danger: { icon: 'text-red-600', button: 'bg-red-600 hover:bg-red-700' },
    warning: { icon: 'text-amber-600', button: 'bg-amber-600 hover:bg-amber-700' },
    primary: { icon: 'text-[#1E5FA8]', button: 'bg-[#1E5FA8] hover:bg-[#164a85]' },
};

/**
 * Modal confirmation for consequential actions (emergency lockdown, executing a
 * recovery, ...). Escape and the backdrop cannot dismiss it while `busy`, since
 * these actions usually wait on a blockchain transaction.
 */
export default function ConfirmDialog({
    title,
    icon = 'help',
    tone = 'primary',
    confirmLabel = 'Confirm',
    busy = false,
    busyText = 'Waiting for the blockchain. This can take up to a minute.',
    disabled = false,
    onConfirm,
    onClose,
    children,
}) {
    const dialogRef = useModalA11y(() => {
        if (!busy) onClose();
    });
    const t = TONES[tone] || TONES.primary;

    // Lock page scrolling while the dialog is mounted
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    return createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 ui-fade-in">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[92vh] ui-pop-in"
            >
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-xl ${t.icon}`} aria-hidden="true">{icon}</span>
                        <h2 id="confirm-dialog-title" className="text-sm font-black text-[#0A1F3D]">{title}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        aria-label="Close dialog"
                        className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
                    </button>
                </div>

                <div className="p-4 space-y-4 text-sm text-slate-800 overflow-y-auto">
                    {children}
                    {busy && (
                        <p className="flex items-center gap-2 text-[11px] text-slate-500" role="status">
                            <span className="material-symbols-outlined animate-spin text-[16px]" aria-hidden="true">progress_activity</span>
                            {busyText}
                        </p>
                    )}
                </div>

                <div className="flex gap-3 p-4 border-t border-slate-200 bg-slate-50">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-white transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy || disabled}
                        className={`flex-1 rounded-lg px-4 py-2 text-sm font-bold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${t.button}`}
                    >
                        {busy ? 'Processing…' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
