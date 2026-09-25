/**
 * Card — Defense-grade content container
 *
 * Exports: Card, CardHeader, CardTitle, CardContent, CardFooter
 *
 * Props (Card)
 * ────────────
 * goldAccent : boolean — shows a 3px amber left border strip
 * hoverable  : boolean — lift + glow on hover
 * className  : string
 */

/* ── Sub-components ─────────────────────────────────────── */
export function CardHeader({ children, className = '' }) {
  return (
    <div
      className={`flex items-center justify-between px-5 py-4 border-b border-[#D7E0EA] ${className}`}
    >
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }) {
  return (
    <h3
      className={`text-[14px] font-bold tracking-widest uppercase text-[#0D2B4E] ${className}`}
    >
      {children}
    </h3>
  )
}

export function CardContent({ children, className = '' }) {
  return (
    <div className={`px-5 py-4 ${className}`}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className = '' }) {
  return (
    <div
      className={`flex items-center justify-end gap-3 px-5 py-3 border-t border-[#D7E0EA] ${className}`}
    >
      {children}
    </div>
  )
}

/* ── Main Card ──────────────────────────────────────────── */
export default function Card({
  children,
  goldAccent = false,
  hoverable = false,
  className = '',
  ...rest
}) {
  return (
    <div
      className={[
        'bg-[#FFFDF8] border border-[#D7E0EA] rounded-xl shadow-[0_5px_18px_rgba(13,43,78,0.07)] overflow-hidden',
        goldAccent ? 'border-l-[3px] border-l-[#B8962E]' : '',
        hoverable
          ? 'transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(13,43,78,0.12)] hover:border-[#B9CCE6]'
          : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
}
