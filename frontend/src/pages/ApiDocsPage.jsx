import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import { BASE_URL, OVERVIEW, CONVENTIONS, ENUMS, GROUPS } from '../config/apiDocs';

/**
 * Public API reference (/docs).
 *
 * The audience is a BEL integrator deciding whether BELTAL can sit underneath
 * an existing HRMS or badge controller, so it is written as integration
 * documentation rather than marketing: real field names, real status codes,
 * and the awkward details (which responses skip the envelope, which routes are
 * machine-only) stated plainly rather than tidied away.
 *
 * Motion is decorative and always optional: every animation is defined in
 * index.css and switched off under prefers-reduced-motion.
 */

const METHOD_STYLES = {
  GET: { badge: 'bg-emerald-50 text-emerald-700 border-emerald-300', accent: '#059669' },
  POST: { badge: 'bg-blue-50 text-[#1565C0] border-blue-300', accent: '#1565C0' },
  PATCH: { badge: 'bg-amber-50 text-amber-700 border-amber-300', accent: '#D97706' },
  DELETE: { badge: 'bg-red-50 text-red-700 border-red-300', accent: '#DC2626' },
};
const FALLBACK_METHOD = { badge: 'border-slate-300 bg-slate-100 text-slate-700', accent: '#64748B' };

const endpointKey = (endpoint) => `${endpoint.method} ${endpoint.path}`;
const panelIdFor = (endpoint) => `ep-${endpointKey(endpoint)}`.replace(/[^a-zA-Z0-9-]/g, '-');

/* ── Hooks ─────────────────────────────────────────────────── */

/** Fades sections in as they scroll into view. Adds a class directly, so it never re-renders. */
function useReveal(deps) {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll('.docs-reveal:not(.is-visible)'));
    if (!nodes.length) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      nodes.forEach((n) => n.classList.add('is-visible'));
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/** Counts up to `target` once, easing out. */
function useCountUp(target, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const frame = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(frame);
    }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

/* ── Small pieces ──────────────────────────────────────────── */

function GovBanner() {
  return (
    <div className="w-full bg-primary-container min-h-9 border-b-2 border-tertiary-container px-4 md:px-margin-desktop py-1.5 flex items-center justify-center md:justify-between z-50 relative">
      <span className="text-on-primary font-code-sm text-[10px] md:text-code-sm tracking-wider uppercase opacity-95 text-center">
        Government of India | Ministry of Defence
      </span>
      <span className="hidden md:inline text-on-primary font-code-sm text-code-sm tracking-wide opacity-90">
        A Navratna Company | CIN: L32309KA1954GOI000787
      </span>
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="w-full border-b border-[#DAE3F7] bg-[#F0F3FF]">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2.5 text-sm">
        <Link to="/" className="font-medium text-[#1E5FA8] transition-colors hover:text-[#0B2545]">
          Home
        </Link>
        <span className="text-slate-400" aria-hidden="true">/</span>
        <span className="font-semibold text-[#0B2545]">API Documentation</span>
      </div>
    </nav>
  );
}

/** Copy-to-clipboard that degrades quietly where the clipboard API is blocked. */
function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-all duration-200 active:scale-95 ${
        copied
          ? 'border-emerald-400 bg-emerald-500/15 text-emerald-300'
          : 'border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white'
      }`}
    >
      <span className="material-symbols-outlined text-[13px]" aria-hidden="true">
        {copied ? 'check' : 'content_copy'}
      </span>
      {copied ? 'Copied' : label}
    </button>
  );
}

// Strings (keys get their own colour), booleans/null and numbers. Rendered as
// React nodes, never as HTML, so nothing in the content can inject markup.
const TOKEN_SOURCE = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/;

function Highlighted({ code }) {
  const nodes = [];
  let last = 0;
  let key = 0;
  let match;
  // A fresh regex per call: a shared /g regex carries lastIndex state between renders.
  const token = new RegExp(TOKEN_SOURCE.source, 'g');
  while ((match = token.exec(code)) !== null) {
    if (match.index > last) nodes.push(code.slice(last, match.index));
    if (match[1]) {
      if (match[2]) {
        nodes.push(<span key={key++} className="text-[#7AB0FE]">{match[1]}</span>, match[2]);
      } else {
        nodes.push(<span key={key++} className="text-[#A5E3B0]">{match[1]}</span>);
      }
    } else if (match[3]) {
      nodes.push(<span key={key++} className="text-[#F2A65A]">{match[3]}</span>);
    } else {
      nodes.push(<span key={key++} className="text-[#E8CC71]">{match[0]}</span>);
    }
    last = match.index + match[0].length;
  }
  if (last < code.length) nodes.push(code.slice(last));
  return nodes;
}

function CodeBlock({ code, caption }) {
  if (!code) return null;
  return (
    <div className="docs-code-sheen overflow-hidden rounded-lg border border-[#1F293D] bg-[#0D1F38]">
      <div className="flex items-center justify-between border-b border-[#1F293D] px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#D4AF37]">{caption}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto px-3 py-3 text-[12px] leading-relaxed text-slate-200">
        <code><Highlighted code={code} /></code>
      </pre>
    </div>
  );
}

function MethodBadge({ method }) {
  const style = METHOD_STYLES[method] || FALLBACK_METHOD;
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-2 py-0.5 font-mono text-[11px] font-bold ${style.badge}`}>
      {method}
    </span>
  );
}

