import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  ArcElement, BarElement, CategoryScale,
  Chart as ChartJS, Legend, LinearScale, Tooltip,
} from 'chart.js'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Clock, Download,
  ExternalLink, Image as ImageIcon, Package, Palette, Plus, Puzzle,
  Settings, Trash2, TrendingUp, X,
} from 'lucide-react'
import PageShell from '../components/PageShell'
import useAuth, { fixPath } from '../hooks/useAuth'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const CHART_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 10 } }, grid: { display: false } },
    y: { ticks: { color: 'rgba(255,255,255,0.35)', font: { size: 10 }, precision: 0 }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
  },
}

const DONUT_BASE = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '68%',
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: 'rgba(255,255,255,0.55)', boxWidth: 10, padding: 14, usePointStyle: true, font: { size: 11 } },
    },
  },
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
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${s.bg} ${s.text} ${s.border}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {status?.replace('_', ' ')}
    </span>
  )
}

function StatCard({ icon: Icon, label, value, color = '#e27602', loading = false }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: color + '15', color }}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">{label}</p>
        {loading
          ? <div className="mt-1 h-7 w-12 animate-pulse rounded-lg bg-white/8" />
          : <p className="mt-0.5 text-2xl font-black text-white tabular-nums">{value}</p>}
      </div>
    </div>
  )
}

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } }
const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}

