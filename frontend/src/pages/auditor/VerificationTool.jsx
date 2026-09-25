import { useRef, useState } from 'react';
import { auditApi, verifyApi } from '../../services/api';
import Card, { CardContent, CardHeader } from '../../components/ui/Card';
import { AUDIT_EVENT_TYPES, isChainTxHash, formatAuditDate } from '../../config/auditEvents';

// Verification runs against Ethereum Sepolia (testnet), never mainnet.
const explorerTxUrl = (txHash) => `https://sepolia.etherscan.io/tx/${txHash}`;

const TONES = {
    ok: { icon: 'verified_user', box: 'border-[#059669] bg-[#ECFDF5]', iconColor: 'text-[#047857]', title: 'text-[#065F46]', body: 'text-[#166534]' },
    bad: { icon: 'gpp_bad', box: 'border-[#DC2626] bg-[#FFF1F2]', iconColor: 'text-[#DC2626]', title: 'text-[#991B1B]', body: 'text-[#B91C1C]' },
    warn: { icon: 'warning', box: 'border-[#D97706] bg-[#FFFBEB]', iconColor: 'text-[#B45309]', title: 'text-[#92400E]', body: 'text-[#92400E]' },
    neutral: { icon: 'help', box: 'border-[#64748B] bg-[#F1F5F9]', iconColor: 'text-[#475569]', title: 'text-[#1E293B]', body: 'text-[#334155]' },
};

// Verdicts returned by /verify/asset and /verify/identity.
const VERDICTS = {
    INTEGRITY_OK: {
        tone: 'ok',
        title: 'Integrity verified',
        text: 'Every field that was checked matches its independent source (the blockchain or the encrypted IPFS dossier). No sign of tampering with the database record.',
    },
    INTEGRITY_COMPROMISED: {
        tone: 'bad',
        title: 'Integrity compromised: possible database tampering',
        text: 'At least one database value does not match the chain. The record may have been changed directly in the database, bypassing the application. Treat the on-chain value as the source of truth and escalate this record.',
    },
    PARTIAL: {
        tone: 'warn',
        title: 'Partially verified',
        text: 'Some checks could not be completed (for example the asset has no on-chain token, or no dossier is stored), so those fields are unverified. No mismatch was found in the checks that did run.',
    },
    VERIFICATION_ERROR: {
        tone: 'neutral',
        title: 'Verification could not be completed',
        text: 'A required source (IPFS or the chain) could not be reached or decrypted, so the record was neither confirmed nor flagged. Try again shortly.',
    },
};

const verdictInfo = (verdict) =>
    VERDICTS[verdict] || { tone: 'neutral', title: 'Unrecognised verdict', text: 'The server returned a verdict this page does not know how to describe.' };

function Banner({ tone, title, code, children }) {
    const t = TONES[tone] || TONES.neutral;
    return (
        <div className={`flex items-start gap-3 rounded-lg border border-l-4 p-4 ${t.box}`}>
            <span className={`material-symbols-outlined mt-0.5 text-[28px] ${t.iconColor}`} aria-hidden="true">{t.icon}</span>
            <div className="min-w-0">
                <h3 className={`text-base font-black ${t.title}`}>{title}</h3>
                {code && <p className={`mt-0.5 font-mono text-[11px] font-bold tracking-wider ${t.body}`}>{code}</p>}
                <div className={`mt-1.5 text-sm leading-relaxed ${t.body}`}>{children}</div>
            </div>
        </div>
    );
}

function VerdictBanner({ verdict, prefix }) {
    const info = verdictInfo(verdict);
    return (
        <Banner tone={info.tone} title={prefix ? `${prefix}: ${info.title}` : info.title} code={verdict}>
            {info.text}
        </Banner>
    );
}

function ErrorBox({ title, message, onRetry }) {
    return (
        <div className="audit-error-state flex items-start gap-3 rounded-lg border p-4 text-sm" role="alert">
            <span className="audit-error-icon material-symbols-outlined" aria-hidden="true">error</span>
            <div>
                <p className="audit-error-title font-bold">{title}</p>
                <p className="audit-error-message mt-1 text-xs">{message}</p>
                {onRetry && (
                    <button type="button" onClick={onRetry} className="audit-error-retry mt-3 text-xs font-bold underline">Retry</button>
                )}
            </div>
        </div>
    );
}

