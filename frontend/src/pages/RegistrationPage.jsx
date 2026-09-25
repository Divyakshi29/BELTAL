/**
 * RegistrationPage — onboarding for a wallet that signed in but has no
 * registered identity yet.
 *
 * The wallet holds a limited session (no role). It can only submit a
 * registration request and check its status; an ADMIN approves it and chooses
 * the role, so nothing here lets the user pick one. Once approved, the status
 * endpoint hands back a full session and the user is sent to their portal.
 */
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth, roleHomePath, shortenAddress } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { authApi } from '../services/api';

const SBU_OPTIONS = [
  ['SBU_RADAR', 'Radar'],
  ['SBU_EW', 'Electronic Warfare'],
  ['SBU_MILCOMM', 'Military Communication'],
  ['SBU_CYBER', 'Cyber Security'],
];
const SBU_LABELS = Object.fromEntries(SBU_OPTIONS);
const POLL_MS = 10_000;

const inputClass =
  'w-full rounded-lg border border-[#B9DCEF] bg-white px-3 py-2 text-sm text-[#0A1F3D] outline-none focus:border-[#1E5FA8]';
const labelClass = 'mb-1 block text-[11px] font-bold uppercase tracking-widest text-[#4A5568]';

function RegistrationForm({ initial, bootstrapAdmin, onSubmit }) {
  const [form, setForm] = useState({
    fullName: initial?.fullName ?? '',
    externalId: initial?.externalId ?? '',
    requestedSbu: initial?.requestedSbu ?? '',
    note: initial?.note ?? '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ ...form, note: form.note.trim() || undefined });
    } catch (err) {
      setError(err?.uiMessage || 'Could not submit your registration. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-[#0A1F3D]">Register your identity</h1>
        <p className="mt-1 text-sm text-[#4A5568]">
          This wallet is verified but not yet registered with BELTAL. Submit your details for administrator approval.
          Your role and clearance are assigned by the administrator.
        </p>
      </div>

      {bootstrapAdmin && (
        <p role="status" className="rounded-lg border border-[#C8A74C]/50 bg-[#FFF8E1] px-3 py-2 text-xs font-semibold text-[#7A5C00]">
          This wallet is on the administrator allow-list — submitting registers you as an Administrator immediately.
        </p>
      )}

      <div>
        <label htmlFor="reg-full-name" className={labelClass}>Full name</label>
        <input id="reg-full-name" required minLength={2} maxLength={120} value={form.fullName} onChange={set('fullName')} className={inputClass} />
      </div>
      <div>
        <label htmlFor="reg-employee-id" className={labelClass}>Employee ID</label>
        <input id="reg-employee-id" required maxLength={64} value={form.externalId} onChange={set('externalId')} className={inputClass} />
      </div>
      <div>
        <label htmlFor="reg-sbu" className={labelClass}>Strategic business unit</label>
        <select id="reg-sbu" required value={form.requestedSbu} onChange={set('requestedSbu')} className={inputClass}>
          <option value="" disabled>Select your SBU</option>
          {SBU_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="reg-note" className={labelClass}>Note for the administrator (optional)</label>
        <textarea id="reg-note" rows={3} maxLength={500} value={form.note} onChange={set('note')} className={`${inputClass} resize-none`} />
      </div>

      {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-[#1E5FA8] py-3 text-sm font-black tracking-wide text-white transition-colors hover:bg-[#1a5299] disabled:opacity-60"
      >
        {submitting ? 'Submitting…' : 'Submit registration'}
      </button>
    </form>
  );
}

function RequestSummary({ request }) {
  const rows = [
    ['Full name', request.fullName],
    ['Employee ID', request.externalId],
    ['SBU', SBU_LABELS[request.requestedSbu] ?? request.requestedSbu],
  ];
  return (
    <dl className="mt-5 divide-y divide-[#E3EEF8] rounded-lg border border-[#B9DCEF] text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 px-3 py-2">
          <dt className="font-semibold text-[#4A5568]">{label}</dt>
          <dd className="text-right font-bold text-[#0A1F3D]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PendingView({ request, onRefresh }) {
  return (
    <div>
      <span className="material-symbols-outlined text-[36px] text-[#C8A74C]" style={{ fontVariationSettings: '"FILL" 1' }}>hourglass_top</span>
      <h1 className="mt-2 text-xl font-black text-[#0A1F3D]">Pending admin approval</h1>
      <p className="mt-1 text-sm text-[#4A5568]">
        Your request has been sent to the administrators. This page checks for a decision automatically.
      </p>
      <RequestSummary request={request} />
      <button
        type="button"
        onClick={onRefresh}
        className="mt-5 rounded-lg border border-[#1E5FA8] px-4 py-2 text-sm font-bold text-[#1E5FA8] hover:bg-[#1E5FA8]/10"
      >
        Check status now
      </button>
    </div>
  );
}

function RejectedView({ request, onResubmit }) {
  return (
    <div>
      <span className="material-symbols-outlined text-[36px] text-red-500" style={{ fontVariationSettings: '"FILL" 1' }}>gpp_bad</span>
      <h1 className="mt-2 text-xl font-black text-[#0A1F3D]">Registration rejected</h1>
      <p className="mt-1 text-sm text-[#4A5568]">An administrator declined your request.</p>
      <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        <span className="font-bold">Reason: </span>{request.rejectionReason || 'No reason was given.'}
      </p>
      <button
        type="button"
        onClick={onResubmit}
        className="mt-5 rounded-xl bg-[#1E5FA8] px-5 py-2.5 text-sm font-black text-white hover:bg-[#1a5299]"
      >
        Submit a new request
      </button>
    </div>
  );
}

export default function RegistrationPage() {
  const { user, isAuthenticated, applySession, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  // status: LOADING | NONE | PENDING | REJECTED (APPROVED never renders — it signs the user in)
  const [state, setState] = useState({ status: 'LOADING' });
  const [resubmitting, setResubmitting] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const limited = isAuthenticated && !user.isRegistered;

  const enterPortal = useCallback(
    (session) => {
      applySession(session.token, session.user);
      toast.success('Your registration is approved.', 'Welcome');
      navigate(roleHomePath(session.user.role) ?? '/', { replace: true });
    },
    [applySession, navigate, toast]
  );

  const refresh = useCallback(async () => {
    try {
      const data = await authApi.registrationStatus();
      setLoadError(null);
      if (data.status === 'APPROVED') enterPortal(data);
      else setState(data);
    } catch (err) {
      setLoadError(err?.uiMessage || 'Could not check registration status.');
    }
  }, [enterPortal]);

  useEffect(() => {
    if (limited) refresh();
  }, [limited, refresh]);

  useEffect(() => {
    if (!limited || state.status !== 'PENDING') return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [limited, state.status, refresh]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user.isRegistered) return <Navigate to={roleHomePath(user.role) ?? '/'} replace />;

  const handleSubmit = async (payload) => {
    const data = await authApi.register(payload);
    if (data.status === 'APPROVED') return enterPortal(data);
    setState((prev) => ({ ...prev, status: data.status, request: data.request }));
    setResubmitting(false);
  };

  // A bootstrap admin whose earlier auto-approval failed stays PENDING; let them retry.
  const showForm =
    resubmitting || state.status === 'NONE' || (state.status === 'PENDING' && state.bootstrapAdmin);

  return (
    <div className="min-h-screen bg-[#E8F1FB] text-[#0A1F3D]">
      <header className="flex h-16 items-center justify-between border-b border-[#B9DCEF] bg-[#FFFDF5] px-4 sm:px-6">
        <p className="text-xl font-black tracking-wider"><span className="text-[#0B2545]">BEL</span><span className="text-[#1565C0]">TAL</span></p>
        <div className="flex items-center gap-3">
          <code className="hidden text-xs font-bold text-[#4A5568] sm:inline">{shortenAddress(user.walletAddress)}</code>
          <button
            type="button"
            onClick={() => { logout(); navigate('/'); }}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-10">
        <section className="rounded-2xl border border-[#B9DCEF] bg-white p-6 shadow-sm">
          {state.status === 'LOADING' && !loadError && <p className="text-sm text-[#4A5568]">Checking registration status…</p>}
          {loadError && (
            <p role="alert" className="mb-4 text-sm font-semibold text-red-600">
              {loadError}{' '}
              <button type="button" onClick={refresh} className="underline">Retry</button>
            </p>
          )}
          {showForm && (
            <RegistrationForm initial={state.request} bootstrapAdmin={state.bootstrapAdmin} onSubmit={handleSubmit} />
          )}
          {!showForm && state.status === 'PENDING' && <PendingView request={state.request} onRefresh={refresh} />}
          {!showForm && state.status === 'REJECTED' && (
            <RejectedView request={state.request} onResubmit={() => setResubmitting(true)} />
          )}
        </section>
      </main>
    </div>
  );
}
