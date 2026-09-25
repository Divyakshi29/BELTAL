import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react'

/**
 * Toast / Notification system
 *
 * Usage (imperative via hook):
 *   const toast = useToast()
 *   toast.success('DID registered on sovereign chain')
 *   toast.error('Node sync failed')
 *   toast.warning('Token expiring soon')
 *   toast.info('Ledger sync in progress')
 *
 * Setup: wrap your app in <ToastProvider> once (already done in main.jsx or App.jsx).
 */

/* ── Config ────────────────────────────────────────────── */
const TOAST_DURATION = 5000  // ms before auto-dismiss

const STYLES = {
  success: {
    bar:   'bg-emerald-500',
    bg:    'bg-[#0B1E16] border-emerald-700/40',
    icon:  'verified',
    color: 'text-emerald-400',
    label: 'text-emerald-300',
  },
  danger: {
    bar:   'bg-red-600',
    bg:    'bg-[#1A0A0A] border-red-800/40',
    icon:  'gpp_bad',
    color: 'text-red-400',
    label: 'text-red-300',
  },
  warning: {
    bar:   'bg-amber-500',
    bg:    'bg-[#1A1306] border-amber-700/40',
    icon:  'warning',
    color: 'text-amber-400',
    label: 'text-amber-300',
  },
  info: {
    bar:   'bg-[#1E5FA8]',
    bg:    'bg-[#06111E] border-[#1E3E62]/60',
    icon:  'info',
    color: 'text-[#7ab0fe]',
    label: 'text-slate-300',
  },
}

/* ── Context ────────────────────────────────────────────── */
const ToastContext = createContext(null)

/* ── Single Toast pill ──────────────────────────────────── */
function ToastItem({ id, type = 'info', title, message, onDismiss }) {
  const [exiting, setExiting] = useState(false)
  const s = STYLES[type] ?? STYLES.info

  const dismiss = useCallback(() => {
    setExiting(true)
    setTimeout(() => onDismiss(id), 280)
  }, [id, onDismiss])

  useEffect(() => {
    const t = setTimeout(dismiss, TOAST_DURATION)
    return () => clearTimeout(t)
  }, [dismiss])

  return (
    <div
      role="alert"
      style={{
        animation: exiting
          ? 'toastOut 280ms ease forwards'
          : 'toastIn 280ms cubic-bezier(0.16,1,0.3,1)',
      }}
      className={`relative flex items-start gap-3 w-80 rounded-xl border shadow-[0_8px_32px_rgba(0,0,0,0.6)]
        pl-1 pr-4 py-3 overflow-hidden ${s.bg}`}
    >
      {/* Left accent bar */}
      <span className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${s.bar}`} />

      {/* Icon */}
      <div className={`shrink-0 mt-0.5 ml-2 ${s.color}`}>
        <span
          className="material-symbols-outlined text-[22px]"
          style={{ fontVariationSettings: '"FILL" 1' }}
        >
          {s.icon}
        </span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        {title && (
          <p className={`text-[12px] font-bold tracking-wide mb-0.5 ${s.label}`}>
            {title}
          </p>
        )}
        <p className="text-[12px] text-slate-400 leading-snug">{message}</p>
      </div>

      {/* Close */}
      <button
        onClick={dismiss}
        aria-label="Dismiss notification"
        className="shrink-0 mt-0.5 text-slate-500 hover:text-slate-200 transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

/* ── Provider ───────────────────────────────────────────── */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const add = useCallback((type, message, title) => {
    const id = `toast-${Date.now()}-${Math.random()}`
    setToasts((prev) => [...prev, { id, type, message, title }])
  }, [])

  const remove = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // Keep the context value stable when the toast list changes. Consumers such
  // as IdentityTable use it in effect dependencies; recreating this object on
  // every toast caused failed requests to continually refetch and add toasts.
  const api = useMemo(() => ({
    success: (msg, title) => add('success', msg, title),
    error:   (msg, title) => add('danger',  msg, title),
    warning: (msg, title) => add('warning', msg, title),
    info:    (msg, title) => add('info',    msg, title),
  }), [add])

  /* Listen for session-expired event from api.js */
  useEffect(() => {
    const handler = () =>
      add('danger', 'Your session has expired. Please log in again.', 'Session Expired')
    window.addEventListener('beltal:session-expired', handler)
    return () => window.removeEventListener('beltal:session-expired', handler)
  }, [add])

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Toast stack — fixed bottom-right */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem {...t} onDismiss={remove} />
          </div>
        ))}
      </div>

      <style>{`
        @keyframes toastIn  { from { opacity:0; transform:translateX(28px); } to { opacity:1; transform:translateX(0); } }
        @keyframes toastOut { from { opacity:1; transform:translateX(0);    } to { opacity:0; transform:translateX(28px); } }
      `}</style>
    </ToastContext.Provider>
  )
}

/* ── Hook ───────────────────────────────────────────────── */
export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

export default ToastProvider
