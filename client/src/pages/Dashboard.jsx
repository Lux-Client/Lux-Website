import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, Doughnut } from 'react-chartjs-2'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js'
import { io } from 'socket.io-client'
import PageShell from '../components/PageShell'
import useAuth, { fixPath } from '../hooks/useAuth'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#d1d5db' },
    },
  },
  scales: {
    x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
    y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
  },
}

export default function Dashboard() {
  const auth = useAuth()
  const [extensions, setExtensions] = useState([])
  const [notifications, setNotifications] = useState([])
  const [error, setError] = useState('')
  const [liveStats, setLiveStats] = useState(null)
  const [socketState, setSocketState] = useState('offline')

  useEffect(() => {
    if (!auth.loggedIn) return

    Promise.all([
      fetch('/api/user/extensions').then((response) => response.ok ? response.json() : []),
      fetch('/api/user/notifications').then((response) => response.ok ? response.json() : []),
    ])
      .then(([extensionsData, notificationsData]) => {
        setExtensions(Array.isArray(extensionsData) ? extensionsData : [])
        setNotifications(Array.isArray(notificationsData) ? notificationsData : [])
      })
      .catch((loadError) => setError(loadError.message))
  }, [auth.loggedIn])

  useEffect(() => {
    const password = window.localStorage.getItem('admin_password')
    if (!password) return undefined

    const socket = io()
    setSocketState('connecting')

    socket.on('connect', () => {
      setSocketState('connected')
      socket.emit('admin-subscribe', password)
    })
    socket.on('disconnect', () => setSocketState('offline'))
    socket.on('error', () => setSocketState('error'))
    socket.on('init-stats', (payload) => setLiveStats(payload.live || null))
    socket.on('live-update', (payload) => setLiveStats(payload.live || null))

    return () => socket.disconnect()
  }, [])

  const stats = useMemo(() => {
    const counts = { approved: 0, pending: 0, rejected: 0, action_required: 0 }
    extensions.forEach((extension) => {
      if (counts[extension.status] !== undefined) counts[extension.status] += 1
    })

    return {
      total: extensions.length,
      downloads: extensions.reduce((sum, extension) => sum + Number(extension.downloads || 0), 0),
      approved: counts.approved,
      pending: counts.pending,
      statusCounts: counts,
    }
  }, [extensions])

  const downloadsChart = useMemo(() => {
    const top = [...extensions].sort((a, b) => Number(b.downloads || 0) - Number(a.downloads || 0)).slice(0, 8)
    return {
      labels: top.map((item) => item.name),
      datasets: [
        {
          label: 'Downloads',
          data: top.map((item) => Number(item.downloads || 0)),
          backgroundColor: '#e27602',
          borderRadius: 12,
        },
      ],
    }
  }, [extensions])

  const statusChart = useMemo(() => ({
    labels: ['Approved', 'Pending', 'Rejected', 'Action Required'],
    datasets: [
      {
        data: [stats.statusCounts.approved, stats.statusCounts.pending, stats.statusCounts.rejected, stats.statusCounts.action_required],
        backgroundColor: ['#e27602', '#3b82f6', '#ef4444', '#f59e0b'],
        borderWidth: 0,
      },
    ],
  }), [stats.statusCounts])

  const markNotification = async (id) => {
    await fetch(`/api/notifications/read/${id}`, { method: 'POST' })
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, is_read: true } : item))
  }

  const markAll = async () => {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    setNotifications((items) => items.map((item) => ({ ...item, is_read: true })))
  }

  if (auth.loading) {
    return <PageShell><div className="mx-auto max-w-7xl px-6 pb-24 pt-32"><div className="h-[28rem] animate-pulse rounded-[2rem] border border-white/5 bg-surface/50" /></div></PageShell>
  }

  if (!auth.loggedIn) {
    return (
      <PageShell>
        <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 text-center">
          <h1 className="text-5xl font-black text-white">Sign in to your dashboard</h1>
          <p className="mt-4 text-lg text-gray-400">Manage your profile, track your extension performance, and review notifications.</p>
          <a href={auth.loginUrl} className="mt-8 rounded-2xl bg-primary px-7 py-4 font-black text-black transition hover:bg-primary-dark">Continue with Google</a>
        </main>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-32 lg:px-12">
        <section className="rounded-[2.5rem] border border-white/5 bg-surface/50 p-8 md:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              <img src={fixPath(auth.user?.avatar || auth.user?.avatar_url)} alt={auth.user?.username} className="h-20 w-20 rounded-[2rem] border border-white/10 object-cover" />
              <div>
                <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Dashboard</p>
                <h1 className="mt-3 text-4xl font-black text-white">Welcome back, {auth.user?.username}</h1>
                <p className="mt-3 text-gray-400">Monitor your uploads, review notifications, and jump back into creator tools.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/profile" className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-white transition hover:border-primary/40 hover:text-primary">Edit Profile</Link>
              <a href={auth.logoutUrl} className="rounded-xl bg-primary px-5 py-3 font-black text-black transition hover:bg-primary-dark">Logout</a>
            </div>
          </div>
        </section>

        {error && <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">{error}</div>}

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Projects" value={stats.total} />
          <StatCard label="Downloads" value={stats.downloads.toLocaleString()} />
          <StatCard label="Approved" value={stats.approved} />
          <StatCard label="Pending" value={stats.pending} />
        </section>

        {liveStats && (
          <section className="mt-8 grid gap-4 md:grid-cols-3">
            <StatCard label="Live Active Users" value={liveStats.activeUsers || 0} tone="green" />
            <StatCard label="Currently Playing" value={liveStats.playingUsers || 0} tone="blue" />
            <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-6">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">Socket Status</p>
              <p className="mt-3 text-2xl font-black text-white">{socketState}</p>
              <p className="mt-3 text-sm text-gray-400">Live admin metrics appear here when an admin password is stored in the browser.</p>
            </div>
          </section>
        )}

        <section className="mt-8 grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black text-white">Project analytics</h2>
                <p className="mt-2 text-gray-400">A quick snapshot of your project portfolio.</p>
              </div>
              <Link to="/profile" className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:border-primary/40 hover:text-primary">Manage uploads</Link>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-[1.5rem] border border-white/5 bg-black/20 p-5">
                <h3 className="text-lg font-black text-white">Top downloads</h3>
                <div className="mt-6 h-72">{extensions.length ? <Bar data={downloadsChart} options={chartOptions} /> : <EmptyChart message="Upload an extension to start tracking downloads." />}</div>
              </div>
              <div className="rounded-[1.5rem] border border-white/5 bg-black/20 p-5">
                <h3 className="text-lg font-black text-white">Status breakdown</h3>
                <div className="mt-6 h-72">{extensions.length ? <Doughnut data={statusChart} options={{ plugins: { legend: { labels: { color: '#d1d5db' } } } }} /> : <EmptyChart message="No project statuses yet." />}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black text-white">Notifications</h2>
                <p className="mt-2 text-gray-400">Stay on top of approvals, moderation, and release feedback.</p>
              </div>
              <button onClick={markAll} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white transition hover:border-primary/40 hover:text-primary">Mark all read</button>
            </div>

            <div className="mt-6 space-y-3">
              {notifications.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/10 p-8 text-center text-gray-500">No notifications yet.</div>
              ) : notifications.map((notification) => (
                <button key={notification.id} onClick={() => markNotification(notification.id)} className={`block w-full rounded-[1.5rem] border p-4 text-left transition ${notification.is_read ? 'border-white/5 bg-black/10' : 'border-primary/20 bg-primary/10'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">{notification.type || 'info'}</p>
                      <p className="mt-2 text-sm leading-7 text-white">{notification.message}</p>
                    </div>
                    {!notification.is_read && <span className="mt-1 h-2.5 w-2.5 rounded-full bg-primary" />}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-[2rem] border border-white/5 bg-surface/50 p-6 md:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-black text-white">Your recent projects</h2>
              <p className="mt-2 text-gray-400">Open the profile page to update metadata, submit new builds, or delete a project.</p>
            </div>
            <Link to="/profile" className="rounded-xl bg-primary px-5 py-3 font-black text-black transition hover:bg-primary-dark">Open Profile Tools</Link>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {extensions.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/10 p-10 text-center text-gray-500 md:col-span-2 xl:col-span-3">You have not uploaded any extensions yet.</div>
            ) : extensions.map((extension) => (
              <div key={extension.id} className="rounded-[1.5rem] border border-white/5 bg-black/20 p-5">
                <div className="aspect-[16/9] overflow-hidden rounded-2xl bg-black/30">
                  <img src={fixPath(extension.banner_path)} alt={extension.name} className="h-full w-full object-cover" />
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">{extension.type || 'extension'}</p>
                    <h3 className="mt-2 text-2xl font-black text-white">{extension.name}</h3>
                  </div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-gray-300">{extension.status}</span>
                </div>
                <p className="mt-3 text-sm leading-7 text-gray-400">{extension.summary || extension.description}</p>
                <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4 text-sm">
                  <span className="font-bold text-primary">{Number(extension.downloads || 0).toLocaleString()} downloads</span>
                  <div className="flex gap-3">
                    <Link to={`/extensions/${extension.identifier || extension.id}`} className="text-gray-400 transition hover:text-white">View</Link>
                    <Link to={`/profile?edit=${extension.id}`} className="font-bold text-white transition hover:text-primary">Manage</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </PageShell>
  )
}

function StatCard({ label, value, tone = 'orange' }) {
  const styles = {
    orange: 'text-primary border-primary/10 bg-primary/5',
    green: 'text-emerald-400 border-emerald-400/10 bg-emerald-400/5',
    blue: 'text-sky-400 border-sky-400/10 bg-sky-400/5',
  }

  return (
    <div className={`rounded-[2rem] border p-6 ${styles[tone] || styles.orange}`}>
      <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">{label}</p>
      <p className="mt-4 text-4xl font-black text-white">{value}</p>
    </div>
  )
}

function EmptyChart({ message }) {
  return <div className="flex h-full items-center justify-center text-center text-sm text-gray-500">{message}</div>
}
