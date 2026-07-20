import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Github, MessageSquare, ExternalLink } from 'lucide-react'

const COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', to: '/#features' },
      { label: 'Extensions', to: '/extensions' },
      { label: 'Modpack Builder', to: '/modpack' },
      { label: 'Changelog', to: '/changelog' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Documentation', to: '/docs' },
      { label: 'GitHub', href: 'https://github.com/Lux-Client/Lux-Client', external: true },
      { label: 'Discord', href: 'https://pluginhub.de/discord.html', external: true },
      { label: 'Support', href: 'https://pluginhub.de/discord.html', external: true },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Imprint', to: '/imprint' },
      { label: 'Analytics Opt-Out', to: '/opt-out' },
    ],
  },
]

function ColLink({ item }) {
  const base = 'group flex items-center gap-1.5 text-sm text-white/35 transition-colors hover:text-white'
  if (item.external) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={base}>
        {item.label}
        <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
      </a>
    )
  }
  return <Link to={item.to} className={base}>{item.label}</Link>
}

export default function Footer() {
  return (
    <footer className="relative border-t border-white/5 bg-[#060606]">
      {/* Top glow line */}
      <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-primary/15 to-transparent" />

      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Main grid */}
          <div className="mb-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
            {/* Brand */}
            <div>
              <Link to="/" className="group mb-5 flex items-center gap-2.5">
                <img src="/resources/lux_icon.png?v=3" alt="Lux Client" className="h-7 w-7 object-contain" />
                <span className="text-[15px] font-extrabold text-white">
                  Lux <span className="text-primary">Client</span>
                </span>
              </Link>
              <p className="mb-5 max-w-[220px] text-sm leading-relaxed text-white/30">
                An open-source Minecraft launcher designed for enthusiasts. Free forever.
              </p>
              <div className="flex items-center gap-2">
                <a
                  href="https://github.com/Lux-Client/Lux-Client"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/4 text-white/40 transition-all hover:border-white/14 hover:bg-white/8 hover:text-white"
                  aria-label="GitHub"
                >
                  <Github className="h-3.5 w-3.5" />
                </a>
                <a
                  href="https://pluginhub.de/discord.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 bg-white/4 text-white/40 transition-all hover:border-white/14 hover:bg-white/8 hover:text-white"
                  aria-label="Discord"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            {/* Nav columns */}
            {COLUMNS.map(col => (
              <div key={col.heading}>
                <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-white/20">
                  {col.heading}
                </h3>
                <ul className="flex flex-col gap-3">
                  {col.links.map(item => (
                    <li key={item.label}>
                      <ColLink item={item} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 sm:flex-row">
            <p className="text-xs text-white/20">
              &copy; 2026 Lux Client · Fernsehheft &amp; Mobilestars
            </p>
            <p className="text-xs text-white/15">
              Not an official Minecraft product. Not affiliated with Mojang or Microsoft.
            </p>
          </div>
        </motion.div>
      </div>
    </footer>
  )
}
