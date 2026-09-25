/**
 * LoginModal — BELTAL Sovereign Wallet Authentication
 *
 * A full-screen defense-aesthetic modal that drives the SIWE connect flow.
 * Renders step indicators, loading states, error recovery, and a
 * MetaMask-not-installed fallback.
 *
 * Props
 * ─────
 * isOpen   : boolean   — controls visibility
 * onClose  : () => void — called when modal is dismissed
 */

import { useEffect, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, roleHomePath } from '../../context/AuthContext';
import { shortenAddress } from '../../context/AuthContext';
import { useToast } from '../ui/Toast';

/* ── Step config ────────────────────────────────────────────── */
const STEPS = [
  {
    key: 'connecting',
    label: 'Connect Wallet',
    sublabel: 'Requesting wallet access…',
    icon: 'account_balance_wallet',
  },
  {
    key: 'nonce',
    label: 'Fetch Challenge',
    sublabel: 'Retrieving cryptographic nonce…',
    icon: 'lock',
  },
  {
    key: 'signing',
    label: 'Sign Nonce',
    sublabel: 'Signing cryptographic nonce…',
    icon: 'draw',
  },
  {
    key: 'verifying',
    label: 'Verify & Issue JWT',
    sublabel: 'Verifying ECDSA signature…',
    icon: 'verified_user',
  },
];

/* Map connectStep → active step index (-1 = idle/error) */
function stepIndex(connectStep) {
  const map = { connecting: 0, signing: 2, verifying: 3 };
  return map[connectStep] ?? -1;
}

function stepLabel(connectStep) {
  const found = STEPS.find(
    (s) => s.key === connectStep || (connectStep === 'verifying' && s.key === 'verifying')
  );
  return found?.sublabel ?? 'Initialising…';
}

/* ── Sub-components ─────────────────────────────────────────── */

/* Animated hex-grid SVG watermark */
function HexWatermark() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.03]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="hex" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
          <polygon
            points="28,2 52,14 52,38 28,50 4,38 4,14"
            fill="none"
            stroke="#C59B27"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hex)" />
    </svg>
  );
}

