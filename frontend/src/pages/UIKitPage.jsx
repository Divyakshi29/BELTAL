import { useState } from 'react'
import Button from '../components/ui/Button'
import Card, { CardHeader, CardTitle, CardContent, CardFooter } from '../components/ui/Card'
import Table from '../components/ui/Table'
import Modal from '../components/ui/Modal'
import { useToast } from '../components/ui/Toast'

/* ── Sample table data ───────────────────────────────────── */
const SAMPLE_ROWS = [
  { id: 1, did: 'did:bharat:bel-8921a-9f4c', status: 'VERIFIED',  role: 'Defence Officer', ts: '2026-09-14 09:41' },
  { id: 2, did: 'did:bharat:drdo-3fc2b-7a11', status: 'PENDING',   role: 'Auditor',         ts: '2026-09-14 10:02' },
  { id: 3, did: 'did:bharat:nic-0012d-3e88',  status: 'REVOKED',   role: 'Admin',           ts: '2026-09-14 11:17' },
  { id: 4, did: 'did:bharat:mod-44a1c-8b09',  status: 'VERIFIED',  role: 'Defence Officer', ts: '2026-09-14 13:55' },
]

const STATUS_COLORS = {
  VERIFIED: 'text-emerald-400 bg-emerald-950/60 border border-emerald-800/40',
  PENDING:  'text-amber-400   bg-amber-950/60   border border-amber-800/40',
  REVOKED:  'text-red-400     bg-red-950/60     border border-red-800/40',
}

