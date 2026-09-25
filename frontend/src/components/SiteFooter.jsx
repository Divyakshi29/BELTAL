import { Link } from 'react-router-dom'

/**
 * SiteFooter — shared footer used by every page.
 *
 * One footer, not three stacked "organization strip / link columns / bottom
 * bar" sections repeating the same BEL name and copyright line — that's
 * what both pages used to render independently before this was factored out.
 */

const FOOTER_COLUMNS = [
  {
    heading: 'Platform',
    links: [
      { label: 'Overview', href: '/#platform' },
      { label: 'Features', href: '/#features' },
      { label: 'Technology', href: '/#technology' },
      { label: 'Use Cases', href: '/#use-cases' },
      { label: 'API Documentation', href: '/docs' },
    ],
  },
  {
    heading: 'Organization',
    links: [
      { label: 'About BEL', href: '/#about-bel' },
      { label: 'Contact Us', href: '/contact' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '#' },
      { label: 'Terms of Use', href: '#' },
      { label: 'Security', href: '#' },
    ],
  },
]

function FooterLink({ label, href }) {
  const className = 'font-body-md text-body-md text-primary-fixed-dim hover:text-on-primary block transition-colors'
  if (href.startsWith('/') && !href.startsWith('/#')) {
    return (
      <Link className={className} to={href}>
        {label}
      </Link>
    )
  }
  return (
    <a className={className} href={href}>
      {label}
    </a>
  )
}

export default function SiteFooter() {
  return (
    <footer id="about-bel" className="w-full bg-primary-container text-on-primary border-t-2 border-tertiary-container">
      <div className="max-w-7xl mx-auto px-margin py-space-xl">

        {/* Top: brand + nav columns */}
        <div className="flex flex-col md:flex-row gap-10 pb-10 border-b border-white/10">
          <div className="flex items-start gap-3 shrink-0 md:w-64">
            <img src="/bel-shield.svg" alt="BEL Shield" className="h-11 w-auto object-contain" />
            <div className="flex flex-col">
              <span className="font-title-md text-title-md font-bold text-on-primary leading-tight">
                Bharat Electronics Limited
              </span>
              <span className="font-body-sm text-body-sm text-on-primary-container mt-1">
                A Government of India Enterprise, Ministry of Defence
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 flex-1">
            {FOOTER_COLUMNS.map(({ heading, links }) => (
              <div key={heading} className="flex flex-col">
                <h4 className="font-title-md text-title-md font-bold text-on-primary mb-4">{heading}</h4>
                <div className="space-y-2">
                  {links.map(link => <FooterLink key={link.label} {...link} />)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <p className="font-code-sm text-code-sm text-on-primary-container">
            © 2026 Bharat Electronics Limited. All rights reserved.
          </p>
          <p className="font-code-sm text-code-sm text-on-primary-container">
            CIN: L32309KA1954GOI000787
          </p>
        </div>
      </div>
    </footer>
  )
}
