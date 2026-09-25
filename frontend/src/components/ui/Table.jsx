/**
 * Table — Institutional ledger table
 *
 * Props
 * ─────
 * columns : Array<{ key, label, align?, render? }>
 * data    : Array<object>
 * loading : boolean
 * emptyMessage: string
 *
 * Usage:
 *   <Table
 *     columns={[
 *       { key: 'did', label: 'DID Hash', render: v => <code>{v}</code> },
 *       { key: 'status', label: 'Status', align: 'center' },
 *     ]}
 *     data={rows}
 *   />
 */

function SkeletonRow({ cols }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 rounded bg-[#1E2E48] animate-pulse w-3/4" />
        </td>
      ))}
    </tr>
  )
}

export default function Table({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = 'No records found on the sovereign ledger.',
  className = '',
}) {
  return (
    <div
      className={`w-full overflow-x-auto rounded-xl border border-[#1E2E48] bg-[#070F1E]
        [&::-webkit-scrollbar]:h-1.5
        [&::-webkit-scrollbar-track]:bg-[#0D1F38]
        [&::-webkit-scrollbar-thumb]:bg-[#1E5FA8]/60
        [&::-webkit-scrollbar-thumb]:rounded-full
        ${className}`}
    >
      <table className="w-full min-w-[640px] text-[13px]">
        {/* Head */}
        <thead>
          <tr className="border-b border-[#1E2E48] bg-[#0D1F38]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-[10px] font-bold tracking-widest uppercase text-[#7ab0fe] whitespace-nowrap
                  ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} cols={columns.length} />
            ))
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-slate-500 text-[13px]"
              >
                <span className="material-symbols-outlined text-[32px] block mb-2 opacity-30">
                  table_rows
                </span>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => (
              <tr
                key={row.id ?? rowIdx}
                className={`border-b border-[#1E2E48]/60 transition-colors duration-150
                  ${rowIdx % 2 === 0 ? 'bg-[#070F1E]' : 'bg-[#0A1628]/60'}
                  hover:bg-[#0D2245]/80`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-slate-300 whitespace-nowrap
                      ${col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {col.render ? col.render(row[col.key], row) : row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