const TABLE_COLS = [
  { key: 'did',    label: 'DID Hash', render: (v) => <code className="text-[#7ab0fe] text-[11px]">{v}</code> },
  { key: 'role',   label: 'Role' },
  {
    key: 'status', label: 'Status', align: 'center',
    render: (v) => (
      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase ${STATUS_COLORS[v]}`}>
        {v}
      </span>
    ),
  },
  { key: 'ts', label: 'Timestamp', align: 'right', render: (v) => <span className="font-mono text-[11px] text-slate-500">{v}</span> },
]

/* ── Section wrapper ─────────────────────────────────────── */
function Section({ title, children }) {
  return (
    <section className="mb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-1 h-5 rounded-full bg-[#B8962E]" />
        <h2 className="text-[13px] font-bold tracking-widest uppercase text-[#1E5FA8]">{title}</h2>
      </div>
      {children}
    </section>
  )
}

/* ── Page ─────────────────────────────────────────────────── */
export default function UIKitPage() {
  const toast = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [loadingBtn, setLoadingBtn] = useState(false)

  const handleLoadingDemo = () => {
    setLoadingBtn(true)
    setTimeout(() => {
      setLoadingBtn(false)
      toast.success('DID registered on sovereign chain', 'Transaction Complete')
    }, 2000)
  }

  return (
    <div className="max-w-5xl mx-auto">

      {/* Page header */}
      <div className="mb-10 pb-5 border-b border-[#D7E0EA]">
        <span className="text-[10px] font-bold tracking-widest text-[#B8962E] uppercase">
          Issue #54 — Frontend
        </span>
        <h1 className="text-2xl font-black text-[#0D2B4E] mt-1 mb-2">
          UI Kit & Component Showcase
        </h1>
        <p className="text-[13px] text-[#65758A] max-w-2xl leading-relaxed">
          BELTAL component library. Every component uses the sovereign color
          system: Navy <code className="text-[#1E5FA8]">#0D2B4E / #1E5FA8</code>, Amber Gold{' '}
          <code className="text-[#B8962E]">#B8962E</code>, Border{' '}
          <code className="text-[#65758A]">#D7E0EA</code>.
        </p>
      </div>

      {/* ── 1. Buttons ──────────────────────────────────── */}
      <Section title="1 · Button Variants & States">
        <div className="flex flex-wrap gap-3 mb-4">
          <Button variant="primary">Primary Action</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
        </div>
        <div className="flex flex-wrap gap-3 mb-4">
          <Button size="sm" variant="primary">Small</Button>
          <Button size="md" variant="primary">Medium</Button>
          <Button size="lg" variant="primary">Large</Button>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            loading={loadingBtn}
            onClick={handleLoadingDemo}
          >
            {loadingBtn ? 'Registering DID…' : 'Register DID (Loading Demo)'}
          </Button>
          <Button variant="primary" disabled>Disabled</Button>
          <Button
            variant="primary"
            icon={<span className="material-symbols-outlined text-[16px]">shield</span>}
          >
            With Icon
          </Button>
        </div>
      </Section>

      {/* ── 2. Cards ────────────────────────────────────── */}
      <Section title="2 · Card Variants">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Card hoverable>
            <CardHeader>
              <CardTitle>Standard Card</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[13px] text-[#65758A] leading-relaxed">
                Default defense container. Hover to see the lift effect.
              </p>
            </CardContent>
          </Card>

          <Card goldAccent hoverable>
            <CardHeader>
              <CardTitle>Gold Accent Card</CardTitle>
              <span className="text-[10px] font-bold text-[#B8962E] uppercase tracking-widest">Level 5</span>
            </CardHeader>
            <CardContent>
              <p className="text-[13px] text-[#65758A] leading-relaxed">
                Navratna gold left-border strip for classified / priority items.
              </p>
            </CardContent>
            <CardFooter>
              <Button size="sm" variant="outline">View Record</Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>With Footer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-[13px] text-[#65758A]">Standard card with action footer row.</p>
            </CardContent>
            <CardFooter>
              <Button size="sm" variant="ghost">Cancel</Button>
              <Button size="sm" variant="primary">Confirm</Button>
            </CardFooter>
          </Card>
        </div>
      </Section>

      {/* ── 3. Table ────────────────────────────────────── */}
      <Section title="3 · Ledger Table">
        <Table columns={TABLE_COLS} data={SAMPLE_ROWS} />
        <p className="mt-3 text-[11px] text-[#65758A]">
          Empty state demo:
        </p>
        <Table columns={TABLE_COLS} data={[]} className="mt-2" />
      </Section>

      {/* ── 4. Modal ────────────────────────────────────── */}
      <Section title="4 · Modal Dialog">
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          Open Defense Modal
        </Button>

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Sovereign DID Verification"
          size="md"
          footer={
            <>
              <Button size="sm" variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={() => { setModalOpen(false); toast.success('DID verified on-chain') }}>
                Verify &amp; Sign
              </Button>
            </>
          }
        >
          <p className="text-[#65758A] text-[13px] leading-relaxed mb-4">
            The following Decentralized Identifier (DID) has been submitted for sovereign
            verification. Confirm cryptographic binding before on-chain commitment.
          </p>
          <div className="bg-[#070F1E] border border-[#1E2E48] rounded-xl p-4 font-mono text-[12px] text-[#7ab0fe] break-all">
            did:bharat:bel-8921a-9f4c-b301-0a2f91de3172
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-[12px]">
            {[
              ['Role',      'Defence Officer'],
              ['Issued By', 'BEL Genesis Core'],
              ['Clearance', 'Level 5 — Top Secret'],
              ['Expires',   '2027-09-14'],
            ].map(([k, v]) => (
              <div key={k} className="bg-[#0D1F38] rounded-lg p-3">
                <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-0.5">{k}</p>
                <p className="text-slate-200 font-semibold">{v}</p>
              </div>
            ))}
          </div>
        </Modal>
      </Section>

      {/* ── 5. Toast ────────────────────────────────────── */}
      <Section title="5 · Toast Notifications">
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="sm"
            icon={<span className="material-symbols-outlined text-[15px]">check_circle</span>}
            onClick={() => toast.success('DID registered on sovereign chain', 'Transaction Complete')}
          >
            Success Toast
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => toast.error('Node sync failed — retry in 30s', 'Sync Error')}
          >
            Error Toast
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => toast.warning('JWT token expiring in 5 minutes', 'Session Warning')}
          >
            Warning Toast
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info('Ledger block #4,928,193 confirmed', 'Block Confirmed')}
          >
            Info Toast
          </Button>
        </div>
      </Section>
    </div>
  )
}