function EmptyHint({ icon, children }) {
    return (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-[#B6D8EE] bg-[#F7FBFF] p-4 text-sm text-[#466983]">
            <span className="material-symbols-outlined text-[22px] text-[#75AEE0]" aria-hidden="true">{icon}</span>
            <p>{children}</p>
        </div>
    );
}

function LoadingBox({ children }) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-[#B6D8EE] bg-[#F7FBFF] p-4 text-sm text-[#175887]">
            <span className="material-symbols-outlined animate-spin text-[22px]" aria-hidden="true">progress_activity</span>
            <p>{children}</p>
        </div>
    );
}

function Detail({ label, children, mono = false }) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-[#385D7E]">{label}</dt>
            <dd className={`mt-0.5 break-all text-sm text-[#0D2B4E] ${mono ? 'font-mono text-[12px]' : ''}`}>{children ?? '—'}</dd>
        </div>
    );
}

function ExplorerLink({ txHash }) {
    if (!isChainTxHash(txHash)) return null;
    return (
        <a
            href={explorerTxUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-bold text-[#1E5FA8] underline hover:text-[#164A85]"
        >
            View on Sepolia Etherscan
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">open_in_new</span>
            <span className="sr-only">(opens in a new tab)</span>
        </a>
    );
}

function SubmitButton({ busy, busyLabel, children }) {
    return (
        <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded bg-[#1E5FA8] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#164a85] disabled:cursor-not-allowed disabled:opacity-60"
        >
            {busy && <span className="material-symbols-outlined animate-spin text-[18px]" aria-hidden="true">progress_activity</span>}
            {busy ? busyLabel : children}
        </button>
    );
}

function ClearButton({ onClick, disabled }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="rounded border border-[#B6D8EE] bg-white px-4 py-2 text-sm font-bold text-[#175887] transition-colors hover:bg-[#EAF4FF] disabled:cursor-not-allowed disabled:opacity-60"
        >
            Clear
        </button>
    );
}

const INPUT_CLASS =
    'w-full bg-[#0D1F38] border border-[#1F293D] rounded px-3 py-2 text-sm text-white focus:border-[#D4AF37] outline-none';
const LABEL_CLASS = 'block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2';

/* ── Section 1: transaction / audit event verification ───────────────────── */

const eventTypeLabel = (type) => AUDIT_EVENT_TYPES.find((t) => t.value === type)?.label || type?.replace(/_/g, ' ') || 'Event';

const TX_STATUS = {
    SUCCESS: { tone: 'ok', title: 'Transaction confirmed on Sepolia', text: 'The transaction exists on-chain and executed successfully.' },
    REVERTED: { tone: 'bad', title: 'Transaction reverted', text: 'The transaction is on-chain but failed, so it changed no state. A record claiming this transaction succeeded should not be trusted.' },
    PENDING: { tone: 'warn', title: 'Transaction pending', text: 'The transaction was seen by the network but is not yet included in a block.' },
};

function blockComparison(recordedBlock, chainBlock) {
    if (!recordedBlock || String(recordedBlock) === '0') return { state: 'none', text: 'No block number recorded in the index' };
    if (chainBlock && String(recordedBlock) === String(chainBlock)) return { state: 'match', text: `Block ${recordedBlock} matches the chain` };
    return { state: 'mismatch', text: `Indexed block ${recordedBlock} differs from on-chain block ${chainBlock ?? 'unknown'}` };
}

function TxResult({ chain, indexed }) {
    const status = TX_STATUS[chain.status] || { tone: 'neutral', title: `Transaction status: ${chain.status}`, text: 'The chain returned a status this page does not recognise.' };
    return (
        <div className="space-y-4">
            <Banner tone={status.tone} title={status.title} code={chain.status}>{status.text}</Banner>

            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail label="Transaction hash" mono>{chain.txHash}</Detail>
                <Detail label="Network">{chain.network}</Detail>
                <Detail label="Block number">{chain.blockNumber}</Detail>
                <Detail label="Block time">{chain.blockTimestamp ? formatAuditDate(chain.blockTimestamp, { seconds: true }) : null}</Detail>
                <Detail label="Block hash" mono>{chain.blockHash}</Detail>
                <Detail label="From" mono>{chain.from}</Detail>
                <Detail label="To" mono>{chain.to}</Detail>
                <Detail label="Gas used">{chain.gasUsed}</Detail>
                <Detail label="Event logs">{chain.logsCount}</Detail>
            </dl>
            <ExplorerLink txHash={chain.txHash} />

            <div className="border-t border-[#D9E7F3] pt-4">
                <h3 className="text-sm font-black text-[#0D2B4E]">Indexed BELTAL records for this transaction</h3>
                {indexed.error ? (
                    <p className="mt-2 rounded-lg border border-[#D97706] bg-[#FFFBEB] p-3 text-sm text-[#92400E]">
                        The audit index could not be searched ({indexed.error}). The on-chain result above is unaffected.
                    </p>
                ) : indexed.events.length === 0 ? (
                    <p className="mt-2 text-sm text-[#466983]">
                        No audit record references this transaction. It exists on-chain, but BELTAL has not indexed it or it is unrelated to BELTAL.
                    </p>
                ) : (
                    <ul className="mt-2 space-y-2">
                        {indexed.events.map((event) => {
                            const cmp = blockComparison(event.blockNumber, chain.blockNumber);
                            const icon = cmp.state === 'match' ? 'check_circle' : cmp.state === 'mismatch' ? 'cancel' : 'remove_circle';
                            const color = cmp.state === 'match' ? 'text-[#047857]' : cmp.state === 'mismatch' ? 'text-[#B91C1C]' : 'text-[#92400E]';
                            return (
                                <li key={event.id} className="flex items-start gap-3 rounded-lg border border-[#D9E7F3] bg-white p-3 text-sm">
                                    <span className={`material-symbols-outlined text-[20px] ${color}`} aria-hidden="true">{icon}</span>
                                    <div className="min-w-0">
                                        <p className="font-bold text-[#0D2B4E]">{eventTypeLabel(event.actionType)}</p>
                                        <p className={`text-xs font-semibold ${color}`}>{cmp.text}</p>
                                        <p className="mt-0.5 break-all font-mono text-[11px] text-[#466983]">Event ID {event.id}</p>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

function EventResult({ result }) {
    const hasChainTx = isChainTxHash(result.txHash);
    const banner = result.verified
        ? { tone: 'ok', title: 'Record verified on-chain' }
        : hasChainTx
            ? { tone: 'bad', title: 'Record not verified' }
            : { tone: 'warn', title: 'No on-chain transaction to verify' };
    return (
        <div className="space-y-4">
            <Banner tone={banner.tone} title={banner.title} code={result.verified ? 'VERIFIED' : 'NOT_VERIFIED'}>
                {result.message}
            </Banner>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <Detail label="Audit event ID" mono>{result.id}</Detail>
                <Detail label="Block number">{result.blockNumber}</Detail>
                <Detail label="Transaction hash" mono>{result.txHash}</Detail>
                <Detail label="Network">Ethereum Sepolia (testnet)</Detail>
            </dl>
            <ExplorerLink txHash={result.txHash} />
        </div>
    );
}

function TransactionVerifier() {
    const [query, setQuery] = useState('');
    const [fieldError, setFieldError] = useState('');
    const [state, setState] = useState({ status: 'idle' });
    const runRef = useRef(0);

    const validate = (value) => {
        if (!value) return 'Enter a transaction hash or an audit event ID.';
        if (/^0x/i.test(value)) {
            return isChainTxHash(value) ? '' : 'A transaction hash is 0x followed by 64 hexadecimal characters.';
        }
        return /^[A-Za-z0-9_-]{6,64}$/.test(value) ? '' : 'An audit event ID contains only letters, digits and hyphens.';
    };

    const run = async (value) => {
        const runId = ++runRef.current;
        setState({ status: 'loading' });
        try {
            if (isChainTxHash(value)) {
                const [chain, indexed] = await Promise.allSettled([
                    verifyApi.tx(value),
                    auditApi.findByTxHash(value.toLowerCase()),
                ]);
                if (runId !== runRef.current) return;
                if (chain.status === 'rejected') throw chain.reason;
                setState({
                    status: 'done',
                    kind: 'tx',
                    chain: chain.value,
                    indexed: indexed.status === 'fulfilled'
                        ? { events: indexed.value, error: null }
                        : { events: [], error: indexed.reason?.uiMessage || 'lookup failed' },
                });
            } else {
                const result = await auditApi.verify(value);
                if (runRef.current !== runId) return;
                setState({ status: 'done', kind: 'event', result });
            }
        } catch (err) {
            if (runId !== runRef.current) return;
            setState({ status: 'error', value, message: err?.uiMessage || err?.message || 'The verification service could not be reached.' });
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const value = query.trim();
        const problem = validate(value);
        setFieldError(problem);
        if (problem) return;
        setQuery(value);
        run(value);
    };

    const handleClear = () => {
        runRef.current += 1;
        setQuery('');
        setFieldError('');
        setState({ status: 'idle' });
    };

    const busy = state.status === 'loading';

    return (
        <section aria-labelledby="verify-tx-heading">
            <Card goldAccent={false} className="audit-surface">
                <CardHeader>
                    <div>
                        <h2 id="verify-tx-heading" className="text-[14px] font-bold uppercase tracking-widest text-slate-300">Verify a transaction or audit record</h2>
                        <p className="mt-1 text-xs text-slate-500">Paste a Sepolia transaction hash to read it straight from the chain, or an audit event ID to check the indexed record against the chain.</p>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} noValidate className="space-y-4">
                        <div>
                            <label htmlFor="verify-query" className={LABEL_CLASS}>Transaction hash or audit event ID</label>
                            <input
                                id="verify-query"
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="0x… (66 characters) or an audit event ID"
                                autoComplete="off"
                                spellCheck={false}
                                aria-invalid={fieldError ? 'true' : undefined}
                                aria-describedby={fieldError ? 'verify-query-help verify-query-error' : 'verify-query-help'}
                                className={`${INPUT_CLASS} font-mono`}
                            />
                            <p id="verify-query-help" className="mt-1.5 text-xs text-slate-500">Event IDs are shown in the Audit Trail. Only real on-chain transactions can be verified.</p>
                            {fieldError && <p id="verify-query-error" className="mt-1.5 text-xs font-bold text-[#B91C1C]" role="alert">{fieldError}</p>}
                        </div>
                        <div className="flex flex-wrap gap-3">
                            <SubmitButton busy={busy} busyLabel="Verifying…">Verify on-chain</SubmitButton>
                            <ClearButton onClick={handleClear} disabled={busy || (!query && state.status === 'idle')} />
                        </div>
                    </form>

                    <div className="mt-5" aria-live="polite" aria-busy={busy}>
                        {state.status === 'idle' && (
                            <EmptyHint icon="manage_search">No verification run yet. Enter a transaction hash or an audit event ID above; the result will appear here.</EmptyHint>
                        )}
                        {state.status === 'loading' && <LoadingBox>Querying Ethereum Sepolia…</LoadingBox>}
                        {state.status === 'error' && (
                            <ErrorBox title="Verification failed" message={state.message} onRetry={() => run(state.value)} />
                        )}
                        {state.status === 'done' && state.kind === 'tx' && <TxResult chain={state.chain} indexed={state.indexed} />}
                        {state.status === 'done' && state.kind === 'event' && <EventResult result={state.result} />}
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}

/* ── Section 2: Anti-Tamper Lab ──────────────────────────────────────────── */

const ROW_STATES = {
    match: { icon: 'check_circle', label: 'Match', color: 'text-[#047857]', cell: '' },
    mismatch: { icon: 'cancel', label: 'Mismatch', color: 'text-[#B91C1C]', cell: 'bg-[#FEE2E2]' },
    skipped: { icon: 'remove_circle', label: 'Not checked', color: 'text-[#92400E]', cell: '' },
    error: { icon: 'error', label: 'Error', color: 'text-[#475569]', cell: '' },
};

const statusToState = (status = '') => {
    if (status.endsWith('_MATCH')) return 'match';
    if (status.endsWith('_DRIFT')) return 'mismatch';
    if (status === 'SKIPPED' || status === 'NOT_FOUND') return 'skipped';
    return 'error';
};

// How each check the backend reports is labelled, and where the independent
// (non-database) value comes from.
const CHECKS = {
    ON_CHAIN_TOKEN: { label: 'On-chain token', source: 'Blockchain' },
    CID_INTEGRITY: { label: 'IPFS metadata CID', source: 'On-chain tokenURI' },
    CUSTODIAN_INTEGRITY: { label: 'Custodian wallet', source: 'On-chain custodian' },
    CLASSIFICATION_INTEGRITY: { label: 'Classification tier', source: 'On-chain record' },
    DOSSIER_CID: { label: 'Encrypted dossier', source: 'IPFS' },
    IPFS_DOSSIER_FETCH: { label: 'IPFS dossier retrieval', source: 'IPFS' },
    IDENTITY_HASH_RECOMPUTE: { label: 'Identity hash recomputation', source: 'Recomputed' },
    IDENTITY_HASH_INTEGRITY: { label: 'Identity hash', source: 'Recomputed from IPFS dossier' },
    SBU_INTEGRITY: { label: 'SBU (business unit)', source: 'Encrypted IPFS dossier' },
    ON_CHAIN_IDENTITY_REGISTRY: { label: 'On-chain identity registry', source: 'Blockchain' },
    ON_CHAIN_STATUS: { label: 'Identity status', source: 'Identity registry' },
    CLEARANCE_INTEGRITY: { label: 'Clearance level', source: 'Identity registry' },
    ON_CHAIN_SBU: { label: 'SBU (on-chain)', source: 'Identity registry' },
};

function registryValue(v) {
    if (v.status === 'ON_CHAIN_HASH_MATCH') {
        return `Hash confirmed. Clearance level ${v.onChainClearance ?? '?'}, SBU ${v.onChainSbu ?? '?'}`;
    }
    if (v.status === 'ON_CHAIN_HASH_DRIFT') return 'Registry hash differs from the database hash';
    return null;
}

function buildRows(report) {
    const verifications = report.verifications || [];
    const storedHash = verifications.find((v) => v.check === 'IDENTITY_HASH_INTEGRITY')?.storedHash;
    return verifications.map((v) => {
        const meta = CHECKS[v.check] || { label: v.check, source: '' };
        const isRegistry = v.check === 'ON_CHAIN_IDENTITY_REGISTRY';
        return {
            key: v.check,
            label: meta.label,
            source: meta.source,
            db: v.dbValue ?? v.storedHash ?? (isRegistry ? storedHash : null),
            independent: v.onChainValue ?? v.recomputedHash ?? v.dossierValue ?? (isRegistry ? registryValue(v) : null),
            state: statusToState(v.status),
            note: v.description || v.reason || null,
        };
    });
}

const showValue = (value) =>
    value === null || value === undefined || value === '' ? <span className="text-[#6D86A1]">{'—'}</span> : String(value);

function ComparisonTable({ rows, caption }) {
    return (
        <div className="overflow-x-auto rounded-lg border border-[#D9E7F3]">
            <table className="audit-table w-full min-w-[720px] text-left text-sm">
                <caption className="sr-only">{caption}</caption>
                <thead className="text-xs uppercase">
                    <tr>
                        <th scope="col" className="px-4 py-3">Field</th>
                        <th scope="col" className="px-4 py-3">Database value</th>
                        <th scope="col" className="px-4 py-3">Independent value</th>
                        <th scope="col" className="px-4 py-3">Source</th>
                        <th scope="col" className="px-4 py-3">Result</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-[#D9E7F3]">
                    {rows.map((row) => {
                        const s = ROW_STATES[row.state];
                        return (
                            <tr key={row.key}>
                                <th scope="row" className="px-4 py-3 align-top font-bold text-[#0D2B4E]">
                                    {row.label}
                                    {row.note && <p className="mt-1 max-w-xs text-[11px] font-normal leading-snug text-[#466983]">{row.note}</p>}
                                </th>
                                <td className={`px-4 py-3 align-top break-all font-mono text-[12px] text-[#173C5D] ${s.cell}`}>{showValue(row.db)}</td>
                                <td className={`px-4 py-3 align-top break-all font-mono text-[12px] text-[#173C5D] ${s.cell}`}>{showValue(row.independent)}</td>
                                <td className="px-4 py-3 align-top text-xs text-[#466983]">{row.source || '—'}</td>
                                <td className="px-4 py-3 align-top">
                                    <span className={`inline-flex items-center gap-1 text-xs font-black ${s.color}`}>
                                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{s.icon}</span>
                                        {s.label}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function TargetResult({ kind, target, onRetry }) {
    const heading = kind === 'asset' ? 'Asset record' : 'Identity record';
    if (target.status === 'error') {
        return (
            <div className="space-y-2">
                <h3 className="text-sm font-black text-[#0D2B4E]">{heading}</h3>
                <ErrorBox title={`${heading} could not be verified`} message={target.message} onRetry={onRetry} />
            </div>
        );
    }
    const report = target.data;
    const rows = buildRows(report);
    const counts = rows.reduce((acc, r) => ({ ...acc, [r.state]: (acc[r.state] || 0) + 1 }), {});
    const subject = kind === 'asset'
        ? [report.assetName, report.tokenId ? `token #${report.tokenId}` : 'no on-chain token'].filter(Boolean).join(', ')
        : [report.displayName, report.externalId].filter(Boolean).join(', ');

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-sm font-black text-[#0D2B4E]">{heading}: {subject}</h3>
                <p className="mt-0.5 break-all font-mono text-[11px] text-[#466983]">
                    {kind === 'asset' ? `Asset ID ${report.assetId}` : `Identity ID ${report.employeeId}${report.walletAddress ? ` · Wallet ${report.walletAddress}` : ''}`}
                </p>
            </div>

            <VerdictBanner verdict={report.verdict} />

            {rows.length === 0 ? (
                <EmptyHint icon="rule">The server returned no individual checks for this record.</EmptyHint>
            ) : (
                <>
                    <p className="text-xs font-bold text-[#385D7E]">
                        {counts.match || 0} matched · {counts.mismatch || 0} mismatched · {(counts.skipped || 0) + (counts.error || 0)} not checked
                        {report.checkedAt ? ` · checked ${formatAuditDate(report.checkedAt, { seconds: true })}` : ''}
                    </p>
                    <ComparisonTable rows={rows} caption={`${heading} field-by-field comparison of database values against independent sources`} />
                </>
            )}
        </div>
    );
}

const DEMO_FIELD_LABELS = { clearanceLevel: 'clearance level', classificationTier: 'classification tier' };

// One line per record the demo tool touched, worded so the audience can follow
// what just happened to the database versus the chain.
function DemoNotice({ notice }) {
    const tampered = notice.action === 'tamper';
    const anyOk = notice.items.some((item) => item.ok);
    const tone = !anyOk
        ? 'border-[#DC2626] bg-[#FFF1F2] text-[#991B1B]'
        : tampered
            ? 'border-[#D97706] bg-[#FFFBEB] text-[#92400E]'
            : 'border-[#059669] bg-[#ECFDF5] text-[#166534]';
    return (
        <div className={`rounded-lg border border-l-4 p-4 text-sm ${tone}`} role="status">
            <ul className="space-y-1.5">
                {notice.items.map((item) => (
                    <li key={`${item.kind}-${item.id ?? item.message}`} className="flex items-start gap-2">
                        <span className="material-symbols-outlined mt-0.5 text-[18px]" aria-hidden="true">
                            {item.ok ? (tampered ? 'edit_note' : 'history') : 'error'}
                        </span>
                        {item.ok ? (
                            tampered ? (
                                <span>
                                    Forged the {DEMO_FIELD_LABELS[item.field] || item.field} of <strong>{item.label}</strong> in the database:{' '}
                                    <strong>{item.before} to {item.after}</strong>. The blockchain still holds {item.before}. Running the audit check now.
                                </span>
                            ) : (
                                <span>
                                    Restored the {DEMO_FIELD_LABELS[item.field] || item.field} of <strong>{item.label}</strong> from the chain:{' '}
                                    <strong>{item.before} to {item.after}</strong>.
                                </span>
                            )
                        ) : (
                            <span>{item.kind === 'identity' ? 'Identity' : 'Asset'}: {item.message}</span>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}

const overallVerdict = (targets) => {
    const verdicts = targets.map((t) => (t.status === 'done' ? t.data.verdict : 'VERIFICATION_ERROR'));
    if (verdicts.includes('INTEGRITY_COMPROMISED')) return 'INTEGRITY_COMPROMISED';
    return verdicts.every((v) => v === 'INTEGRITY_OK') ? 'INTEGRITY_OK' : 'PARTIAL';
};

const settle = (result) =>
    result.status === 'fulfilled'
        ? { status: 'done', data: result.value }
        : { status: 'error', message: result.reason?.uiMessage || result.reason?.message || 'The verification service could not be reached.' };

function AntiTamperLab() {
    const [assetId, setAssetId] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [fieldError, setFieldError] = useState('');
    const [state, setState] = useState({ status: 'idle' });
    const [demoBusy, setDemoBusy] = useState(null); // 'tamper' | 'restore' | null
    const [demoNotice, setDemoNotice] = useState(null);
    const runRef = useRef(0);

    const run = async (asset, identity) => {
        const runId = ++runRef.current;
        setState({ status: 'loading' });
        const [assetResult, identityResult] = await Promise.allSettled([
            asset ? verifyApi.asset(asset) : Promise.resolve(null),
            identity ? verifyApi.identity(identity) : Promise.resolve(null),
        ]);
        if (runId !== runRef.current) return;
        setState({
            status: 'done',
            asset: asset ? settle(assetResult) : null,
            identity: identity ? settle(identityResult) : null,
            requested: { asset, identity },
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const asset = assetId.trim();
        const identity = employeeId.trim();
        if (!asset && !identity) {
            setFieldError('Enter an asset ID, an employee ID, or both.');
            return;
        }
        setFieldError('');
        setAssetId(asset);
        setEmployeeId(identity);
        run(asset, identity);
    };

    const handleClear = () => {
        runRef.current += 1;
        setAssetId('');
        setEmployeeId('');
        setFieldError('');
        setDemoNotice(null);
        setState({ status: 'idle' });
    };

    // Demo tools: play the rogue insider, or put the database back. They act on
    // whichever of the two records is filled in, then re-run the audit check so
    // the verdict flips in front of the audience.
    const applyDemoAction = async (action) => {
        const asset = assetId.trim();
        const identity = employeeId.trim();
        if (!asset && !identity) {
            setFieldError('Enter an asset ID, an employee ID, or both.');
            return;
        }
        setFieldError('');
        setDemoBusy(action);
        setDemoNotice(null);

        const targets = [];
        if (identity) targets.push(['identity', identity]);
        if (asset) targets.push(['asset', asset]);
        const call = action === 'tamper' ? verifyApi.simulateTamper : verifyApi.restoreFromChain;
        const results = await Promise.allSettled(targets.map(([kind, id]) => call(kind, id)));

        setDemoNotice({
            action,
            items: results.map((result, i) =>
                result.status === 'fulfilled'
                    ? { ok: true, ...result.value }
                    : { ok: false, kind: targets[i][0], message: result.reason?.uiMessage || result.reason?.message || 'The action failed.' }
            ),
        });
        setDemoBusy(null);
        if (results.some((r) => r.status === 'fulfilled')) run(asset, identity);
    };

    const busy = state.status === 'loading' || demoBusy !== null;
    const targets = state.status === 'done' ? [state.asset, state.identity].filter(Boolean) : [];

    return (
        <section aria-labelledby="lab-heading">
            <Card goldAccent={false} className="audit-surface">
                <CardHeader>
                    <div>
                        <h2 id="lab-heading" className="text-[14px] font-bold uppercase tracking-widest text-slate-300">Anti-Tamper Lab</h2>
                        <p className="mt-1 text-xs text-slate-500">Compare a record stored in the database with the blockchain and the encrypted IPFS dossier, field by field. A mismatch means the database was changed outside the application.</p>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} noValidate className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label htmlFor="lab-asset" className={LABEL_CLASS}>Asset ID</label>
                                <input
                                    id="lab-asset"
                                    type="text"
                                    value={assetId}
                                    onChange={(e) => setAssetId(e.target.value)}
                                    placeholder="Asset ID or on-chain token ID"
                                    autoComplete="off"
                                    spellCheck={false}
                                    aria-describedby="lab-asset-help"
                                    className={INPUT_CLASS}
                                />
                                <p id="lab-asset-help" className="mt-1.5 text-xs text-slate-500">Checks the CID, custodian wallet and classification tier against the on-chain token.</p>
                            </div>
                            <div>
                                <label htmlFor="lab-employee" className={LABEL_CLASS}>Employee ID</label>
                                <input
                                    id="lab-employee"
                                    type="text"
                                    value={employeeId}
                                    onChange={(e) => setEmployeeId(e.target.value)}
                                    placeholder="Identity ID or BEL employee ID"
                                    autoComplete="off"
                                    spellCheck={false}
                                    aria-describedby="lab-employee-help"
                                    className={INPUT_CLASS}
                                />
                                <p id="lab-employee-help" className="mt-1.5 text-xs text-slate-500">Recomputes the identity hash from the IPFS dossier, then checks clearance, SBU and status against the on-chain identity registry.</p>
                            </div>
                        </div>
                        {fieldError && <p className="text-xs font-bold text-[#B91C1C]" role="alert">{fieldError}</p>}
                        <div className="flex flex-wrap gap-3">
                            <SubmitButton busy={state.status === 'loading'} busyLabel="Running audit check…">Run cryptographic audit check</SubmitButton>
                            <ClearButton onClick={handleClear} disabled={busy || (!assetId && !employeeId && state.status === 'idle')} />
                        </div>
                    </form>

                    <div className="mt-5 rounded-lg border border-dashed border-[#D97706]/60 bg-[#FFFBEB] p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 max-w-xl">
                                <h3 className="flex items-center gap-1.5 text-sm font-black text-[#92400E]">
                                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">science</span>
                                    Demo tools
                                </h3>
                                <p className="mt-1 text-xs leading-relaxed text-[#92400E]">
                                    Play the rogue insider: forge a value straight in the database, then run the audit check and watch it get caught.
                                    Only the database cache is edited. The blockchain is never touched, and Restore copies its value back.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => applyDemoAction('tamper')}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 rounded border border-[#B45309] bg-white px-3 py-2 text-xs font-bold text-[#92400E] transition-colors hover:bg-[#B45309] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {demoBusy === 'tamper'
                                        ? <span className="material-symbols-outlined animate-spin text-[16px]" aria-hidden="true">progress_activity</span>
                                        : <span className="material-symbols-outlined text-[16px]" aria-hidden="true">edit_note</span>}
                                    Simulate insider tamper
                                </button>
                                <button
                                    type="button"
                                    onClick={() => applyDemoAction('restore')}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1.5 rounded border border-[#047857] bg-white px-3 py-2 text-xs font-bold text-[#047857] transition-colors hover:bg-[#047857] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {demoBusy === 'restore'
                                        ? <span className="material-symbols-outlined animate-spin text-[16px]" aria-hidden="true">progress_activity</span>
                                        : <span className="material-symbols-outlined text-[16px]" aria-hidden="true">history</span>}
                                    Restore from chain
                                </button>
                            </div>
                        </div>
                        {demoNotice && <div className="mt-3" aria-live="polite"><DemoNotice notice={demoNotice} /></div>}
                    </div>

                    <div className="mt-5 space-y-6" aria-live="polite" aria-busy={busy}>
                        {state.status === 'idle' && (
                            <EmptyHint icon="biotech">No audit check run yet. Enter an asset ID or an employee ID above; the verdict and field comparison will appear here.</EmptyHint>
                        )}
                        {busy && <LoadingBox>Re-deriving the expected state and querying the chain. Identity checks fetch the encrypted dossier from IPFS and can take up to 30 seconds.</LoadingBox>}
                        {state.status === 'done' && targets.length > 1 && (
                            <VerdictBanner verdict={overallVerdict(targets)} prefix="Overall" />
                        )}
                        {state.status === 'done' && state.asset && (
                            <TargetResult kind="asset" target={state.asset} onRetry={() => run(state.requested.asset, state.requested.identity)} />
                        )}
                        {state.status === 'done' && state.identity && (
                            <TargetResult kind="identity" target={state.identity} onRetry={() => run(state.requested.asset, state.requested.identity)} />
                        )}
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}

export default function VerificationTool() {
    return (
        <div className="role-console verification-tool min-h-full space-y-6 p-5 sm:p-8">
            <div>
                <div className="mb-2 flex items-center gap-2">
                    <span className="h-px w-12 bg-gradient-to-r from-[#D4AF37]/40 to-transparent" />
                    <span className="text-[9px] font-black uppercase tracking-[0.22em] text-[#B8962E]">
                        ◈ AUDITOR CLEARANCE · INDEPENDENT VERIFICATION
                    </span>
                </div>
                <h1 className="text-2xl font-black tracking-wide text-[#0D2B4E]">On-Chain Verification</h1>
                <p className="mt-1 max-w-3xl text-sm text-slate-400">
                    Check records independently against the chain instead of trusting the database. All lookups run against Ethereum Sepolia, the demo testnet.
                </p>
            </div>

            <TransactionVerifier />
            <AntiTamperLab />
        </div>
    );
}
