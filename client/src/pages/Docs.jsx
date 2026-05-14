import { Link } from 'react-router-dom'
import PageShell from '../components/PageShell'

const cards = [
  {
    to: '/docs/launcher',
    title: 'Launcher Documentation',
    description: 'Setup, accounts, instances, settings, troubleshooting, and downloads.',
    icon: '/resources/lux_icon.png?v=3',
  },
  {
    to: '/docs/extension',
    title: 'Extension Development Guide',
    description: 'Learn how to build, package, and publish themes and extensions for Lux Client.',
    icon: null,
  },
]

export default function Docs() {
  return (
    <PageShell>
      <main className="mx-auto max-w-5xl px-6 pb-24 pt-32">
        <header className="mb-14 flex items-start gap-4">
          <img src="/resources/lux_icon.png?v=3" alt="Lux Client" className="h-14 w-14 rounded-2xl bg-surface/80 p-2" />
          <div>
            <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Documentation</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">Lux Client Documentation Hub</h1>
            <p className="mt-4 max-w-2xl text-lg text-gray-400">Choose a guide below to explore the launcher, extension workflow, and addon ecosystem.</p>
          </div>
        </header>

        <section className="space-y-6">
          {cards.map((card) => (
            <Link
              key={card.to}
              to={card.to}
              className="group block rounded-[2rem] border border-white/10 bg-surface/70 p-8 transition-all hover:border-primary/60 hover:shadow-primary-glow"
            >
              <div className="flex items-center gap-4">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  {card.icon ? (
                    <img src={card.icon} alt="" className="h-8 w-8 object-contain" />
                  ) : (
                    <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v12m6-6H6" />
                    </svg>
                  )}
                </span>
                <div>
                  <h2 className="text-2xl font-bold text-white transition-colors group-hover:text-primary">{card.title}</h2>
                  <p className="mt-2 text-gray-400">{card.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-14 rounded-[2rem] border border-white/5 bg-white/5 p-8">
          <h2 className="text-2xl font-black text-white">Need more help?</h2>
          <p className="mt-4 text-gray-400">Open an issue on GitHub or join the Discord community if you get stuck.</p>
          <div className="mt-6 flex flex-wrap gap-4">
            <a href="https://github.com/Lux-Client/Lux-Client/issues" target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-white transition hover:border-primary/40 hover:text-primary">GitHub Issues</a>
            <a href="https://pluginhub.de/discord.html" target="_blank" rel="noopener noreferrer" className="rounded-xl bg-primary px-5 py-3 font-black text-black transition hover:bg-primary-dark">Join Discord</a>
          </div>
        </section>
      </main>
    </PageShell>
  )
}
