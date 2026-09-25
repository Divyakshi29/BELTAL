import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import SiteHeader from '../components/SiteHeader'
import SiteFooter from '../components/SiteFooter'

const revealUp = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

/* ─────────────────────────────────────────────────────────
   GOV BANNER  (local copy — same markup as LandingPage)
───────────────────────────────────────────────────────── */
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
  )
}

/* ─────────────────────────────────────────────────────────
   BREADCRUMB
───────────────────────────────────────────────────────── */
function Breadcrumb() {
  return (
    <nav
      aria-label="Breadcrumb"
      className="w-full bg-[#F0F3FF] border-b border-[#DAE3F7]"
    >
      <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center gap-1.5 text-sm">
        <Link
          to="/"
          className="flex items-center gap-1 text-[#1E5FA8] hover:text-[#0B2545] font-medium transition-colors"
        >
          {/* Home icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3H9v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z"
              clipRule="evenodd"
            />
          </svg>
          Home
        </Link>
        <span className="text-slate-400 font-medium">»</span>
        <span className="text-[#0B2545] font-semibold">Contact Us</span>
      </div>
    </nav>
  )
}

/* ─────────────────────────────────────────────────────────
   PAGE TITLE  (plain heading, sits directly under the breadcrumb —
   no separate hero band; matches the rest of the site's restraint)
───────────────────────────────────────────────────────── */
function PageTitle() {
  return (
    <div className="w-full border-b border-slate-200 bg-surface-container-low">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="font-headline-lg text-headline-lg font-bold text-primary-container">
          Contact Us
        </h1>
        <p className="mt-2 text-[15px] text-on-surface-variant max-w-xl">
          Reach the BEL helpdesk for enquiries, support, or to locate our corporate office.
        </p>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   INFO CARD  (shared wrapper for left-column sections)
───────────────────────────────────────────────────────── */
function InfoCard({ children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-7 ${className}`}>
      {children}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   MAIN CONTENT
───────────────────────────────────────────────────────── */
function ContactContent() {
  return (
    <motion.div
      className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-2 gap-10"
      initial="hidden"
      animate="visible"
      variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
    >

      {/* ── LEFT COLUMN ── */}
      <motion.div variants={revealUp} className="flex flex-col gap-7">

        {/* Section 1: Contact Numbers */}
        <InfoCard>
          <div className="h-1 w-16 rounded-full bg-[#1E5FA8] mb-5" />

          <h2 className="text-xl font-bold text-secondary mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-secondary">call</span>
            Phone &amp; Helpdesk
          </h2>

          {/* Primary Phone */}
          <div className="flex items-start gap-3 mb-1">
            <span className="material-symbols-outlined text-[18px] text-slate-400 mt-0.5">phone_in_talk</span>
            <div>
              <p className="text-[13px] text-slate-500 font-medium mb-0.5">Main Office</p>
              <p className="font-medium text-slate-800 text-[15px] tracking-wide">
                +91- 80-25039300
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="border-b border-slate-300 my-4" />

          {/* Toll-free */}
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[18px] text-[#1E5FA8] mt-0.5">support_agent</span>
            <div>
              <p className="font-medium text-slate-800 text-[15px] tracking-wide">
                18004250433{' '}
                <span className="text-[12px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full ml-1">
                  Toll Free
                </span>
              </p>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                BEL Customer complaints registration only
              </p>
            </div>
          </div>

          {/* Quick info chips */}
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0B2545] bg-[#E8F1FB] px-3 py-1 rounded-full border border-[#3B82C4]/20">
              <span className="material-symbols-outlined text-[12px]">schedule</span>
              Mon – Fri, 9 AM – 6 PM IST
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
              <span className="material-symbols-outlined text-[12px]">language</span>
              English · Hindi
            </span>
          </div>
        </InfoCard>

        {/* Section 2: Registered Office */}
        <InfoCard>
          <div className="h-1 w-16 rounded-full bg-[#C8A74C] mb-5" />

          <h2 className="text-xl font-bold text-[#0B62A4] mt-0 mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-[22px] text-[#1E5FA8]">corporate_fare</span>
            Registered Office
          </h2>

          <p className="font-semibold text-slate-900 text-[15px]">
            Bharat Electronics Limited
          </p>

          {/* Divider */}
          <div className="border-b border-slate-300 my-4" />

          {/* Address */}
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[18px] text-slate-400 mt-0.5">location_on</span>
            <address className="not-italic text-slate-700 text-[14px] leading-relaxed">
              <span className="block font-semibold text-slate-800">Corporate Office</span>
              Outer Ring Road, Nagavara<br />
              Bangalore – 560045<br />
              Karnataka, India
            </address>
          </div>

          {/* Email */}
          <div className="border-b border-slate-300 my-4" />

          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[18px] text-slate-400">mail</span>
            <a
              href="mailto:webmaster@bel.co.in"
              className="text-[14px] text-[#1E5FA8] hover:underline font-medium"
            >
              webmaster@bel.co.in
            </a>
          </div>

          {/* CIN */}
          <div className="mt-4 text-[11px] text-slate-400 font-mono">
            CIN: L32309KA1954GOI000787 &nbsp;|&nbsp; A Navratna Company
          </div>
        </InfoCard>

        {/* Compliance strip */}
        <div className="flex items-center gap-2 bg-[#E8F1FB] border border-[#3B82C4]/20 rounded-xl px-4 py-3">
          <span aria-hidden="true" className="material-symbols-outlined text-[18px] text-[#1E5FA8]">verified_user</span>
          <span className="text-[12px] font-semibold text-[#0B2545]">
            ISO 27001 Compliant &nbsp;•&nbsp; Government of India Enterprise &nbsp;•&nbsp; MoD Registered
          </span>
        </div>
      </motion.div>

      {/* ── RIGHT COLUMN — Interactive Map ── */}
      <motion.div variants={revealUp} className="flex flex-col gap-4">
        {/* Map label */}
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-[20px] text-[#1E5FA8]">map</span>
          <h3 className="text-[15px] font-bold text-[#0B2545] tracking-wide uppercase">
            Corporate Office — Bengaluru
          </h3>
        </div>

        {/* Map card */}
        <div className="w-full h-80 rounded-xl overflow-hidden border border-slate-300 shadow-md">
          <iframe
            title="BEL Corporate Office Bangalore"
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3886.643695277884!2d77.6148!3d13.0402!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bae171542f7c6e1%3A0x6d9f8c68c4d29c89!2sBharat%20Electronics%20Limited!5e0!3m2!1sen!2sin!4v1700000000000!5m2!1sen!2sin"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen=""
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        {/* Directions CTA */}
        <a
          href="https://maps.google.com/?q=Bharat+Electronics+Limited+Bangalore"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 bg-[#1E5FA8] hover:bg-[#0D2B4E] text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-all shadow-sm"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[18px]">directions</span>
          Get Directions
        </a>

        {/* Mini contact quick-ref card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mb-3">
            Quick Reference
          </p>
          <div className="grid grid-cols-1 gap-3">
            {[
              { icon: 'phone', label: 'Main', value: '+91 80 2503 9300' },
              { icon: 'headset_mic', label: 'Toll-Free', value: '1800 425 0433' },
              { icon: 'mail', label: 'Email', value: 'webmaster@bel.co.in' },
              { icon: 'public', label: 'Web', value: 'www.bel.co.in' },
            ].map(({ icon, label, value }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#E8F1FB] flex items-center justify-center shrink-0">
                  <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-[#1E5FA8]">{icon}</span>
                </div>
                <div>
                  <p className="text-[11px] text-slate-400 font-semibold leading-none">{label}</p>
                  <p className="text-[13px] text-slate-700 font-medium mt-0.5">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ─────────────────────────────────────────────────────────
   ROOT EXPORT
───────────────────────────────────────────────────────── */
export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <GovBanner />
      <SiteHeader mode="page" />

      {/* ── Breadcrumb ── */}
      <Breadcrumb />

      {/* ── Page title ── */}
      <PageTitle />

      {/* ── White content area ── */}
      <motion.div
        className="bg-white flex-1"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <ContactContent />
      </motion.div>

      <SiteFooter />
    </div>
  )
}
