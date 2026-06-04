import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  ArcElement, BarElement, CategoryScale,
  Chart as ChartJS, Legend, LinearScale, Tooltip,
} from 'chart.js'
import { motion } from 'framer-motion'
import {
  Puzzle, Download, CheckCircle2, Clock, Bell, BellOff,
  ChevronRight, ExternalLink, User, Settings, LogOut,
  TrendingUp, Package, Check,
} from 'lucide-react'
import PageShell from '../components/PageShell'
import useAuth, { fixPath } from '../hooks/useAuth'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const CHART_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: '#3a3a3a' }, grid: { display: false } },
    y: { ticks: { color: '#3a3a3a' }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
  },
}
const DONUT_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: '#555', boxWidth: 10, padding: 14, font: { size: 11 } },
    },
  },
  cutout: '68%',
}

const STATUS_COLOR = {
  approved:        { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/15', dot: 'bg-emerald-500' },
  pending:         { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/15',   dot: 'bg-amber-500' },
  rejected:        { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/15',     dot: 'bg-red-500' },
  action_required: { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/15',    dot: 'bg-blue-500' },
}

function StatusBadge({ status }) {
  const s = STATUS_COLOR[status] || STATUS_COLOR.pending
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${s.bg} ${s.text} ${s.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status?.replace('_', ' ')}
    </span>
  )
}

function StatCard({ icon: Icon, label, value, color = '#e27602', loading = false }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: color + '15', color }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">{label}</p>
        {loading
          ? <div className="mt-1 h-7 w-12 animate-pulse rounded-lg bg-white/8" />
          : <p className="mt-0.5 text-2xl font-black text-white tabular-nums">{value}</p>
        }
      </div>
    </div>
  )
}

function EmptyChart({ message }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <TrendingUp className="h-6 w-6 text-white/10" />
      <p className="text-xs text-white/25">{message}</p>
    </div>
  )
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}