export default function DeveloperHome() {
  const auth = useAuth()
  const [projects,       setProjects]       = useState([])
  const [loading,        setLoading]        = useState(true)
  const [message,        setMessage]        = useState(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [deleteTarget,   setDeleteTarget]   = useState(null)

  const loadProjects = async () => {
    setLoading(true)
    try {
      const res   = await fetch('/api/user/extensions')
      const items = res.ok ? (await res.json().catch(() => [])) : []
      setProjects(Array.isArray(items) ? items : [])
    } catch {
      setMessage({ ok: false, text: 'Could not load your projects.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (auth.loggedIn) loadProjects() }, [auth.loggedIn])

  const stats = useMemo(() => {
    const counts = { approved: 0, pending: 0, rejected: 0, action_required: 0 }
    projects.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++ })
    return {
      total:     projects.length,
      downloads: projects.reduce((sum, p) => sum + Number(p.downloads || 0), 0),
      counts,
    }
  }, [projects])

  const downloadsChart = useMemo(() => {
    const top = [...projects].sort((a, b) => Number(b.downloads || 0) - Number(a.downloads || 0)).slice(0, 8)
    return {
      labels: top.map(p => p.name),
      datasets: [{
        label: 'Downloads',
        data: top.map(p => Number(p.downloads || 0)),
        backgroundColor: 'rgba(226,118,2,0.7)',
        hoverBackgroundColor: '#e27602',
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 56,
      }],
    }
  }, [projects])

  const statusChart = useMemo(() => ({
    labels: ['Approved', 'Pending', 'Rejected', 'Action req.'],
    datasets: [{
      data: [stats.counts.approved, stats.counts.pending, stats.counts.rejected, stats.counts.action_required],
      backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#3b82f6'],
      borderColor: '#0f0f0f',
      borderWidth: 2,
    }],
  }), [stats.counts])

  const confirmDelete = async () => {
    const project = deleteTarget
    setDeleteTarget(null)
    const res  = await fetch(`/api/extensions/${project.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    setMessage(res.ok && data.success
      ? { ok: true,  text: `“${project.name}” was deleted.` }
      : { ok: false, text: data.error || 'Deletion failed.' })
    if (res.ok) loadProjects()
  }

  if (auth.loading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-7xl px-5 pb-24 pt-28 lg:px-10">
          <div className="mb-6 h-24 animate-pulse rounded-2xl bg-white/4" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/4" />)}
          </div>
        </div>
      </PageShell>
    )
  }

  if (!auth.loggedIn) {
    return (
      <PageShell>
        <div className="flex min-h-[75vh] flex-col items-center justify-center px-5 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Puzzle className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-black text-white md:text-4xl">Sign in to publish</h1>
          <p className="mt-3 max-w-md text-base text-white/40">
            The developer area is where you upload extensions and themes, and track how they are doing.
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

          {/* ── Header ── */}
          <motion.div variants={fadeUp}>
            <Link
              to="/dashboard"
              className="mb-4 flex w-fit items-center gap-1.5 text-xs font-semibold text-white/35 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to your account
            </Link>

            <div className="flex flex-col gap-4 rounded-2xl border border-white/6 bg-[#0f0f0f] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Developer</p>
                <h1 className="mt-1 text-xl font-black text-white">Your projects</h1>
                <p className="mt-0.5 text-xs text-white/35">
                  Publish extensions and themes, and see how they perform.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setNewProjectOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-black shadow-glow-sm transition hover:bg-primary-light"
                >
                  <Plus className="h-3.5 w-3.5" /> New project
                </button>
                <Link
                  to={`/u/${auth.user?.username}`}
                  className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-semibold text-white/60 transition-colors hover:bg-white/8 hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Public page
                </Link>
                <Link
                  to="/docs/extension"
                  className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-semibold text-white/60 transition-colors hover:bg-white/8 hover:text-white"
                >
                  Docs
                </Link>
              </div>
            </div>
          </motion.div>

          {message && (
            <motion.div
              variants={fadeUp}
              className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${
                message.ok
                  ? 'border-emerald-500/15 bg-emerald-500/8 text-emerald-400'
                  : 'border-red-500/15 bg-red-500/8 text-red-400'
              }`}
            >
              {message.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              {message.text}
            </motion.div>
          )}

          {/* ── Stats ── */}
          <motion.div variants={fadeUp} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={Package}      label="Projects"  value={stats.total}                      loading={loading} color="#e27602" />
            <StatCard icon={Download}     label="Downloads" value={stats.downloads.toLocaleString()} loading={loading} color="#3b82f6" />
            <StatCard icon={CheckCircle2} label="Approved"  value={stats.counts.approved}            loading={loading} color="#10b981" />
            <StatCard icon={Clock}        label="Pending"   value={stats.counts.pending}             loading={loading} color="#f59e0b" />
          </motion.div>

          {/* ── Charts ── */}
          {projects.length > 0 && (
            <motion.div variants={fadeUp} className="grid gap-4 lg:grid-cols-[1fr_340px]">
              <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
                <p className="mb-4 text-sm font-bold text-white">Downloads by project</p>
                <div className="h-56">
                  {stats.downloads > 0
                    ? <Bar data={downloadsChart} options={CHART_BASE} />
                    : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                        <TrendingUp className="h-6 w-6 text-white/10" />
                        <p className="text-xs text-white/25">No downloads recorded yet</p>
                      </div>
                    )}
                </div>
              </div>
              <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-5">
                <p className="mb-4 text-sm font-bold text-white">Review status</p>
                <div className="h-56"><Doughnut data={statusChart} options={DONUT_BASE} /></div>
              </div>
            </motion.div>
          )}

          {/* ── Projects ── */}
          <motion.div variants={fadeUp} className="rounded-2xl border border-white/6 bg-[#0f0f0f]">
            <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
              <div>
                <h2 className="text-sm font-bold text-white">All projects</h2>
                <p className="text-xs text-white/30">{stats.total} uploaded</p>
              </div>
              <button
                onClick={() => setNewProjectOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-semibold text-white/60 transition-colors hover:bg-white/8 hover:text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Add
              </button>
            </div>

            <div className="p-4">
              {loading ? (
                <div className="flex flex-col gap-3">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-white/4" />)}
                </div>
              ) : projects.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/4">
                    <Puzzle className="h-5 w-5 text-white/15" />
                  </div>
                  <p className="text-sm text-white/30">You have not published anything yet.</p>
                  <button
                    onClick={() => setNewProjectOpen(true)}
                    className="rounded-xl border border-primary/15 bg-primary/10 px-4 py-2 text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-black"
                  >
                    Create your first project
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {projects.map(project => (
                    <div
                      key={project.id}
                      className="group flex flex-col gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition-colors hover:border-white/10 sm:flex-row sm:items-center"
                    >
                      <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-white/4">
                        {project.banner_path ? (
                          <img
                            src={fixPath(project.banner_path)}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={e => { e.currentTarget.style.display = 'none' }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <ImageIcon className="h-4 w-4 text-white/10" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-white">{project.name}</p>
                          <StatusBadge status={project.status} />
                        </div>
                        <p className="mt-1 line-clamp-1 text-xs text-white/30">
                          {project.summary || project.description || 'No description'}
                        </p>
                        <div className="mt-1.5 flex items-center gap-2 text-xs text-white/25">
                          <Download className="h-3 w-3" />
                          {Number(project.downloads || 0).toLocaleString()}
                          <span className="text-white/10">·</span>
                          <span className="capitalize">{project.type || 'extension'}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <Link
                          to={`/extensions/${project.identifier || project.id}`}
                          className="flex items-center gap-1 rounded-lg border border-white/8 bg-white/4 px-2.5 py-1.5 text-[11px] font-semibold text-white/50 transition-colors hover:text-white"
                        >
                          <ExternalLink className="h-3 w-3" /> View
                        </Link>
                        <Link
                          to={`/developer/projects/${project.id}/edit`}
                          className="flex items-center gap-1 rounded-lg border border-primary/15 bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary hover:text-black"
                        >
                          <Settings className="h-3 w-3" /> Edit
                        </Link>
                        <button
                          onClick={() => setDeleteTarget(project)}
                          title="Delete project"
                          className="flex items-center rounded-lg border border-red-500/10 bg-red-500/6 px-2.5 py-1.5 text-[11px] font-semibold text-red-400/60 transition-colors hover:bg-red-500/15 hover:text-red-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </main>

      <NewProjectModal isOpen={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
      <DeleteProjectModal
        project={deleteTarget}
        username={auth.user?.username}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </PageShell>
  )
}

function NewProjectModal({ isOpen, onClose }) {
  const options = [
    { to: '/developer/projects/new/extension', icon: Puzzle,  title: 'Extension', hint: 'Adds new functionality to Lux Client' },
    { to: '/developer/projects/new/theme',     icon: Palette, title: 'Theme',     hint: 'Customizes the look and feel of Lux Client' },
  ]
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative z-10 w-full max-w-md rounded-2xl border border-white/8 bg-[#0f0f0f] shadow-[0_40px_120px_rgba(0,0,0,0.8)]"
          >
            <div className="flex items-center justify-between border-b border-white/6 px-6 py-5">
              <h3 className="text-lg font-bold text-white">New project</h3>
              <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/6 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3 p-5">
              <p className="text-sm text-white/40">What would you like to submit?</p>
              {options.map(option => (
                <Link
                  key={option.to}
                  to={option.to}
                  className="group flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] p-4 transition-all hover:border-primary/30 hover:bg-primary/5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <option.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white">{option.title}</div>
                    <div className="text-xs text-white/30">{option.hint}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/15 transition-colors group-hover:text-primary" />
                </Link>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* Deleting a published project cannot be undone, so it asks for the full
   owner/identifier to be typed out rather than a single click. */
function DeleteProjectModal({ project, username, onCancel, onConfirm }) {
  const [typed, setTyped] = useState('')

  useEffect(() => { setTyped('') }, [project])

  if (!project) return null

  const expected = `${username}/${project.identifier}`

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-6">
        <h3 className="text-lg font-bold text-white">Delete “{project.name}”?</h3>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          The project, all its versions and its uploaded files are removed permanently.
          Anyone who already installed it keeps their copy.
        </p>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-white/40">
            Type <span className="font-mono text-white/70">{expected}</span> to confirm
          </span>
          <input
            autoFocus
            value={typed}
            onChange={e => setTyped(e.target.value)}
            className="w-full rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/20"
            placeholder={expected}
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-xl px-3 py-2 text-sm text-white/40 transition-colors hover:text-white">
            Cancel
          </button>
          <button
            disabled={typed !== expected}
            onClick={onConfirm}
            className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-400 disabled:pointer-events-none disabled:opacity-40"
          >
            Delete project
          </button>
        </div>
      </div>
    </div>
  )
}
