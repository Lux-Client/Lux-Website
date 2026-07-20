import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Calendar, ExternalLink, Image, Package, ShieldCheck, User } from 'lucide-react'
import PageShell from '../components/PageShell'
import { fixPath } from '../hooks/useAuth'

export default function DeveloperProfile() {
  const { username } = useParams()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    fetch(`/api/users/p/${encodeURIComponent(username)}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || 'Profile not found')
        }
        return res.json()
      })
      .then(d => { if (active) setData(d) })
      .catch(e => { if (active) setError(e.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [username])

  if (loading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-6xl px-6 pb-24 pt-32">
          <div className="mb-8 h-40 animate-pulse rounded-[2rem] border border-white/5 bg-surface/50" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-48 animate-pulse rounded-2xl border border-white/5 bg-surface/50" />)}
          </div>
        </div>
      </PageShell>
    )
  }

  if (error || !data) {
    return (
      <PageShell>
        <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <User className="h-6 w-6" />
          </div>
          <h1 className="text-4xl font-black text-white">Profile not found</h1>
          <p className="mt-4 text-gray-400">{error || 'This creator profile is private or does not exist.'}</p>
          <Link to="/extensions" className="mt-8 rounded-xl bg-primary px-6 py-3 font-black text-black transition hover:bg-primary-dark">
            Back to marketplace
          </Link>
        </main>
      </PageShell>
    )
  }

  const { user, extensions } = data

  return (
    <PageShell>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-28 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Header */}
          <div className="mb-8 flex flex-col items-center gap-5 rounded-[2rem] border border-white/5 bg-surface/50 p-8 text-center sm:flex-row sm:items-center sm:text-left md:p-10">
            <img
              src={fixPath(user.avatar)}
              alt={user.username}
              className="h-24 w-24 shrink-0 rounded-2xl border border-white/10 object-cover bg-white/4"
              onError={e => { e.currentTarget.src = '/resources/lux_icon.png?v=3' }}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h1 className="text-3xl font-black text-white">{user.username}</h1>
                {user.role === 'admin' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-primary">
                    <ShieldCheck className="h-3 w-3" /> Team
                  </span>
                )}
              </div>
              {user.bio && <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-400">{user.bio}</p>}
              <div className="mt-3 flex items-center justify-center gap-4 text-xs text-gray-500 sm:justify-start">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Joined {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <span className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  {extensions.length} project{extensions.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Projects */}
          <h2 className="mb-4 text-xl font-black text-white">Published Projects</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {extensions.map(ext => (
              <Link
                key={ext.identifier}
                to={`/extensions/${ext.identifier}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-white/6 bg-[#0f0f0f] transition-all duration-300 hover:-translate-y-1 hover:border-white/10 hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
              >
                <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/8 via-[#111] to-[#111]">
                  {ext.banner_path ? (
                    <img
                      src={fixPath(ext.banner_path)}
                      alt={ext.name}
                      className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-105"
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Image className="h-8 w-8 text-white/10" />
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/60 backdrop-blur-sm">
                    {ext.type || 'extension'}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="mb-2 text-base font-bold text-white">{ext.name}</h3>
                  <p className="flex-1 text-sm leading-relaxed text-white/40 line-clamp-2">{ext.summary || 'No description available.'}</p>
                  <div className="mt-4 flex items-center gap-1.5 border-t border-white/5 pt-4 text-xs font-bold text-primary">
                    View details <ExternalLink className="h-3 w-3" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      </main>
    </PageShell>
  )
}
