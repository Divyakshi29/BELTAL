import { useEffect, useRef } from 'react'

/**
 * Modal — Accessible dialog with backdrop blur & enter animation
 *
 * Props
 * ─────
 * open       : boolean
 * onClose    : () => void
 * title      : string
 * size       : 'sm' | 'md' | 'lg' | 'xl'
 * footer     : ReactNode
 * children   : ReactNode
 */

const SIZE_MAP = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export default function Modal({
  open,
  onClose,
  title,
  size = 'md',
  footer,
  children,
}) {
  const panelRef = useRef(null)

  /* Close on Escape */
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  /* Trap focus on open */
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  /* Prevent body scroll while open */
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#020812]/80 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{ animation: 'modalIn 200ms cubic-bezier(0.16,1,0.3,1)' }}
        className={[
          'beltal-modal relative w-full rounded-2xl outline-none',
          'bg-[#0B1726] border border-[#1E2E48] shadow-[0_24px_64px_rgba(0,0,0,0.7)]',
          'flex flex-col max-h-[90vh]',
          SIZE_MAP[size] ?? SIZE_MAP.md,
        ].join(' ')}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2E48] shrink-0">
          <div className="flex items-center gap-3">
            {/* Gold accent mark */}
            <span className="w-1 h-5 rounded-full bg-[#D4AF37] shrink-0" />
            <h2
              id="modal-title"
              className="text-[15px] font-bold text-slate-100 tracking-wide"
            >
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-all"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="w-4 h-4"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 text-slate-300 text-[14px] leading-relaxed">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1E2E48] shrink-0">
            {footer}
          </div>
        )}
      </div>

      {/* Keyframe injection */}
      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  )
}
