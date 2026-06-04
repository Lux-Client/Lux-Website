import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen, Puzzle, Github, MessageSquare, ArrowRight, ExternalLink } from 'lucide-react'
import PageShell from '../components/PageShell'

const CARDS = [
  {
    to: '/docs/launcher',
    icon: BookOpen,
    color: '#e27602',
    title: 'Launcher Documentation',
    description: 'Setup guides, instance management, accounts, settings, and troubleshooting.',
    tags: ['Setup', 'Instances', 'Settings', 'FAQ'],
  },
  {
    to: '/docs/extension',
    icon: Puzzle,
    color: '#7c3aed',
    title: 'Extension Dev Guide',
    description: 'Build, package, and publish your own extensions and themes for Lux Client.',
    tags: ['API', 'Hooks', 'Publishing', 'Examples'],
  },
]

export default function Docs() {
  return (
    <PageShell>
      <main className="mx-auto max-w-4xl px-5 pb-24 pt-28 lg:px-10">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 flex items-start gap-4"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/15">
            <img src="/resources/lux_icon.png?v=3" alt="Lux Client" className="h-7 w-7 object-contain" />
          </div>
          <div>
            <div className="section-label mb-3">Documentation</div>
            <h1 className="text-4xl font-black tracking-tight text-white md:text-5xl">Lux Client Docs</h1>
            <p className="mt-3 max-w-xl text-base text-white/40">
              Everything you need to use and extend Lux Client.
            </p>
          </div>
        </motion.div>

        {/* Doc cards */}
        <div className="mb-8 flex flex-col gap-4">
          {CARDS.map((card, i) => {
            const Icon = card.icon
            return (
              <motion.div
                key={card.to}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              >
                <Link
                  to={card.to}
                  className="group flex items-start gap-5 rounded-2xl border border-white/6 bg-[#0f0f0f] p-6 transition-all hover:border-white/10 hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(0,0,0,0.4)]"
                >
                  {/* Icon */}
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110"
                    style={{ backgroundColor: card.color + '15', color: card.color }}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white transition-colors group-hover:text-primary">
                        {card.title}
                      </h2>
                      <ArrowRight className="h-4 w-4 text-white/20 transition-all group-hover:text-primary group-hover:translate-x-0.5" />
                    </div>
                    <p className="mt-1.5 text-sm text-white/40">{card.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {card.tags.map(tag => (
                        <span key={tag} className="rounded-md border border-white/6 bg-white/4 px-2 py-0.5 text-[11px] font-semibold text-white/30">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </div>

        {/* Help section */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-6"
        >
          <h2 className="mb-1 text-base font-bold text-white">Need help?</h2>
          <p className="mb-5 text-sm text-white/40">Can't find what you're looking for? Ask on Discord or open an issue.</p>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://pluginhub.de/discord.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-black transition hover:bg-primary-light"
            >
              <MessageSquare className="h-4 w-4" />
              Join Discord
            </a>
            <a
              href="https://github.com/Lux-Client/Lux-Client/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-5 py-2.5 text-sm font-semibold text-white/60 transition hover:bg-white/8 hover:text-white"
            >
              <Github className="h-4 w-4" />
              GitHub Issues
              <ExternalLink className="h-3 w-3 opacity-50" />
            </a>
          </div>
        </motion.div>

      </main>
    </PageShell>
  )
}