export default function Dashboard() {
  const auth = useAuth()
  const [extensions,     setExtensions]     = useState([])
  const [notifications,  setNotifications]  = useState([])
  const [dataLoading,    setDataLoading]    = useState(true)
  const [error,          setError]          = useState('')

  useEffect(() => {
    if (!auth.loggedIn) return
    setDataLoading(true)
    Promise.all([
      fetch('/api/user/extensions').then(r => r.ok ? r.json() : []),
      fetch('/api/user/notifications').then(r => r.ok ? r.json() : []),
    ])
      .then(([exts, notifs]) => {
        setExtensions(Array.isArray(exts)   ? exts   : [])
        setNotifications(Array.isArray(notifs) ? notifs : [])
      })
      .catch(e => setError(e.message))
      .finally(() => setDataLoading(false))
  }, [auth.loggedIn])

  const stats = useMemo(() => {
    const counts = { approved: 0, pending: 0, rejected: 0, action_required: 0 }
    extensions.forEach(e => { if (counts[e.status] !== undefined) counts[e.status]++ })
    return {
      total:     extensions.length,
      downloads: extensions.reduce((s, e) => s + Number(e.downloads || 0), 0),
      approved:  counts.approved,
      pending:   counts.pending,
      counts,
    }
  }, [extensions])

  const downloadsChart = useMemo(() => {
    const top = [...extensions].sort((a, b) => Number(b.downloads || 0) - Number(a.downloads || 0)).slice(0, 8)
    return {
      labels: top.map(e => e.name),
      datasets: [{
        label: 'Downloads',
        data: top.map(e => Number(e.downloads || 0)),
        backgroundColor: 'rgba(226,118,2,0.7)',
        borderRadius: 6,
        borderSkipped: false,
      }],
    }
  }, [extensions])

  const statusChart = useMemo(() => ({
    labels: ['Approved', 'Pending', 'Rejected', 'Action Req.'],
    datasets: [{
      data: [stats.counts.approved, stats.counts.pending, stats.counts.rejected, stats.counts.action_required],
      backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#3b82f6'],
      borderWidth: 0,
    }],
  }), [stats.counts])

  const markNotification = async id => {
    await fetch(`/api/notifications/read/${id}`, { method: 'POST' })
    setNotifications(items => items.map(n => n.id === id ? { ...n, is_read: true } : n))
  }
  const markAll = async () => {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    setNotifications(items => items.map(n => ({ ...n, is_read: true })))
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  // ── Loading ──
  if (auth.loading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-7xl px-5 pt-28 pb-24 lg:px-10">
          <div className="mb-6 h-24 animate-pulse rounded-2xl bg-white/4" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/4" />)}
          </div>
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
          <h1 className="text-3xl font-black text-white md:text-4xl">Sign in to your dashboard</h1>
          <p className="mt-3 max-w-md text-base text-white/40">
            Track your extension performance, review notifications, and manage your uploads.
          </p>
          <a
            href={auth.loginUrl}
            className="mt-8 flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 text-sm font-bold text-black shadow-glow-sm transition hover:bg-primary-light"
          >
            Continue with Google
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-5 pb-24 pt-24 lg:px-10">
        <motion.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-6">

          {/* ── User header ── */}
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
                  Admin Panel <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              )}
              <Link to="/profile" className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-semibold text-white/60 transition-colors hover:bg-white/8 hover:text-white">
                <Settings className="h-3.5 w-3.5" /> Profile
              </Link>
              <a href={auth.logoutUrl} className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-semibold text-white/40 transition-colors hover:text-red-400">
                <LogOut className="h-3.5 w-3.5" /> Logout
              </a>
            </div>
          </motion.div>

          {error && (
            <motion.div variants={fadeUp} className="rounded-xl border border-red-500/15 bg-red-500/8 px-4 py-3 text-sm text-red-400">
              {error}
            </motion.div>
          )}

          {/* ── Stat cards ── */}
          <motion.div variants={fadeUp} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Package}       label="Projects"   value={stats.total}                    loading={dataLoading} color="#e27602" />
            <StatCard icon={Download}      label="Downloads"  value={stats.downloads.toLocaleString()} loading={dataLoading} color="#3b82f6" />
            <StatCard icon={CheckCircle2}  label="Approved"   value={stats.approved}                 loading={dataLoading} color="#10b981" />
            <StatCard icon={Clock}         label="Pending"    value={stats.pending}                  loading={dataLoading} color="#f59e0b" />
          </motion.div>

          {/* ── Main 2-col layout ── */}
          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">

            {/* ── Left: charts + projects ── */}
            <motion.div variants={fadeUp} className="flex flex-col gap-5">

              {/* Charts */}
              {extensions.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
                    <p className="mb-4 text-sm font-bold text-white">Downloads by project</p>
                    <div className="h-52">
                      <Bar data={downloadsChart} options={CHART_BASE} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
                    <p className="mb-4 text-sm font-bold text-white">Status overview</p>
                    <div className="h-52">
                      <Doughnut data={statusChart} options={DONUT_BASE} />
                    </div>
                  </div>
                </div>
              )}

              {/* Projects list */}
              <div className="rounded-2xl border border-white/6 bg-[#0f0f0f]">
                <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
                  <div>
                    <h2 className="text-sm font-bold text-white">Your Projects</h2>
                    <p className="text-xs text-white/30">{stats.total} project{stats.total !== 1 ? 's' : ''} uploaded</p>
                  </div>
                  <Link
                    to="/profile"
                    className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-semibold text-white/50 transition-colors hover:text-white"
                  >
                    <Puzzle className="h-3.5 w-3.5" /> Manage
                  </Link>
                </div>

                <div className="p-4">
                  {dataLoading ? (
                    <div className="flex flex-col gap-3">
                      {[...Array(3)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-white/4" />)}
                    </div>
                  ) : extensions.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/4">
                        <Puzzle className="h-5 w-5 text-white/15" />
                      </div>
                      <p className="text-sm text-white/30">No projects yet</p>
                      <Link to="/profile" className="rounded-xl bg-primary/10 border border-primary/15 px-4 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-black">
                        Upload your first extension
                      </Link>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {extensions.map(ext => (
                        <div key={ext.id} className="group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition-colors hover:border-white/10">
                          {/* Banner thumbnail */}
                          <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-white/4">
                            {ext.banner_path ? (
                              <img
                                src={fixPath(ext.banner_path)}
                                alt={ext.name}
                                className="h-full w-full object-cover"
                                onError={e => { e.currentTarget.style.display = 'none' }}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <Puzzle className="h-4 w-4 text-white/10" />
                              </div>
                            )}
                          </div>

                          {/* Info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-white">{ext.name}</p>
                              <StatusBadge status={ext.status} />
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-white/25">
                              <Download className="h-3 w-3" />
                              {Number(ext.downloads || 0).toLocaleString()}
                              <span className="text-white/10">·</span>
                              <span className="capitalize">{ext.type || 'extension'}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <Link
                              to={`/extensions/${ext.identifier || ext.id}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 hover:bg-white/8 hover:text-white"
                              title="View"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Link>
                            <Link
                              to={`/profile?edit=${ext.id}`}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 hover:bg-white/8 hover:text-white"
                              title="Edit"
                            >
                              <Settings className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

            {/* ── Right: notifications ── */}
            <motion.div variants={fadeUp} className="rounded-2xl border border-white/6 bg-[#0f0f0f]">
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

              <div className="max-h-[520px] overflow-y-auto p-3">
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
                          <div className="mt-0.5 flex-1 min-w-0">
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
            </motion.div>

          </div>
        </motion.div>
      </main>
    </PageShell>
  )
}
