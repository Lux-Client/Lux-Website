import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Bell, BellOff, BookOpen, Check, ChevronRight, Cloud, Code2,
  LogOut, Package, Puzzle, Settings, Shield, User,
} from 'lucide-react'
import PageShell from '../components/PageShell'
import CloudSection from '../components/CloudSection'
import useAuth, { fixPath } from '../hooks/useAuth'

/* The account home. Everything that belongs to the person using Lux Client —
   their cloud instances, their notifications, their settings. Publishing an
   extension is a different job with different numbers, so that lives on
   /developer/home and is reached from the card below. */

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}

function QuickLink({ to, href, icon: Icon, title, hint }) {
  const inner = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/4 text-white/40 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white">{title}</span>
        <span className="block truncate text-xs text-white/30">{hint}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/15 transition-colors group-hover:text-white/40" />
    </>
  )
  const className = 'group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition-all hover:border-white/12 hover:bg-white/[0.04]'
  return href
    ? <a href={href} className={className}>{inner}</a>
    : <Link to={to} className={className}>{inner}</Link>
}

export default function Dashboard() {
  const auth = useAuth()
  const [notifications, setNotifications] = useState([])
  const [projectCount,  setProjectCount]  = useState(null)
  const [dataLoading,   setDataLoading]   = useState(true)

  useEffect(() => {
    if (!auth.loggedIn) return
    setDataLoading(true)
    Promise.all([
      fetch('/api/user/notifications').then(r => r.ok ? r.json() : []),
      fetch('/api/user/extensions').then(r => r.ok ? r.json() : []),
    ])
      .then(([notifs, projects]) => {
        setNotifications(Array.isArray(notifs) ? notifs : [])
        setProjectCount(Array.isArray(projects) ? projects.length : 0)
      })
      .catch(() => setProjectCount(0))
      .finally(() => setDataLoading(false))
  }, [auth.loggedIn])

  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications])

  const markNotification = async id => {
    await fetch(`/api/notifications/read/${id}`, { method: 'POST' })
    setNotifications(items => items.map(n => n.id === id ? { ...n, is_read: true } : n))
  }
  const markAll = async () => {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    setNotifications(items => items.map(n => ({ ...n, is_read: true })))
  }

  // ── Loading ──
  if (auth.loading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-7xl px-5 pb-24 pt-28 lg:px-10">
          <div className="mb-6 h-24 animate-pulse rounded-2xl bg-white/4" />
          <div className="h-80 animate-pulse rounded-2xl bg-white/4" />
        </div>
      </PageShell>
    )
  }

  // ── Not logged in ──
  if (!auth.loggedIn) {
    return (
      <PageShell>
        <div className="flex min-h-[75vh] flex-col items-center justify-center px-5 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <User className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-black text-white md:text-4xl">Sign in to your account</h1>
          <p className="mt-3 max-w-md text-base text-white/40">
            See your cloud instances, connected PCs and notifications in one place.
          </p>
          <a
            href={auth.loginUrl}
            className="mt-8 flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-bold text-black shadow-glow-sm transition hover:bg-primary-light"
          >
            Continue with Google <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-5 pb-24 pt-24 lg:px-10">
        <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">

          {/* ── Account header ── */}
          <motion.div variants={fadeUp} className="flex flex-col gap-4 rounded-2xl border border-white/6 bg-[#0f0f0f] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <img
                  src={fixPath(auth.user?.avatar || auth.user?.avatar_url)}
                  alt={auth.user?.username}
                  className="h-14 w-14 rounded-2xl border border-white/8 object-cover"
                  onError={e => { e.currentTarget.src = '/resources/lux_icon.png?v=3' }}
                />
                <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-[#0f0f0f] bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/30">Welcome back</p>
                <h1 className="text-xl font-black text-white">{auth.user?.username}</h1>
                {auth.user?.role === 'admin' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    Admin
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {auth.user?.role === 'admin' && (
                <Link to="/admin" className="flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/8 px-3.5 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/15">
                  <Shield className="h-3.5 w-3.5" /> Admin panel
                </Link>
              )}
              <Link to="/profile" className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-semibold text-white/60 transition-colors hover:bg-white/8 hover:text-white">
                <Settings className="h-3.5 w-3.5" /> Settings
              </Link>
              <a href={auth.logoutUrl} className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-semibold text-white/40 transition-colors hover:text-red-400">
                <LogOut className="h-3.5 w-3.5" /> Logout
              </a>
            </div>
          </motion.div>

          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">

            {/* ── Left: cloud ── */}
            <motion.div variants={fadeUp} className="flex flex-col gap-5">
              <CloudSection />

              {/* Developer entry point */}
              <Link
                to="/developer/home"
                className="group flex flex-col gap-4 rounded-2xl border border-white/6 bg-[#0f0f0f] p-5 transition-all hover:border-primary/25 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Code2 className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-sm font-bold text-white">Developer area</h2>
                    <p className="mt-0.5 text-xs leading-relaxed text-white/35">
                      {projectCount === null
                        ? 'Publish extensions and themes, and track their downloads.'
                        : projectCount === 0
                          ? 'Publish your first extension or theme for Lux Client.'
                          : `${projectCount} project${projectCount === 1 ? '' : 's'} · downloads, review status and uploads.`}
                    </p>
                  </div>
                </div>
                <span className="flex items-center gap-1.5 self-start rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-bold text-white/60 transition-colors group-hover:border-primary/25 group-hover:bg-primary/10 group-hover:text-primary sm:self-auto">
                  {projectCount ? 'Open' : 'Get started'} <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </Link>

              {/* Quick links */}
              <div className="rounded-2xl border border-white/6 bg-[#0f0f0f]">
                <div className="border-b border-white/5 px-5 py-4">
                  <h2 className="text-sm font-bold text-white">Shortcuts</h2>
                  <p className="text-xs text-white/30">The pages you probably came for</p>
                </div>
                <div className="grid gap-2.5 p-4 sm:grid-cols-2">
                  <QuickLink to="/extensions" icon={Puzzle}   title="Browse extensions" hint="Mods, themes, shaders and packs" />
                  <QuickLink to="/modpack"    icon={Package}  title="Modpack editor"    hint="Build and share a modpack code" />
                  <QuickLink to="/docs"       icon={BookOpen} title="Documentation"     hint="Guides for launcher and cloud" />
                  <QuickLink to="/profile"    icon={User}     title="Public profile"    hint="Avatar, bio and visibility" />
                </div>
              </div>
            </motion.div>

            {/* ── Right: notifications ── */}
            <motion.div variants={fadeUp} className="self-start rounded-2xl border border-white/6 bg-[#0f0f0f]">
              <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-white/40" />
                  <h2 className="text-sm font-bold text-white">Notifications</h2>
                  {unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-black text-black">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAll}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/30 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <Check className="h-3 w-3" /> All read
                  </button>
                )}
              </div>

              <div className="max-h-[620px] overflow-y-auto p-3">
                {dataLoading ? (
                  <div className="flex flex-col gap-2 p-2">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white/4" />)}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-14 text-center">
                    <BellOff className="h-6 w-6 text-white/10" />
                    <p className="text-sm text-white/25">No notifications yet</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {notifications.map(n => (
                      <button
                        key={n.id}
                        onClick={() => !n.is_read && markNotification(n.id)}
                        className={`group relative w-full rounded-xl border p-3.5 text-left transition-all ${
                          n.is_read
                            ? 'border-white/4 bg-transparent text-white/40'
                            : 'border-primary/15 bg-primary/5 hover:bg-primary/8'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 min-w-0 flex-1">
                            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-white/25">
                              {n.type || 'info'}
                            </p>
                            <p className={`text-xs leading-relaxed ${n.is_read ? 'text-white/30' : 'text-white/70'}`}>
                              {n.message}
                            </p>
                          </div>
                          {!n.is_read && (
                            <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary shadow-[0_0_4px_rgba(226,118,2,0.6)]" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-white/5 p-3">
                <a
                  href="https://pluginhub.de/discord.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/4 py-2.5 text-xs font-semibold text-white/50 transition-colors hover:bg-white/8 hover:text-white"
                >
                  <Cloud className="h-3.5 w-3.5" /> Get support on Discord
                </a>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </main>
    </PageShell>
  )
}
