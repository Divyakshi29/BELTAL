import { useState, useEffect, useRef } from 'react';
import { assistantApi } from '../../services/api';
import Card, { CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { getActionIcon, getActionColor, formatAuditDate } from '../../config/auditEvents';

/**
 * Chat-style audit assistant (issue #70).
 *
 * The point of this panel is that an answer is never presented on its own: the
 * records the assistant actually queried are rendered directly underneath it,
 * so an auditor can check the summary against the evidence instead of trusting
 * it. Backed by POST /api/assistant/query, which is restricted to the same
 * roles as the audit trail itself.
 */

const SUGGESTIONS = [
    'What happened in the last 24 hours?',
    'Show me every denied badge tap.',
    'Which assets were minted this month?',
    'List all rejected transfer requests.',
];

export default function AuditAssistantPanel() {
    const [configured, setConfigured] = useState(null); // null = still checking
    const [question, setQuestion] = useState('');
    const [turns, setTurns] = useState([]);
    const [pending, setPending] = useState(false);
    const endRef = useRef(null);

    useEffect(() => {
        let cancelled = false;
        assistantApi
            .status()
            .then((data) => { if (!cancelled) setConfigured(Boolean(data?.configured)); })
            // A failed status check means unavailable, not broken — the panel
            // just stays hidden rather than showing an error on a page whose
            // main job is the audit trail.
            .catch(() => { if (!cancelled) setConfigured(false); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [turns, pending]);

    const ask = async (text) => {
        const trimmed = text.trim();
        if (trimmed.length < 3 || pending) return;

        setQuestion('');
        setPending(true);
        setTurns((prev) => [...prev, { role: 'user', text: trimmed }]);

        try {
            const result = await assistantApi.query(trimmed);
            setTurns((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    text: result.answer,
                    records: result.matchedRecords || [],
                },
            ]);
        } catch (err) {
            setTurns((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    error: true,
                    text: err?.uiMessage || 'The assistant could not answer that question.',
                },
            ]);
        } finally {
            setPending(false);
        }
    };

    if (configured === null || configured === false) return null;

    return (
        <Card goldAccent={false}>
            <CardHeader>
                <div>
                    <CardTitle>Ask the Audit Assistant</CardTitle>
                    <p className="mt-1 text-xs text-slate-400">
                        Answers are drawn only from the audit trail, and every record used is shown below the answer.
                    </p>
                </div>
            </CardHeader>
            <CardContent>
                <div
                    className="max-h-[26rem] space-y-4 overflow-y-auto pr-1"
                    role="log"
                    aria-live="polite"
                    aria-busy={pending}
                >
                    {turns.length === 0 && !pending && (
                        <div className="py-6 text-center">
                            <span className="material-symbols-outlined text-4xl text-slate-600" aria-hidden="true">
                                forum
                            </span>
                            <p className="mt-2 text-sm text-slate-400">
                                Ask a question about the audit trail in plain English.
                            </p>
                            <div className="mt-4 flex flex-wrap justify-center gap-2">
                                {SUGGESTIONS.map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => ask(s)}
                                        className="rounded-full border border-[#1F293D] px-3 py-1.5 text-[11px] font-semibold text-slate-300 transition-colors hover:border-[#D4AF37] hover:text-[#D4AF37]"
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {turns.map((turn, i) => (
                        <div key={i} className={turn.role === 'user' ? 'flex justify-end' : ''}>
                            {turn.role === 'user' ? (
                                <p className="max-w-[80%] rounded-lg rounded-br-sm bg-[#1E5FA8] px-3 py-2 text-sm text-white">
                                    {turn.text}
                                </p>
                            ) : (
                                <div className="max-w-full">
                                    <p
                                        className={`rounded-lg rounded-bl-sm border px-3 py-2 text-sm whitespace-pre-wrap ${
                                            turn.error
                                                ? 'border-red-500/40 bg-red-500/5 text-red-400'
                                                : 'border-[#1F293D] bg-[#0D1F38] text-slate-200'
                                        }`}
                                        role={turn.error ? 'alert' : undefined}
                                    >
                                        {turn.text}
                                    </p>

                                    {turn.records?.length > 0 && (
                                        <details className="mt-2" open>
                                            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-[#D4AF37]">
                                                {turn.records.length} record{turn.records.length === 1 ? '' : 's'} this answer is based on
                                            </summary>
                                            <ul className="mt-2 space-y-1">
                                                {turn.records.map((record) => (
                                                    <li
                                                        key={record.id}
                                                        className="flex items-center gap-2 rounded border border-[#1F293D] bg-[#060D1A] px-2 py-1.5"
                                                    >
                                                        <span
                                                            className={`material-symbols-outlined text-[16px] ${getActionColor(record.type)}`}
                                                            aria-hidden="true"
                                                        >
                                                            {getActionIcon(record.type)}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-xs font-semibold text-white">
                                                                {record.type}
                                                            </span>
                                                            <span className="block truncate text-[10px] text-slate-500">
                                                                {record.actor?.displayName || 'System'}
                                                                {record.targetId ? ` · ${record.targetId}` : ''}
                                                            </span>
                                                        </span>
                                                        <span className="shrink-0 font-mono text-[10px] text-slate-500">
                                                            {formatAuditDate(record.timestamp)}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </details>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}

                    {pending && (
                        <p className="flex items-center gap-2 text-sm text-slate-400">
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#D4AF37] border-t-transparent" />
                            Searching the audit trail…
                        </p>
                    )}
                    <div ref={endRef} />
                </div>

                <form
                    className="mt-4 flex gap-2"
                    onSubmit={(e) => { e.preventDefault(); ask(question); }}
                >
                    <label htmlFor="assistant-question" className="sr-only">
                        Ask a question about the audit trail
                    </label>
                    <input
                        id="assistant-question"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        placeholder="e.g. Who was denied access to the crypto lab?"
                        maxLength={1000}
                        disabled={pending}
                        className="flex-1 rounded border border-[#1F293D] bg-[#060D1A] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#D4AF37] focus:outline-none disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={pending || question.trim().length < 3}
                        className="rounded bg-[#D4AF37] px-4 py-2 text-xs font-bold text-[#0D1F38] transition-colors hover:bg-[#c09d2d] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Ask
                    </button>
                </form>
            </CardContent>
        </Card>
    );
}