/** "404: not found" renders as a coloured status chip followed by the text. */
function ErrorLine({ text }) {
  const match = /^(\d{3}): (.*)$/.exec(text);
  if (!match) {
    return (
      <li className="flex gap-2 text-[13px] text-slate-600">
        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-400" aria-hidden="true" />
        {text}
      </li>
    );
  }
  const code = match[1];
  const tone =
    code.startsWith('5') ? 'bg-red-50 text-red-700 border-red-200'
    : code === '429' ? 'bg-purple-50 text-purple-700 border-purple-200'
    : 'bg-amber-50 text-amber-800 border-amber-200';
  return (
    <li className="flex items-start gap-2 text-[13px] text-slate-600">
      <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-px font-mono text-[11px] font-bold ${tone}`}>{code}</span>
      <span>{match[2]}</span>
    </li>
  );
}

function Endpoint({ endpoint, open, onToggle }) {
  const panelId = panelIdFor(endpoint);
  const style = METHOD_STYLES[endpoint.method] || FALLBACK_METHOD;

  return (
    <article
      data-open={open}
      style={{ '--accent': style.accent }}
      className="docs-endpoint overflow-hidden rounded-xl border border-[#DCE6F5] bg-white shadow-sm"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-3 py-3.5 pl-5 pr-4 text-left"
      >
        <MethodBadge method={endpoint.method} />
        <span className="min-w-0 flex-1">
          <code className="block break-all font-mono text-[13px] font-bold text-[#0B2545]">{endpoint.path}</code>
          <span className="mt-1 block text-sm leading-relaxed text-slate-600">{endpoint.summary}</span>
        </span>
        <span className="hidden shrink-0 items-center gap-1 rounded-full bg-[#F0F3FF] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#1E5FA8] sm:inline-flex">
          <span className="material-symbols-outlined text-[13px]" aria-hidden="true">lock</span>
          {endpoint.auth}
        </span>
        <span className="docs-chevron material-symbols-outlined shrink-0 text-[20px] text-slate-400" aria-hidden="true">
          expand_more
        </span>
      </button>

      <div id={panelId} className="docs-collapse" data-open={open} inert={!open}>
        <div>
          <div className="space-y-4 border-t border-[#E8EEF8] bg-[#FAFCFF] py-4 pl-5 pr-4">
            <div className="flex flex-wrap gap-2 sm:hidden">
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F0F3FF] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#1E5FA8]">
                <span className="material-symbols-outlined text-[13px]" aria-hidden="true">lock</span>
                {endpoint.auth}
              </span>
            </div>

            {endpoint.note && (
              <p className="rounded-lg border-l-4 border-[#D4AF37] bg-[#FFFBEF] px-3 py-2 text-[13px] leading-relaxed text-[#6B5A1E]">
                {endpoint.note}
              </p>
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              {endpoint.request && <CodeBlock code={endpoint.request} caption="Request" />}
              <CodeBlock code={endpoint.response} caption={`Response · ${endpoint.status || '200 OK'}`} />
            </div>

            {endpoint.errors?.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Errors</p>
                <ul className="space-y-1.5">
                  {endpoint.errors.map((err) => <ErrorLine key={err} text={err} />)}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function SectionHeading({ icon, title, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#E8F1FF] to-[#D4E4FA] text-[#1565C0] shadow-sm">
        <span className="material-symbols-outlined text-[22px]" aria-hidden="true">{icon}</span>
      </span>
      <div className="min-w-0">
        <h2 className="text-2xl font-black tracking-tight text-[#0B2545]">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function HeroStat({ value, label, index }) {
  return (
    <div
      style={{ '--i': index }}
      className="docs-hero-item rounded-xl border border-white/15 bg-white/[0.07] px-4 py-3 backdrop-blur-sm"
    >
      <p className="text-2xl font-black tabular-nums text-white">{value}</p>
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#9DC4EE]">{label}</p>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────── */

export default function ApiDocsPage() {
  const [query, setQuery] = useState('');
  const [activeSection, setActiveSection] = useState('overview');
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const [showTop, setShowTop] = useState(false);
  const progressRef = useRef(null);

  useEffect(() => {
    document.title = 'BELTAL API Documentation';
  }, []);

  // Filter endpoints by path or summary; a group disappears once nothing in it
  // matches, so searching "lockdown" narrows the whole page to one card.
  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((group) => ({
      ...group,
      endpoints: group.endpoints.filter(
        (e) =>
          e.path.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.method.toLowerCase() === q
      ),
    })).filter((group) => group.endpoints.length > 0);
  }, [query]);

  const totalEndpoints = useMemo(() => GROUPS.reduce((sum, g) => sum + g.endpoints.length, 0), []);
  const shownEndpoints = useMemo(
    () => filteredGroups.reduce((sum, g) => sum + g.endpoints.length, 0),
    [filteredGroups]
  );
  const endpointCount = useCountUp(totalEndpoints);
  const groupCount = useCountUp(GROUPS.length, 700);

  useReveal([filteredGroups]);

  const toggleEndpoint = useCallback((key) => {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAll = () => setOpenKeys(new Set(filteredGroups.flatMap((g) => g.endpoints.map(endpointKey))));
  const collapseAll = () => setOpenKeys(new Set());

  // Highlight the section currently in view in the sidebar.
  useEffect(() => {
    const ids = ['overview', 'conventions', 'enums', ...GROUPS.map((g) => g.id)];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      { rootMargin: '-20% 0px -70% 0px' }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [filteredGroups]);

  // Reading progress bar and the back-to-top button, without re-rendering per scroll tick.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const progress = max > 0 ? Math.min(1, window.scrollY / max) : 0;
        progressRef.current?.style.setProperty('--p', String(progress));
        setShowTop(window.scrollY > 700);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const navItems = [
    { id: 'overview', label: 'Overview', icon: 'hub' },
    { id: 'conventions', label: 'Conventions', icon: 'rule' },
    { id: 'enums', label: 'Reference values', icon: 'list' },
    ...GROUPS.map((g) => ({ id: g.id, label: g.title, icon: g.icon })),
  ];

  const scrollToTop = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FFFDF5]">
      <div ref={progressRef} className="docs-progress" aria-hidden="true" />
      <GovBanner />
      <SiteHeader mode="page" />
      <Breadcrumb />

      {/* ── Hero ── */}
      <section className="docs-hero border-b border-[#DAE3F7] bg-[linear-gradient(135deg,#0A2748_0%,#123D67_62%,#17577E_100%)] px-4 py-12 sm:px-6 sm:py-16">
        <span className="docs-blob -left-16 top-4 h-64 w-64 bg-[#1565C0]/50" aria-hidden="true" />
        <span className="docs-blob -right-10 bottom-0 h-72 w-72 bg-[#D4AF37]/25" style={{ animationDelay: '-6s' }} aria-hidden="true" />

        <div className="mx-auto max-w-7xl">
          <div style={{ '--i': 0 }} className="docs-hero-item mb-4 inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/10 px-3 py-1.5 text-[11px] font-bold tracking-[0.14em] text-white">
            <span className="docs-live-dot h-2 w-2 rounded-full bg-[#E8CC71]" aria-hidden="true" />
            INTEGRATION REFERENCE
          </div>
          <h1 style={{ '--i': 1 }} className="docs-hero-item max-w-3xl text-3xl font-black tracking-tight text-white sm:text-5xl">
            BELTAL API Documentation
          </h1>
          <p style={{ '--i': 2 }} className="docs-hero-item mt-4 max-w-3xl text-base leading-7 text-[#D7E9FB]">
            BELTAL is designed to sit <em>underneath</em> the systems BEL already runs. Your HRMS keeps
            issuing employee records, your turnstiles keep reading badges, your ERP keeps tracking
            equipment. They simply call these endpoints as well, and every action gains a permanent,
            independently verifiable record.
          </p>
          <div style={{ '--i': 3 }} className="docs-hero-item mt-6 inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-white/20 bg-[#071D39]/40 px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#7AB0FE]">Base URL</span>
            <code className="min-w-0 break-all font-mono text-[13px] text-white">{BASE_URL}</code>
            <CopyButton text={BASE_URL} />
          </div>
          <div className="mt-6 grid max-w-xl grid-cols-3 gap-3">
            <HeroStat index={4} value={endpointCount} label="Endpoints" />
            <HeroStat index={5} value={groupCount} label="Areas" />
            <HeroStat index={6} value="JSON" label="Over HTTPS" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:flex lg:gap-10">
        {/* ── Sidebar ── */}
        <aside className="lg:w-60 lg:shrink-0">
          <div className="lg:sticky lg:top-24">
            <label htmlFor="docs-search" className="sr-only">Search endpoints</label>
            <div className="relative mb-2">
              <span
                className="material-symbols-outlined pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[18px] text-slate-400"
                aria-hidden="true"
              >
                search
              </span>
              <input
                id="docs-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search endpoints…"
                className="w-full rounded-lg border border-[#DCE6F5] bg-white py-2 pl-9 pr-3 text-sm text-[#0B2545] placeholder:text-slate-400 transition-shadow focus:border-[#1565C0] focus:shadow-[0_0_0_3px_rgba(21,101,192,0.12)] focus:outline-none"
              />
            </div>
            <div className="mb-4 flex items-center justify-between px-0.5 text-[11px] font-bold text-slate-500" aria-live="polite">
              <span>
                {query.trim() ? `${shownEndpoints} of ${totalEndpoints} endpoints` : `${totalEndpoints} endpoints`}
              </span>
              <span className="flex gap-2">
                <button type="button" onClick={expandAll} className="text-[#1565C0] transition-colors hover:text-[#0B2545]">Expand all</button>
                <span className="text-slate-300" aria-hidden="true">|</span>
                <button type="button" onClick={collapseAll} className="text-[#1565C0] transition-colors hover:text-[#0B2545]">Collapse</button>
              </span>
            </div>

            <nav aria-label="Documentation sections" className="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`docs-nav-link flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${
                    activeSection === item.id
                      ? 'bg-[#0B2545] text-white'
                      : 'text-slate-600 hover:bg-[#EDF3FC] hover:text-[#1565C0]'
                  }`}
                  aria-current={activeSection === item.id ? 'true' : undefined}
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{item.icon}</span>
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        {/* ── Content ── */}
        <main className="mt-8 min-w-0 flex-1 lg:mt-0">
          {/* Overview */}
          <section id="overview" className="scroll-mt-24">
            <div className="docs-reveal">
              <SectionHeading icon="hub" title="Overview">
                <p className="mt-3 max-w-3xl text-[15px] leading-7 text-slate-600">{OVERVIEW.intro}</p>
              </SectionHeading>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {OVERVIEW.points.map((point, index) => (
                <div
                  key={point.title}
                  style={{ '--d': `${index * 80}ms` }}
                  className="docs-reveal docs-card rounded-xl border border-[#DCE6F5] bg-white p-4 shadow-sm"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAF2FF] text-[#1565C0]">
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{point.icon}</span>
                  </span>
                  <h3 className="mt-3 text-sm font-bold text-[#0B2545]">{point.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{point.body}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Conventions */}
          <section id="conventions" className="mt-14 scroll-mt-24">
            <div className="docs-reveal">
              <SectionHeading icon="rule" title="Conventions">
                <p className="mt-2 text-[15px] text-slate-600">
                  These hold across every endpoint, so they are worth reading once before the reference below.
                </p>
              </SectionHeading>
            </div>
            <div className="mt-6 space-y-5">
              {CONVENTIONS.map((c) => (
                <div key={c.heading} className="docs-reveal docs-card rounded-xl border border-[#DCE6F5] bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-bold text-[#0B2545]">{c.heading}</h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{c.body}</p>
                  {c.code && (
                    <div className="mt-3">
                      <CodeBlock code={c.code} caption="Example" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Enums */}
          <section id="enums" className="mt-14 scroll-mt-24">
            <div className="docs-reveal">
              <SectionHeading icon="list" title="Reference values">
                <p className="mt-2 text-[15px] text-slate-600">
                  Accepted values for the enumerated fields. Anything outside these lists is rejected with a 400.
                </p>
              </SectionHeading>
            </div>
            <div className="docs-reveal mt-6 overflow-hidden rounded-xl border border-[#DCE6F5] bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#DCE6F5] bg-[#F7FAFF]">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Field</th>
                    <th scope="col" className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Accepted values</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EDF2FA]">
                  {ENUMS.map((e) => (
                    <tr key={e.name} className="transition-colors hover:bg-[#F7FAFF]">
                      <td className="px-4 py-3 align-top">
                        <code className="font-mono text-[12px] font-bold text-[#0B2545]">{e.name}</code>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {e.values.map((v) => (
                            <code key={v} className="rounded bg-[#F0F3FF] px-1.5 py-0.5 font-mono text-[11px] text-[#1E5FA8]">
                              {v}
                            </code>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Endpoint groups */}
          {filteredGroups.length === 0 && (
            <p className="ui-pop-in mt-14 rounded-xl border border-[#DCE6F5] bg-white p-8 text-center text-sm text-slate-500">
              No endpoint matches “{query}”.
            </p>
          )}

          {filteredGroups.map((group) => (
            <section key={group.id} id={group.id} className="mt-14 scroll-mt-24">
              <div className="docs-reveal">
                <SectionHeading icon={group.icon} title={group.title}>
                  <p className="mt-2 max-w-3xl text-[15px] leading-7 text-slate-600">{group.blurb}</p>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-wider text-[#1565C0]">
                    {group.endpoints.length} endpoint{group.endpoints.length === 1 ? '' : 's'}
                  </p>
                </SectionHeading>
              </div>
              <div className="mt-5 space-y-3">
                {group.endpoints.map((endpoint) => {
                  const key = endpointKey(endpoint);
                  return (
                    <div key={key} className="docs-reveal">
                      <Endpoint endpoint={endpoint} open={openKeys.has(key)} onToggle={() => toggleEndpoint(key)} />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* Footer note */}
          <section className="docs-reveal mt-16 overflow-hidden rounded-xl border border-[#DCE6F5] bg-[linear-gradient(135deg,#F7FAFF_0%,#EEF4FF_100%)] p-6">
            <h2 className="text-lg font-black text-[#0B2545]">Integrating an existing system</h2>
            <p className="mt-2 max-w-3xl text-[14px] leading-7 text-slate-600">
              A typical rollout provisions one System Connector identity per upstream system, so every
              automated action is attributable to a named machine rather than a shared credential. The
              HRMS feeds joiners through the bulk import, the badge controllers post taps to the PACS
              endpoint, and nothing in the existing user experience changes. What changes is that each of
              those actions now leaves a record that an auditor can verify without asking anyone at BEL
              to vouch for the database.
            </p>
            <Link
              to="/contact"
              className="group mt-4 inline-flex items-center gap-2 rounded-lg bg-[#1565C0] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0B2545]"
            >
              Talk to the team
              <span className="material-symbols-outlined text-[18px] transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">
                arrow_forward
              </span>
            </Link>
          </section>
        </main>
      </div>

      <button
        type="button"
        onClick={scrollToTop}
        data-show={showTop}
        aria-label="Back to top"
        tabIndex={showTop ? 0 : -1}
        className="docs-top fixed bottom-6 right-6 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-[#0B2545] text-white shadow-lg transition-colors hover:bg-[#1565C0]"
      >
        <span className="material-symbols-outlined text-[22px]" aria-hidden="true">arrow_upward</span>
      </button>

      <SiteFooter />
    </div>
  );
}
