/**
 * Button — Defense-grade action button
 *
 * Props
 * ─────
 * variant : 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost'
 * size    : 'sm' | 'md' | 'lg'
 * loading : boolean  — shows spinner, disables interaction
 * icon    : ReactNode — optional leading icon
 * fullWidth: boolean
 */

const VARIANTS = {
  primary:
    'bg-[#1E5FA8] hover:bg-[#1A5293] active:bg-[#163f7a] text-white border border-[#2a72c0] shadow-[0_0_12px_rgba(30,95,168,0.3)]',
  secondary:
    'bg-[#0D1F38] hover:bg-[#152847] active:bg-[#0a1828] text-slate-200 border border-[#1F293D]',
  outline:
    'bg-transparent hover:bg-[#1E5FA8]/10 active:bg-[#1E5FA8]/20 text-[#7ab0fe] border border-[#1E5FA8] shadow-none',
  danger:
    'bg-[#7f1d1d] hover:bg-[#991b1b] active:bg-[#7f1d1d] text-red-100 border border-red-800/60',
  ghost:
    'bg-transparent hover:bg-white/5 active:bg-white/10 text-slate-400 hover:text-slate-200 border border-transparent shadow-none',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-[12px] gap-1.5 rounded-lg',
  md: 'px-5 py-2.5 text-[13px] gap-2 rounded-xl',
  lg: 'px-7 py-3 text-[15px] gap-2.5 rounded-xl',
}

function Spinner({ size }) {
  const dim = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'
  return (
    <svg
      className={`${dim} animate-spin shrink-0`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon = null,
  fullWidth = false,
  onClick,
  type = 'button',
  className = '',
  ...rest
}) {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      data-variant={variant}
      onClick={onClick}
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center font-bold tracking-wide',
        'transition-all duration-200 select-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E5FA8]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070F1E]',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <Spinner size={size} />
      ) : (
        icon && <span className="shrink-0">{icon}</span>
      )}
      {children}
    </button>
  )
}
