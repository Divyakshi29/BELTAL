import { useState } from 'react'
import { motion } from 'framer-motion'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'
import useModalA11y from '../hooks/useModalA11y'

/** Fade-up scroll reveal — used consistently across every section below the
 * hero (the hero animates in on mount instead, since it's visible immediately). */
const revealUp = {
  hidden:  { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } },
}
const revealContainer = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.09 } },
}

/**
 * LandingPage — faithful React conversion of code.html
 * Uses the Tailwind v4 custom tokens defined in DESIGN.md / tailwind.config
 *
 * Tailwind token quick-ref (from code.html tailwind-config):
 *   primary            = #001631
 *   primary-container  = #0D2B4E
 *   secondary          = #1E5FA8
 *   secondary-container= #7ab0fe
 *   tertiary-container = #c8a74c   (Navratna Gold)
 *   surface            = #f9f9ff
 *   surface-container-lowest = #ffffff
 *   surface-container-low    = #f0f3ff
 *   on-primary         = #ffffff
 *   on-primary-container = #7993bc
 *   on-surface-variant = #43474e
 *   outline            = #74777f
 *   outline-variant    = #c4c6cf
 */

/* ─────────────────────────────────────────────────────────
   GOVERNMENT BANNER  (code.html lines 46-54)
───────────────────────────────────────────────────────── */
function GovBanner() {
  return (
    <div className="w-full bg-primary-container min-h-9 border-b-2 border-tertiary-container px-4 md:px-margin-desktop py-1.5 flex items-center justify-center md:justify-between z-50 relative">
      <div className="flex items-center gap-space-sm">
        <span className="text-on-primary font-code-sm text-[10px] md:text-code-sm tracking-wider uppercase opacity-95 text-center">
          Government of India | Ministry of Defence
        </span>
      </div>
      <div className="hidden md:flex items-center gap-space-sm">
        <span className="text-on-primary font-code-sm text-code-sm tracking-wide opacity-90">
          A Navratna Company | CIN: L32309KA1954GOI000787
        </span>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   SECTION 1: HERO  (code.html lines 91-375)
───────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────
   PROBLEM STATEMENT MODAL
───────────────────────────────────────────────────────── */
const PROBLEM_PAIRS = [
  {
    id: 1,
    title: 'Centralized Identity Vulnerability',
    problem:
      'Centralized databases represent single points of failure vulnerable to state-sponsored intrusions and credential leaks.',
    solution:
      'W3C Decentralized Identifiers (DIDs) with zero-knowledge cryptographic authentication across defense personnel.',
  },
  {
    id: 2,
    title: 'Untracked Supply Chain & Counterfeiting',
    problem:
      'Mission-critical hardware components and classified asset movements are difficult to audit across disparate legacy registries.',
    solution:
      'Non-fungible Asset Provenance (NFTs) that register immutable custody transfers directly on-chain.',
  },
  {
    id: 3,
    title: 'Authorization Latency & Siloed Approvals',
    problem:
      'Manual, paper-bound multi-agency clearance bottlenecks slow tactical deployment during critical operations.',
    solution:
      'Self-executing Byzantine Fault Tolerant (BFT) Smart Contracts granting instantaneous, role-based cryptographic clearances.',
  },
]

function ProblemModal({ onClose }) {
  const dialogRef = useModalA11y(onClose)

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="problem-modal-title"
    >
      <div ref={dialogRef} className="bg-surface-container-lowest border-2 border-tertiary-container rounded-2xl max-w-4xl w-full p-6 md:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto">

        {/* Close button */}
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center text-outline hover:text-primary-container hover:bg-tertiary-container/15 transition-all"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-6">
          <span className="text-[10px] font-bold tracking-widest text-primary-container bg-tertiary-container/20 px-2.5 py-1 rounded uppercase">
            Defence Ledger Mandate
          </span>
          <h2
            id="problem-modal-title"
            className="text-2xl md:text-3xl font-bold text-primary-container mt-3 leading-snug"
          >
            Problem Statements &amp; BELTAL Solutions
          </h2>
          <div className="mt-2 h-0.5 w-20 rounded bg-tertiary-container" />
        </div>

        {/* 3 paired cards */}
        <div className="flex flex-col gap-5">
          {PROBLEM_PAIRS.map(({ id, title, problem, solution }) => (
            <div
              key={id}
              className="bg-white rounded-xl border border-outline-variant shadow-sm overflow-hidden"
            >
              {/* Card header */}
              <div className="bg-primary-container px-5 py-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-tertiary-container/20 border border-tertiary-container/40 flex items-center justify-center shrink-0">
                  <span className="text-[11px] font-black text-tertiary-container">{String(id).padStart(2, '0')}</span>
                </span>
                <h3 className="text-[13px] font-bold text-white tracking-wide">{title}</h3>
              </div>

              {/* Problem / Solution row */}
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                {/* Problem */}
                <div className="p-4 flex gap-3 items-start">
                  <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
                    <span aria-hidden="true" className="material-symbols-outlined text-red-500 text-[15px]">warning</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-red-600 uppercase mb-1">Problem</p>
                    <p className="text-[13px] text-slate-700 leading-relaxed">{problem}</p>
                  </div>
                </div>

                {/* Solution */}
                <div className="p-4 flex gap-3 items-start bg-secondary/5">
                  <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-secondary/10 border border-secondary/20 flex items-center justify-center">
                    <span aria-hidden="true" className="material-symbols-outlined text-secondary text-[15px]" style={{ fontVariationSettings: '"FILL" 1' }}>shield</span>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-secondary uppercase mb-1">BELTAL Solution</p>
                    <p className="text-[13px] text-slate-700 leading-relaxed">{solution}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-8 flex justify-center">
          <button
            onClick={onClose}
            className="bg-primary-container hover:bg-primary text-white px-8 py-2.5 rounded-xl font-bold text-[14px] transition-all shadow-md flex items-center gap-2"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">check_circle</span>
            Understood &amp; Return to Platform
          </button>
        </div>
      </div>
    </div>
  )
}

function HeroSection() {
  const [isProblemModalOpen, setIsProblemModalOpen] = useState(false)

  return (
    <>
    <section id="platform" className="w-full bg-gradient-to-b from-[#E8F1FB] to-surface-container-lowest py-24 px-8 border-b border-surface-container-highest">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 items-center gap-12">

        {/* LEFT: 7 cols */}
        <motion.div
          className="lg:col-span-7 flex flex-col items-start"
          initial="hidden"
          animate="visible"
          variants={revealContainer}
        >
          {/* Badge */}
          <motion.div variants={revealUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#E8F1FB] border border-[#3B82C4]/30 font-label-md text-label-md font-bold text-secondary uppercase tracking-wider mb-6 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-secondary" />
            <span>BLOCKCHAIN &amp; CYBERSECURITY INITIATIVE</span>
          </motion.div>

          {/* H1 */}
          <motion.h1 variants={revealUp} className="font-display-hero text-display-hero text-primary-container leading-tight mb-5 tracking-tight">
            Secure Digital Identity. <br className="hidden sm:inline" />
            <span className="text-secondary">Tamper-Proof</span> Asset Ownership.
          </motion.h1>

          {/* Sub */}
          <motion.p variants={revealUp} className="text-[18px] text-on-surface-variant w-full max-w-3xl mb-10 leading-relaxed font-normal tracking-wide">
            BELTAL is Bharat Electronics Limited's blockchain-backed layer for decentralized identity,
            role-based access control, and NFT-based asset ownership. It sits underneath BEL's existing
            systems, giving every identity change, access grant, and asset transfer a permanent,
            independently verifiable record — combining W3C-compliant decentralized identifiers with
            role-based smart contracts, so no single system holds the sole copy of the truth.
          </motion.p>

          {/* 3 Stat Badges */}
          <motion.div variants={revealUp} className="flex flex-wrap sm:flex-nowrap items-center gap-4 sm:gap-6 mb-8 w-full">
            {[
              { icon: 'shield', fill: true, label: '100% Decentralized' },
              { icon: 'token', fill: false, label: 'NFT-Based Ownership' },
              { icon: 'lock', fill: true, label: 'Smart Contract Secured' },
            ].map(({ icon, fill, label }) => (
              <div
                key={label}
                className="bg-[#FFFDF8] border border-amber-200/40 py-3 px-5 rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-3 flex-1 min-w-[150px]"
              >
                <div className="w-8 h-8 rounded bg-[#E8F1FB] flex items-center justify-center text-secondary shrink-0">
                  <span aria-hidden="true" className="material-symbols-outlined text-[20px]"
                    style={fill ? { fontVariationSettings: '"FILL" 1' } : {}}
                  >
                    {icon}
                  </span>
                </div>
                <span className="font-label-md text-label-md font-bold text-primary-container leading-tight">
                  {label}
                </span>
              </div>
            ))}
          </motion.div>

          {/* CTAs */}
          <motion.div variants={revealUp} className="flex flex-wrap items-center gap-4 sm:gap-6 mb-6">
            <a
              className="bg-secondary hover:bg-[#164882] text-on-secondary font-headline-sm text-[18px] font-bold px-8 py-4 rounded-xl inline-flex items-center gap-3 shadow-lg hover:shadow-xl transition-all focus:ring-2 focus:ring-[#3B82C4]"
              href="#features"
            >
              <span>Explore Platform</span>
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </a>
            <button
              className="bg-surface-container-lowest border-2 border-secondary text-secondary hover:bg-[#E8F1FB] font-headline-sm text-[18px] font-bold px-8 py-4 rounded-xl inline-flex items-center gap-2 transition-all shadow-xs cursor-pointer"
              onClick={() => setIsProblemModalOpen(true)}
            >
              <span>View Problem Statement</span>
            </button>
          </motion.div>

          {/* Trust line */}
          <motion.div variants={revealUp} className="flex items-center gap-2 font-code-sm text-code-sm text-outline font-medium">
            <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-tertiary">verified_user</span>
            <span>No centralized database • ISO 27001 Compliant • Made in India</span>
          </motion.div>
        </motion.div>

        {/* RIGHT: 5 cols — Mockup Dashboard */}
        <motion.div
          className="lg:col-span-5 relative flex justify-center"
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
        >
          <div className="w-full max-w-[480px] backdrop-blur rounded-2xl border shadow-xl p-6 relative overflow-visible bg-[#FFFDF5] border-tertiary-container/40">

            {/* Top status header */}
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-4 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span className="font-label-sm text-label-sm font-bold text-primary-container tracking-wider">
                  LEDGER ONLINE
                </span>
              </div>
              <div className="flex items-center gap-2 font-code-sm text-code-sm text-outline font-semibold">
                <span>Block #4,928,192</span>
              </div>
            </div>

            {/* Consensus bar */}
            <div className="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded mb-5 border border-slate-100">
              <span className="font-code-sm text-code-sm text-on-surface-variant font-medium">Consensus State</span>
              <span className="font-label-sm text-label-sm font-bold text-secondary flex items-center gap-1">
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">done_all</span>
                100% Byzantine Fault Tolerant
              </span>
            </div>

            {/* Recent ledger activity */}
            <div className="w-full bg-primary-container rounded-xl relative p-4 mb-5 overflow-hidden border border-primary shadow-inner">
              <div className="absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

              <div className="relative z-10 flex items-center justify-between mb-3">
                <span className="font-label-sm text-label-sm font-bold text-on-primary-container uppercase tracking-wider">
                  Recent Ledger Activity
                </span>
              </div>

              <div className="relative z-10 flex flex-col gap-2">
                {[
                  { icon: 'badge', label: 'DID issued', detail: 'Identity Registry', block: '4,928,190' },
                  { icon: 'token', label: 'NFT asset minted', detail: 'Asset Ledger', block: '4,928,191' },
                  { icon: 'policy', label: 'Access role granted', detail: 'RBAC Contract', block: '4,928,192' },
                ].map(({ icon, label, detail, block }) => (
                  <div key={label} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                    <span className="w-7 h-7 rounded-full bg-secondary/20 border border-secondary/30 flex items-center justify-center shrink-0">
                      <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-secondary-container">{icon}</span>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-label-sm text-label-sm font-bold text-on-primary leading-tight">{label}</p>
                      <p className="font-code-sm text-code-sm text-on-primary-container leading-tight">{detail}</p>
                    </div>
                    <span className="font-code-sm text-[10px] text-outline-variant shrink-0">#{block}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Identity Credential Inset */}
            <div className="bg-surface-container-low border border-[#E2E8F0] rounded-xl p-3.5 mb-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-label-sm uppercase font-bold text-on-surface-variant">
                  Identity Credential Inset
                </span>
                <span className="bg-[#FFFDF5] text-tertiary border border-tertiary-container font-label-sm text-label-sm px-2 py-0.5 rounded font-bold">
                  Role: Auditor
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-code-sm text-code-sm text-outline">DID:</span>
                <span className="font-code-sm text-code-sm font-semibold text-primary-container truncate max-w-[210px]">
                  did:bharat:bel-8921a-9f4c
                </span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
                <span aria-hidden="true" className="material-symbols-outlined text-[15px] text-emerald-600">fingerprint</span>
                <span className="font-code-sm text-code-sm text-outline">
                  Biometric Hash: <span className="text-on-surface font-semibold">0x9F...A302 (HSM Signed)</span>
                </span>
              </div>
            </div>

            {/* NFT Badge */}
            <div className="flex items-center justify-between bg-surface border border-slate-200 rounded-lg px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-secondary">verified</span>
                <span className="font-code-sm text-code-sm font-semibold text-on-surface">Defence Contract #7821-C</span>
              </div>
              <span className="bg-secondary/10 text-secondary font-label-sm text-label-sm px-2 py-0.5 rounded font-bold">
                Immutable NFT
              </span>
            </div>

            {/* Floating badge */}
            <div className="absolute -bottom-4 -left-4 z-20 bg-surface-container-lowest px-4 py-2.5 rounded-xl shadow-lg border border-emerald-200 flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
                <span aria-hidden="true" className="material-symbols-outlined text-[16px] font-bold">check</span>
              </div>
              <div className="flex flex-col">
                <span className="font-label-md text-label-md font-bold text-primary-container leading-none">Identity Verified</span>
                <span className="font-code-sm text-code-sm text-outline leading-tight mt-0.5">DID Credential Active</span>
              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </section>

    {/* Problem Statement Modal */}
    {isProblemModalOpen && <ProblemModal onClose={() => setIsProblemModalOpen(false)} />}
    </>
  )
}

/* ─────────────────────────────────────────────────────────
   SECTION 2: TRUST STRIP  (code.html lines 377-413)
───────────────────────────────────────────────────────── */
function TrustSection() {
  const partners = [
    { name: 'BEL', sub: 'Defence Electronics' },
    { name: 'DRDO', sub: 'R&D Ecosystem' },
    { name: 'NIC', sub: 'National Informatics' },
    { name: 'MeitY', sub: 'Electronics & IT' },
    { name: 'Digital India', sub: 'Govt. Digital Infra' },
  ]

  return (
    <section className="w-full border-t border-[#E2E8F0] bg-[#E8F1FB]">
      <motion.div
        className="max-w-7xl mx-auto py-6 px-4 md:px-8"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        variants={revealContainer}
      >

        {/* Section header row */}
        <motion.div variants={revealUp} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <span className="text-xs md:text-sm font-bold tracking-widest text-[#0B2545] uppercase">
            Trusted by Defence &amp; Government Sectors
          </span>

          {/* Compliance badge pill */}
          <span className="inline-flex items-center gap-1.5 bg-blue-50/80 border border-blue-200/60 px-3 py-1.5 rounded-full text-blue-900 text-xs font-semibold whitespace-nowrap">
            <span aria-hidden="true" className="material-symbols-outlined text-[14px] text-blue-700">gavel</span>
            Aligned with Ministry of Defence &amp; Digital India Guidelines
          </span>
        </motion.div>

        {/* Partner cards */}
        <motion.div variants={revealUp} className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mt-4">
          {partners.map(({ name, sub }) => (
            <div
              key={name}
              className="bg-white border border-slate-200/70 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-blue-300 transition-all duration-200 flex flex-col items-center justify-center text-center cursor-default"
            >
              <span className="font-extrabold text-[#0B2545] text-base tracking-wide leading-tight">
                {name}
              </span>
              <span className="text-[10px] text-slate-500 font-medium mt-0.5">
                {sub}
              </span>
            </div>
          ))}
        </motion.div>

      </motion.div>
    </section>
  )
}


/* ─────────────────────────────────────────────────────────
   SECTION 3: FEATURES  (code.html lines 415-498)
───────────────────────────────────────────────────────── */
function FeaturesSection() {
  const cards = [
    {
      icon: 'badge',
      title: 'Decentralized Identity',
      desc: 'Each user gets a unique decentralized identifier, independent of centralized authorities',
      tag: 'W3C COMPLIANT SPEC',
    },
    {
      icon: 'token',
      title: 'NFT Asset Ownership',
      desc: 'Digital assets represented as NFTs, ensuring unique, traceable, permanent ownership records',
      tag: 'CRYPTOGRAPHIC PROVENANCE',
    },
    {
      icon: 'policy',
      title: 'Smart Contract Governance',
      desc: 'Automated operations governed by smart contracts, allowing only authorized transactions',
      tag: 'ZERO TRUST AUTOMATION',
    },
  ]

  return (
    <section className="w-full py-24 px-8 border-t border-[#E2E8F0] bg-[#FFFDF5]" id="features">
      <motion.div
        className="max-w-7xl mx-auto text-center flex flex-col items-center"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={revealContainer}
      >
        <motion.div variants={revealUp} className="inline-block px-4 py-2 rounded-full bg-[#E8F1FB] font-label-md text-label-md font-bold text-secondary uppercase tracking-wider mb-4 border border-[#3B82C4]/20">
          COMPREHENSIVE SECURITY ENGINE
        </motion.div>
        <motion.h2 variants={revealUp} className="font-headline-lg text-headline-lg font-bold text-primary-container mb-4 tracking-tight max-w-3xl">
          Everything Required for Secure Digital Governance
        </motion.h2>
        <motion.p variants={revealUp} className="text-[20px] font-medium text-on-surface-variant max-w-4xl mx-auto mb-16 leading-relaxed tracking-wide">
          Detect vulnerabilities, ensure identity authenticity, and maintain transparent ownership records
          before threats emerge
        </motion.p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-left w-full">
          {cards.map(({ icon, title, desc, tag }) => (
            <motion.div
              key={title}
              variants={revealUp}
              className="bg-white border border-slate-200/80 p-8 rounded-2xl shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col relative group"
            >
              <div className="w-12 h-12 rounded-lg bg-[#E8F1FB] flex items-center justify-center text-secondary mb-6 group-hover:scale-105 transition-transform">
                <span aria-hidden="true" className="material-symbols-outlined text-[32px]">{icon}</span>
              </div>
              <h3 className="font-headline-sm text-headline-sm font-bold text-primary-container mb-3">{title}</h3>
              <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">{desc}</p>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center text-secondary font-label-sm text-label-sm font-bold gap-1">
                <span>{tag}</span>
                <span aria-hidden="true" className="material-symbols-outlined text-[14px]">arrow_right_alt</span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  )
}

function HowItWorksSection() {
  const steps = [
    {
      num: '01',
      title: 'User Registration',
      desc: 'Decentralized ID creation with cryptographic biometric verification',
      icon: 'person_add',
      iconColor: 'text-blue-600',
      ringColor: 'ring-blue-100',
    },
    {
      num: '02',
      title: 'Identity Verification',
      desc: 'Multi-layer zero-trust authentication using blockchain proofs and HSM signatures',
      icon: 'gpp_good',
      iconColor: 'text-blue-600',
      ringColor: 'ring-blue-100',
    },
    {
      num: '03',
      title: 'Asset Minting',
      desc: 'Digital assets tokenized as immutable NFTs on the BELTAL ledger',
      icon: 'token',
      iconColor: 'text-amber-600',
      ringColor: 'ring-amber-100',
    },
    {
      num: '04',
      title: 'Smart Governance',
      desc: 'Automated access control and audit trails enforced by role-based smart contracts',
      icon: 'memory',
      iconColor: 'text-emerald-600',
      ringColor: 'ring-emerald-100',
    },
  ]

  return (
    <section id="technology" className="w-full bg-[#E8F1FB] py-20 px-8 border-t border-[#E2E8F0]">
      <motion.div
        className="max-w-7xl mx-auto flex flex-col items-center text-center"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-80px' }}
        variants={revealContainer}
      >

        {/* Top pill badge */}
        <motion.div variants={revealUp} className="inline-flex items-center gap-2 bg-[#0F284E] text-white text-[11px] font-bold px-4 py-1.5 rounded-full tracking-widest uppercase mb-5 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          Platform Workflow
        </motion.div>

        {/* Heading */}
        <motion.h2 variants={revealUp} className="font-headline-lg text-headline-lg font-bold text-primary-container tracking-tight mb-3">
          How BELTAL Works
        </motion.h2>

        {/* Sub-heading */}
        <motion.p variants={revealUp} className="text-sm text-slate-500 font-medium max-w-xl mb-14 leading-relaxed">
          An automated zero-trust protocol — from biometric verification to cryptographic ledger issuance.
        </motion.p>

        {/* Steps grid with connector line */}
        <div className="relative w-full">

          {/* Dashed horizontal connector (desktop only) */}
          <div
            aria-hidden="true"
            className="hidden md:block absolute top-[28px] left-[12.5%] right-[12.5%] border-t-2 border-dashed border-blue-200 z-0"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 relative z-10">
            {steps.map(({ num, title, desc, icon, iconColor, ringColor }) => (
              <motion.div
                key={num}
                variants={revealUp}
                className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col items-center text-center relative"
              >
                {/* Step number pill */}
                <div className={`ring-4 ${ringColor} bg-[#0F284E] text-white font-bold text-sm w-10 h-10 rounded-full flex items-center justify-center shadow-sm mb-4 shrink-0`}>
                  {num}
                </div>

                {/* Micro icon */}
                <div className={`${iconColor} mb-3`}>
                  <span aria-hidden="true" className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: '"FILL" 1' }}>
                    {icon}
                  </span>
                </div>

                {/* Title */}
                <h3 className="text-base font-bold text-[#0B2545] mb-2 leading-snug">
                  {title}
                </h3>

                {/* Description */}
                <p className="text-xs text-slate-600 leading-relaxed">
                  {desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

      </motion.div>
    </section>
  )
}


/* ─────────────────────────────────────────────────────────
   SECTION 5: PROBLEM STATEMENT  (code.html lines 600-651)
───────────────────────────────────────────────────────── */
function ProblemSection() {
  const challenges = [
    {
      title: 'Siloed & Centralized Identity',
      desc: 'Single points of failure vulnerable to state-sponsored cyber incursions and credential spoofing.',
    },
    {
      title: 'Unverified Asset Provenance',
      desc: 'Defence inventory & sensitive documentation prone to forgery across legacy, disconnected channels.',
    },
    {
      title: 'Latency in Inter-Agency Trust',
      desc: 'Slow, paper-bound authorization chains lacking cryptographic speed and tamper-proof audit trails.',
    },
  ]

  const solutions = [
    {
      title: 'W3C Decentralized Identifiers (DIDs)',
      desc: 'Self-sovereign, tamper-proof biometric identity verification — zero reliance on centralized authorities.',
    },
    {
      title: 'Cryptographic NFT Asset Ledgers',
      desc: 'Real-time, immutable tracking of defence equipment & security clearances on the BELTAL ledger.',
    },
    {
      title: 'BFT Smart Contract Governance',
      desc: 'Zero-trust automated execution with air-gapped Byzantine Fault Tolerant consensus and full audit logs.',
    },
  ]

  return (
    <section id="use-cases" className="w-full bg-surface-container-lowest py-20 px-8" data-problem-anchor>
      <div id="problem-statement" style={{ position: 'relative', top: '-80px', visibility: 'hidden', pointerEvents: 'none' }} aria-hidden="true" />
      <motion.div
        className="max-w-6xl mx-auto"
        initial={{ opacity: 0, y: 28 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
      >
        <div className="bg-[#FFFDF8] border border-amber-200/50 border-l-4 border-l-blue-600 rounded-2xl p-8 md:p-10 shadow-lg relative overflow-hidden">

          {/* Decorative background glow */}
          <div aria-hidden="true" className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-blue-50 opacity-50 blur-3xl pointer-events-none" />

          {/* Header */}
          <span className="text-xs font-bold tracking-widest text-blue-900 uppercase">
            Problem &amp; Resolution
          </span>
          <h2 className="text-2xl md:text-3xl font-extrabold text-[#0B2545] mt-1 mb-8">
            The Challenge We Solve
          </h2>

          {/* 2-Column grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">

            {/* ── Column 1: Challenges ── */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-1">
                <span aria-hidden="true" className="material-symbols-outlined text-red-500 text-[18px]">warning</span>
                <span className="text-xs font-bold tracking-widest text-red-700 uppercase">
                  Critical Infrastructure Bottlenecks
                </span>
              </div>
              {challenges.map(({ title, desc }) => (
                <div
                  key={title}
                  className="bg-red-50/60 border border-red-100 rounded-xl p-4 flex items-start gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-red-100 flex items-center justify-center">
                    <span aria-hidden="true" className="material-symbols-outlined text-red-500 text-[15px]">report</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0B2545] mb-0.5">{title}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Column 2: Solutions ── */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-1">
                <span aria-hidden="true" className="material-symbols-outlined text-blue-600 text-[18px]" style={{ fontVariationSettings: '"FILL" 1' }}>verified_user</span>
                <span className="text-xs font-bold tracking-widest text-blue-800 uppercase">
                  The BELTAL Approach
                </span>
              </div>
              {solutions.map(({ title, desc }) => (
                <div
                  key={title}
                  className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 flex items-start gap-3 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="mt-0.5 shrink-0 w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                    <span aria-hidden="true" className="material-symbols-outlined text-blue-600 text-[15px]" style={{ fontVariationSettings: '"FILL" 1' }}>shield</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#0B2545] mb-0.5">{title}</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </motion.div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────
   ROOT PAGE COMPONENT
───────────────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="bg-surface font-body-md text-on-surface antialiased selection:bg-secondary-fixed selection:text-on-secondary-fixed">
      {/* Inline SVG defs container (from original code.html) */}
      <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />

      <GovBanner />
      <SiteHeader mode="home" />

      <main className="w-full max-w-7xl mx-auto px-margin py-space-lg bg-surface min-h-[calc(100vh-116px)]">
        <div className="flex flex-col w-full">
          <HeroSection />
          <TrustSection />
          <FeaturesSection />
          <HowItWorksSection />
          <ProblemSection />
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
