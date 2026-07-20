import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, ExternalLink, FlaskConical, Tag } from 'lucide-react'
import PageShell from '../components/PageShell'
import MarkdownContent from '../components/MarkdownContent'

function SkeletonEntry() {
  return (
    <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
      <div className="h-3 w-24 animate-pulse rounded-full bg-white/8" />
      <div className="mt-3 h-6 w-64 animate-pulse rounded-full bg-white/12" />
      <div className="mt-5 h-3 w-full animate-pulse rounded-full bg-white/6" />
      <div className="mt-2 h-3 w-3/4 animate-pulse rounded-full bg-white/6" />
    </div>
  )
}

export default function Changelog() {
  const [releases, setReleases] = useState(null)
  const [error,     setError]     = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/releases')
      .then(async res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`)
        return res.json()
      })
      .then(data => { if (active) setReleases(Array.isArray(data) ? data : []) })
      .catch(e => { if (active) setError(e.message) })
    return () => { active = false }
  }, [])

  return (
    <PageShell>
      <main className="mx-auto max-w-4xl px-6 pb-24 pt-32">
        <header className="mb-12 text-center">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Changelog</p>
          <h1 className="mt-4 text-5xl font-black tracking-tight text-white">Releases</h1>
          <p className="mt-4 text-gray-400">Every published Lux Client release, pulled straight from GitHub.</p>
        </header>

        {error ? (
          <div className="flex items-center gap-3 rounded-2xl border border-red-500/15 bg-red-500/8 p-6 text-red-400">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">Failed to load releases: {error}</p>
          </div>
        ) : releases === null ? (
          <div className="flex flex-col gap-6">
            {[...Array(3)].map((_, i) => <SkeletonEntry key={i} />)}
          </div>
        ) : releases.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/8 py-24 text-center">
            <p className="text-base font-bold text-white/40">No releases published yet</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-6"
          >
            {releases.map(r => (
              <article key={r.id} className="rounded-[2rem] border border-white/5 bg-surface/50 p-8 md:p-10">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-primary">
                    <Tag className="h-3 w-3" /> {r.tag}
                  </span>
                  {r.prerelease && (
                    <span className="flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-amber-400">
                      <FlaskConical className="h-3 w-3" /> Pre-release
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    {r.publishedAt ? new Date(r.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                  </span>
                </div>
                <h2 className="mb-4 text-2xl font-black text-white">{r.name}</h2>
                {r.body ? (
                  <MarkdownContent content={r.body} />
                ) : (
                  <p className="text-sm text-gray-500">No release notes provided.</p>
                )}
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary hover:text-primary-dark"
                >
                  View on GitHub <ExternalLink className="h-3 w-3" />
                </a>
              </article>
            ))}
          </motion.div>
        )}
      </main>
    </PageShell>
  )
}