/* Crypto spinner ring */
function CryptoSpinner() {
  return (
    <div className="relative w-16 h-16 mx-auto mb-4">
      {/* Outer ring — slow rotate */}
      <div
        className="absolute inset-0 rounded-full border-2 border-[#C59B27]/20"
        style={{ animation: 'spinSlow 4s linear infinite' }}
      />
      {/* Inner arc — fast rotate */}
      <div
        className="absolute inset-1 rounded-full border-2 border-transparent border-t-[#1E5FA8] border-r-[#1E5FA8]/40"
        style={{ animation: 'spinFast 0.9s linear infinite' }}
      />
      {/* Gold arc — counter rotate */}
      <div
        className="absolute inset-3 rounded-full border border-transparent border-b-[#C59B27]"
        style={{ animation: 'spinReverse 1.4s linear infinite' }}
      />
      {/* Center dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-[#C59B27]" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>
    </div>
  );
}

/* Step indicator row */
function StepIndicator({ connectStep }) {
  const active = stepIndex(connectStep);
  const isDone = connectStep === 'done';
  return (
    <div className="auth-step-indicator" aria-label="Authentication progress">
      {STEPS.map((step, i) => {
        const past = isDone || i < active;
        const current = !isDone && i === active;
        return (
          <div key={step.key} className="auth-step">
            {/* Node */}
            <div className="flex flex-col items-center flex-shrink-0">
              <div
                className={[
                  'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500',
                  past
                    ? 'bg-[#1E5FA8] border-2 border-[#7ab0fe] shadow-[0_0_12px_rgba(30,95,168,0.5)]'
                    : current
                    ? 'bg-[#0D2B4E] border-2 border-[#C59B27] shadow-[0_0_16px_rgba(197,155,39,0.4)]'
                    : 'bg-[#0A1628] border border-[#1E2E48]',
                ].join(' ')}
              >
                {past ? (
                  <span className="material-symbols-outlined text-white text-[14px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                    check
                  </span>
                ) : (
                  <span
                    className={[
                      'material-symbols-outlined text-[14px]',
                      current ? 'text-[#C59B27]' : 'text-slate-600',
                    ].join(' ')}
                    style={{ fontVariationSettings: '"FILL" 1' }}
                  >
                    {step.icon}
                  </span>
                )}
              </div>
              <span
                className={[
                  'auth-step__label text-[9px] mt-1 font-bold tracking-wider uppercase text-center leading-tight',
                  past ? 'text-[#7ab0fe]' : current ? 'text-[#C59B27]' : 'text-slate-600',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {/* Connector line — skip after last */}
            {i < STEPS.length - 1 && (
              <div
                className={[
                  'flex-1 h-px mx-1 transition-all duration-700',
                  past ? 'bg-[#1E5FA8]/60' : 'bg-[#1E2E48]',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Main Modal ─────────────────────────────────────────────── */
export default function LoginModal({ isOpen, onClose }) {
  const { connectWallet, connectStep, connectError, resetConnect, user, isAuthenticated } =
    useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [portalPreference, setPortalPreference] = useState(null);

  /* Where to go after sign-in. The role assigned by the server decides —
     the portal picked above is only a preference and is never trusted. */
  const destination = useMemo(() => {
    if (!user) return null;
    if (!user.isRegistered) return { path: '/register', notice: null };
    const notice =
      portalPreference && portalPreference !== user.role
        ? `You chose the ${portalPreference} portal, but your wallet is registered as ${user.role} — opening the ${user.role} portal.`
        : null;
    return { path: roleHomePath(user.role) ?? '/', notice };
  }, [user, portalPreference]);

  /* Auto-close after successful auth, then open the portal for the real role */
  useEffect(() => {
    if (connectStep === 'done' && isAuthenticated && destination) {
      const t = setTimeout(() => {
        onClose();
        resetConnect();
        if (destination.notice) toast.info(destination.notice, 'Portal');
        navigate(destination.path);
      }, destination.notice ? 2600 : 1200);
      return () => clearTimeout(t);
    }
  }, [connectStep, isAuthenticated, destination, onClose, resetConnect, navigate, toast]);

  /* Escape key closes modal (only when idle or error) */
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'Escape' && connectStep !== 'connecting' && connectStep !== 'signing' && connectStep !== 'verifying') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, connectStep]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Prevent body scroll when open */
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    resetConnect();
    onClose();
  }, [resetConnect, onClose]);

  const handleConnect = useCallback(async () => {
    await connectWallet();
  }, [connectWallet]);

  const hasMetaMask = typeof window !== 'undefined' && !!window.ethereum;
  const isLoading = ['connecting', 'signing', 'verifying'].includes(connectStep);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[90] bg-[#0D2B4E]/35 backdrop-blur-sm"
        onClick={() => {
          if (!isLoading) handleClose();
        }}
        style={{ animation: 'fadeIn 200ms ease' }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sovereign Wallet Authentication"
        className="fixed inset-0 z-[91] flex items-center justify-center p-4"
      >
        <div
          className="beltal-auth-modal auth-modal-light relative w-full max-w-md rounded-2xl overflow-hidden"
          style={{ animation: 'modalIn 280ms cubic-bezier(0.16,1,0.3,1)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Hex watermark */}
          <HexWatermark />

          {/* Gold top accent bar */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#C59B27] to-transparent" />

          {/* Header */}
          <div className="relative px-8 pt-6 pb-0">
            <div className="flex items-start justify-between mb-4">
              {/* BEL classification strip */}
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black tracking-[0.2em] text-[#C59B27] uppercase">
                  ◈ BEL — Govt. of India
                </span>
                <span className="text-[9px] font-bold tracking-widest text-slate-600 uppercase">
                  BELTAL Sovereign Identity Protocol
                </span>
              </div>

              {/* Close button — hidden during active signing */}
              {!isLoading && (
                <button
                  onClick={handleClose}
                  aria-label="Close authentication modal"
                  className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#1E2E48] text-slate-500 hover:text-slate-200 hover:border-slate-500 transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
              )}
            </div>

            {/* Shield icon */}
            <div className="flex justify-center mb-3">
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-[#0B1E36] border border-[#1E3E62] flex items-center justify-center shadow-[0_0_24px_rgba(30,95,168,0.2)]">
                  <span
                    className="material-symbols-outlined text-[28px] text-[#7ab0fe]"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                  >
                    shield
                  </span>
                </div>
                {/* Pulse ring */}
                <div className="absolute inset-0 rounded-full border border-[#1E5FA8]/30" style={{ animation: 'pulseRing 2s ease-in-out infinite' }} />
              </div>
            </div>

            <h2 className="text-center text-[20px] font-black text-slate-100 tracking-wide mb-1">
              Sovereign Wallet Authentication
            </h2>
            <p className="text-center text-[12px] text-slate-500 mb-4 tracking-wide">
              Sign In with Ethereum — ECDSA cryptographic verification
            </p>
          </div>

          {/* Body */}
          <div className="relative px-8 pb-6">
            {/* ── No MetaMask state ── */}
            {!hasMetaMask && (
              <div className="text-center">
                <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-4 mb-5">
                  <span
                    className="material-symbols-outlined text-[28px] text-amber-400 mb-2 block"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                  >
                    warning
                  </span>
                  <p className="text-[14px] font-bold text-amber-300 mb-1">
                    Web3 Wallet Not Detected
                  </p>
                  <p className="text-[12px] text-slate-400">
                    A MetaMask-compatible browser extension is required for sovereign authentication.
                  </p>
                </div>
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1E5FA8] hover:bg-[#1a52931] text-white text-[14px] font-bold rounded-xl transition-all border border-[#2a72c0]"
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  Install MetaMask
                </a>
              </div>
            )}

            {/* ── Idle state ── */}
            {hasMetaMask && connectStep === 'idle' && (
              <div className="auth-idle-content">
                {/* Step indicators — all unlit */}
                <StepIndicator connectStep="idle" />

                <fieldset className="mb-5">
                  <legend className="mb-2 text-[11px] font-bold tracking-widest text-slate-500 uppercase">Open preferred portal (optional)</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {['USER', 'MANAGER', 'AUDITOR', 'ADMIN'].map((role) => (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={portalPreference === role}
                        onClick={() => setPortalPreference((current) => (current === role ? null : role))}
                        className={`rounded-lg border px-3 py-2 text-left text-[12px] font-bold transition-colors ${portalPreference === role ? 'border-[#1E5FA8] bg-[#1E5FA8]/20 text-[#7ab0fe]' : 'border-[#1E2E48] bg-[#060D1A] text-slate-400 hover:border-slate-500'}`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">This is only a portal preference. Your role assigned in the database is verified by the server and controls access.</p>
                </fieldset>

                {/* Info card */}
                <div className="bg-[#060D1A] border border-[#1E2E48] rounded-xl p-4 mb-5">
                  <p className="text-[11px] font-bold tracking-widest text-slate-500 uppercase mb-2">
                    Authentication Procedure
                  </p>
                  <ol className="space-y-1.5 text-[12px] text-slate-400">
                    {['Connect your sovereign hardware / software wallet', 'Review & sign the BELTAL challenge nonce', 'ECDSA signature verified on-chain — JWT issued'].map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[#C59B27] font-black shrink-0">{i + 1}.</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>

                <button
                  id="beltal-connect-wallet-btn"
                  onClick={handleConnect}
                  className="w-full flex items-center justify-center gap-3 py-3 px-6 bg-[#1E5FA8] hover:bg-[#1a5299] active:bg-[#163f7a] text-white font-black text-[15px] tracking-wide rounded-xl border border-[#2a72c0] shadow-[0_0_20px_rgba(30,95,168,0.3)] transition-all duration-200"
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                  >
                    account_balance_wallet
                  </span>
                  Connect Sovereign Wallet
                </button>

                <p className="text-center text-[11px] text-slate-600 mt-2">
                  Your private key never leaves your device
                </p>
              </div>
            )}

            {/* ── Active / loading state ── */}
            {hasMetaMask && isLoading && (
              <div className="text-center">
                <StepIndicator connectStep={connectStep} />
                <CryptoSpinner />
                <p className="text-[15px] font-bold text-slate-200 mb-1">
                  {connectStep === 'signing' ? 'Awaiting Signature' : 'Processing…'}
                </p>
                <p className="text-[12px] text-slate-500 tracking-wide">
                  {stepLabel(connectStep)}
                </p>
                {connectStep === 'signing' && (
                  <div className="mt-4 bg-[#0D1F38]/60 border border-[#1E3E62]/60 rounded-lg px-4 py-2.5">
                    <p className="text-[11px] text-[#7ab0fe] font-bold tracking-wider">
                      ✦ Check your wallet extension — approve the signature request
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Success state ── */}
            {hasMetaMask && connectStep === 'done' && (
              <div className="text-center">
                <StepIndicator connectStep="done" />
                <div
                  className="w-14 h-14 rounded-full bg-emerald-900/30 border border-emerald-600/40 flex items-center justify-center mx-auto mb-4"
                  style={{ animation: 'scaleIn 300ms cubic-bezier(0.34,1.56,0.64,1)' }}
                >
                  <span
                    className="material-symbols-outlined text-[28px] text-emerald-400"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                  >
                    verified
                  </span>
                </div>
                <p className="text-[16px] font-black text-emerald-400 mb-1">Identity Verified</p>
                <p className="text-[12px] text-slate-500 mb-3">ECDSA signature accepted — JWT issued</p>
                {user?.walletAddress && (
                  <div className="inline-flex items-center gap-2 bg-[#060D1A] border border-[#1E2E48] px-3 py-1.5 rounded-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <code className="text-[12px] text-[#7ab0fe] font-bold">
                      {shortenAddress(user.walletAddress)}
                    </code>
                    <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-900/30 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                      {user.role ?? 'UNREGISTERED'}
                    </span>
                  </div>
                )}
                {destination?.notice && (
                  <p role="status" className="mt-3 text-[12px] font-semibold text-[#7ab0fe]">{destination.notice}</p>
                )}
              </div>
            )}

            {/* ── Error state ── */}
            {hasMetaMask && connectStep === 'error' && (
              <div className="text-center">
                <div className="bg-red-950/30 border border-red-800/40 rounded-xl p-5 mb-5">
                  <span
                    className="material-symbols-outlined text-[28px] text-red-400 mb-2 block"
                    style={{ fontVariationSettings: '"FILL" 1' }}
                  >
                    gpp_bad
                  </span>
                  <p className="text-[14px] font-black text-red-300 mb-1.5">Authentication Failed</p>
                  <p className="text-[12px] text-slate-400 leading-relaxed">
                    {connectError || 'An unexpected error occurred during wallet verification.'}
                  </p>
                </div>

                <button
                  id="beltal-retry-connect-btn"
                  onClick={handleConnect}
                  className="w-full flex items-center justify-center gap-2 py-3 px-6 bg-[#1E5FA8] hover:bg-[#1a5299] text-white font-bold text-[14px] rounded-xl border border-[#2a72c0] transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  Retry Authentication
                </button>
              </div>
            )}
          </div>

          {/* Bottom classification strip */}
          <div className="relative px-8 pb-3 flex items-center justify-between border-t border-[#1E2E48]/60">
            <span className="text-[9px] font-bold tracking-[0.18em] text-slate-700 uppercase pt-2">
              BELTAL — Sovereign Defence Ledger
            </span>
            <span className="text-[9px] font-bold tracking-widest text-[#C59B27]/40 uppercase pt-2">
              RESTRICTED
            </span>
          </div>
        </div>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes fadeIn    { from { opacity: 0 } to { opacity: 1 } }
        @keyframes modalIn   { from { opacity: 0; transform: scale(0.94) translateY(12px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        @keyframes spinSlow  { to { transform: rotate(360deg) } }
        @keyframes spinFast  { to { transform: rotate(360deg) } }
        @keyframes spinReverse { to { transform: rotate(-360deg) } }
        @keyframes pulse     { 0%, 100% { opacity: 1; transform: scale(1) } 50% { opacity: 0.4; transform: scale(0.7) } }
        @keyframes pulseRing { 0%, 100% { transform: scale(1); opacity: 0.3 } 50% { transform: scale(1.15); opacity: 0 } }
        @keyframes scaleIn   { from { transform: scale(0.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      `}</style>
    </>
  );
}
