import { useEffect, useMemo, useState } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend,
  LineElement, LinearScale, PointElement, Tooltip,
} from 'chart.js'
import { io } from 'socket.io-client'
import {
  LayoutDashboard, Newspaper, BarChart2, Code2, ShieldCheck,
  Lock, RefreshCw, Wifi, WifiOff, AlertTriangle, Wrench,
  Trash2, Check, X, LogOut, ChevronRight, User, Download,
  Users as UsersIcon, FileSearch, Tag, FileText, TrendingUp,
} from 'lucide-react'
import useAuth, { fixPath } from '../hooks/useAuth'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend)

const CHART_OPTS = {
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#555', boxWidth: 12, padding: 16 } } },
  scales: {
    x: { ticks: { color: '#444' }, grid: { color: 'rgba(255,255,255,0.04)' } },
    y: { ticks: { color: '#444' }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true },
  },
}
const DONUT_OPTS = { plugins: { legend: { position: 'bottom', labels: { color: '#555', boxWidth: 10, padding: 14 } } } }

const emptyStats = {
  downloads: { mod: {}, resourcepack: {}, shader: {}, modpack: {} },
  clientVersions: {}, launchesPerDay: {}, uniqueMachineCount: 0, uniqueMachines: {},
  software: { client: {}, server: {} }, gameVersions: { client: {}, server: {} },
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color = '#e27602', live = false, onClick }) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      onClick={onClick}
      className={`flex w-full items-center gap-4 rounded-2xl border border-white/6 bg-[#0f0f0f] p-5 text-left transition-colors ${onClick ? 'cursor-pointer hover:border-white/15 hover:bg-white/[0.03]' : ''}`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: color + '15', color }}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/30">{label}</p>
        <p className="mt-0.5 text-2xl font-black text-white tabular-nums">
          {live && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle shadow-[0_0_4px_rgba(16,185,129,0.7)]" />}
          {String(value)}
        </p>
      </div>
      {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-white/15" />}
    </Wrapper>
  )
}

function SectionCard({ title, description, action, children }) {
  return (
    <div className="rounded-2xl border border-white/6 bg-[#0f0f0f]">
      <div className="flex items-start justify-between gap-4 border-b border-white/5 px-6 py-5">
        <div>
          <h2 className="text-base font-bold text-white">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-white/35">{description}</p>}
        </div>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}

function FieldLabel({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-white/35">{label}</span>
      {children}
    </label>
  )
}

function AdminInput({ value, onChange, ...props }) {
  return (
    <input
      value={value} onChange={e => onChange(e.target.value)} {...props}
      className="w-full rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
    />
  )
}
function AdminTextarea({ value, onChange, rows = 4 }) {
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)} rows={rows}
      className="w-full rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none"
    />
  )
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-white/8 py-10">
      <p className="text-sm text-white/25">{message}</p>
    </div>
  )
}

function ModerationItem({ title, subtitle, image, actions, extra }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {image && <img src={image} alt="" className="h-11 w-11 rounded-xl object-cover" onError={e => e.currentTarget.style.display='none'} />}
          <div>
            <p className="text-sm font-semibold text-white">{title}</p>
            <p className="mt-0.5 text-xs text-white/30">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map(a => (
            <button key={a.label} onClick={a.onClick}
              className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                a.tone === 'danger'   ? 'border border-red-500/15 bg-red-500/8 text-red-400 hover:bg-red-500/15' :
                a.tone === 'primary'  ? 'bg-primary text-black hover:bg-primary-light' :
                'border border-white/8 bg-white/4 text-white/60 hover:bg-white/8 hover:text-white'
              }`}
            >{a.label}</button>
          ))}
        </div>
      </div>
      {extra}
    </div>
  )
}

// Lazily fetches size/SHA-256 for an uploaded file and links out to VirusTotal —
// there's no automated scan, but this gives moderators enough to run one manually.
function FileInspector({ filePath }) {
  const [open,    setOpen]    = useState(false)
  const [info,    setInfo]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  if (!filePath) return null

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && !info && !loading) {
      setLoading(true); setError('')
      try {
        const res  = await fetch(`/api/admin/file-info?file=${encodeURIComponent(filePath)}`)
        const data = await res.json().catch(() => ({}))
        if (res.ok) setInfo(data)
        else setError(data.error || 'Failed to inspect file')
      } catch {
        setError('Failed to inspect file')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="mt-3 border-t border-white/5 pt-3">
      <button onClick={toggle} className="flex items-center gap-1.5 text-xs font-semibold text-white/40 transition-colors hover:text-white">
        <FileSearch className="h-3.5 w-3.5" /> {open ? 'Hide file info' : 'Inspect file'}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-white/5 bg-black/20 p-3 text-xs">
          {loading && <p className="text-white/30">Loading…</p>}
          {error && <p className="text-red-400">{error}</p>}
          {info && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-white/30">File</span>
                <span className="truncate font-mono text-white/70">{info.filename}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-white/30">Size</span>
                <span className="text-white/70">{(info.size / 1024).toFixed(1)} KB</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-white/30">SHA-256</span>
                <span className="truncate font-mono text-white/70">{info.sha256}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <a href={info.downloadUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/8 bg-white/4 px-2.5 py-1.5 text-[11px] font-semibold text-white/60 transition-colors hover:text-white">
                  Download
                </a>
                <a href={info.virusTotalUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border border-primary/15 bg-primary/8 px-2.5 py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15">
                  Check on VirusTotal
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview',   label: 'Overview',   icon: LayoutDashboard, authLevel: 'any' },
  { id: 'news',       label: 'News',       icon: Newspaper,       authLevel: 'tools' },
  { id: 'analytics',  label: 'Analytics',  icon: BarChart2,       authLevel: 'tools' },
  { id: 'codes',      label: 'Codes',      icon: Code2,           authLevel: 'tools' },
  { id: 'moderation', label: 'Moderation', icon: ShieldCheck,     authLevel: 'admin' },
  { id: 'users',      label: 'Users',      icon: UsersIcon,       authLevel: 'admin' },
]

export default function AdminPanel() {
  const auth = useAuth()
  const [tab,               setTab]               = useState('overview')
  const [password,          setPassword]          = useState('')
  const [passwordVerified,  setPasswordVerified]  = useState(false)
  const [unlockError,       setUnlockError]       = useState('')
  const [socketStatus,      setSocketStatus]      = useState('offline')
  const [statsData,         setStatsData]         = useState(emptyStats)
  const [liveStats,         setLiveStats]         = useState({ activeUsers: 0, playingUsers: 0, versions: {}, playingInstances: {} })
  const [activity,          setActivity]          = useState({ labels: [], active: [], playing: [] })
  const [news,              setNews]              = useState([])
  const [newsForm,          setNewsForm]          = useState({ title: '', description: '', link: '', image: '' })
  const [newsFile,          setNewsFile]          = useState(null)
  const [maintenanceMode,   setMaintenanceMode]   = useState(false)
  const [codes,             setCodes]             = useState([])
  const [users,             setUsers]             = useState([])
  const [pendingExtensions, setPendingExtensions] = useState([])
  const [pendingVersions,   setPendingVersions]   = useState([])
  const [pendingDrafts,     setPendingDrafts]     = useState([])

  const isSessionAdmin = auth.user?.role === 'admin'
  const canView        = isSessionAdmin || passwordVerified
  const canTools       = passwordVerified || isSessionAdmin

  // Restore saved password on mount
  useEffect(() => {
    const saved = localStorage.getItem('admin_password')
    if (saved) verifyPassword(saved, false)
  }, [])

  // Socket.IO connection
  useEffect(() => {
    if (!canTools) return
    const socket = io()
    setSocketStatus('connecting')
    socket.on('connect', () => {
      setSocketStatus('connected')
      socket.emit('admin-subscribe', passwordVerified ? (localStorage.getItem('admin_password') || '') : '')
    })
    socket.on('disconnect', () => setSocketStatus('offline'))
    socket.on('connect_error', () => setSocketStatus('error'))
    socket.on('error', () => {
      setSocketStatus('error')
      if (!isSessionAdmin) { setPasswordVerified(false); localStorage.removeItem('admin_password') }
    })
    const handle = payload => {
      const live = payload.live || payload || {}
      const persistent = payload.persistent || emptyStats
      setLiveStats(live)
      setStatsData({ ...emptyStats, ...persistent })
      setActivity(cur => {
        const label = new Date().toLocaleTimeString()
        return {
          labels:  [...cur.labels, label].slice(-20),
          active:  [...cur.active, Number(live.activeUsers || 0)].slice(-20),
          playing: [...cur.playing, Number(live.playingUsers || 0)].slice(-20),
        }
      })
    }
    socket.on('init-stats', handle)
    socket.on('live-update', handle)
    return () => socket.disconnect()
  }, [passwordVerified, isSessionAdmin])

  useEffect(() => {
    if (!canTools) return
    loadNews(); loadCodes(); loadMaintenanceStatus()
  }, [passwordVerified, isSessionAdmin])

  useEffect(() => {
    if (!isSessionAdmin) return
    loadModerationData()
  }, [isSessionAdmin])

  // Charts
  const versionsChart = useMemo(() => ({
    labels: Object.keys(statsData.clientVersions || {}),
    datasets: [{ data: Object.values(statsData.clientVersions || {}), backgroundColor: ['#e27602','#14b8a6','#8b5cf6','#3b82f6','#f43f5e','#84cc16'], borderWidth: 0 }],
  }), [statsData.clientVersions])

  const downloadsChart = useMemo(() => {
    const merged = Object.entries(statsData.downloads || {})
      .flatMap(([type, items]) => Object.entries(items || {}).map(([name, count]) => ({ label: `${type}: ${name}`, count })))
      .sort((a, b) => b.count - a.count).slice(0, 10)
    return {
      labels: merged.map(i => i.label),
      datasets: [{ label: 'Downloads', data: merged.map(i => Number(i.count)), backgroundColor: '#e27602', borderRadius: 6 }],
    }
  }, [statsData.downloads])

  const activityChart = useMemo(() => ({
    labels: activity.labels,
    datasets: [
      { label: 'Active', data: activity.active, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.08)', fill: true, tension: 0.35, pointRadius: 0 },
      { label: 'Playing', data: activity.playing, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.35, pointRadius: 0 },
    ],
  }), [activity])

  const totalDownloads = useMemo(() => Object.values(statsData.downloads || {})
    .flatMap(items => Object.values(items || {}))
    .reduce((sum, n) => sum + Number(n || 0), 0), [statsData.downloads])

  const todaysLaunches = statsData.launchesPerDay?.[new Date().toISOString().split('T')[0]] || 0

  // API helpers
  const verifyPassword = async (val = password, persist = true) => {
    setUnlockError('')
    const res  = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: val }) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.success) {
      setUnlockError(data.error || 'Invalid password')
      if (persist) localStorage.removeItem('admin_password')
      return false
    }
    setPasswordVerified(true); setPassword(val)
    if (persist) localStorage.setItem('admin_password', val)
    return true
  }

  const loadNews = async () => {
    const res = await fetch('/api/news')
    setNews(res.ok ? (await res.json().catch(() => [])) : [])
  }
  const saveNews = async next => {
    const adminPassword = passwordVerified ? localStorage.getItem('admin_password') : undefined
    const res = await fetch('/api/news', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ news: next, password: adminPassword }) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed') }
    setNews(next)
  }
  const loadCodes = async () => {
    const adminPassword = passwordVerified ? localStorage.getItem('admin_password') : undefined
    const url = adminPassword ? `/api/codes/list?password=${encodeURIComponent(adminPassword)}` : '/api/codes/list'
    const res = await fetch(url)
    const data = res.ok ? await res.json() : {}
    setCodes(Array.isArray(data.codes) ? data.codes : [])
  }
  const loadMaintenanceStatus = async () => {
    const res = await fetch('/api/admin/maintenance/status', { credentials: 'same-origin' })
    const data = res.ok ? await res.json() : {}
    setMaintenanceMode(!!data.isMaintenanceMode)
  }
  const loadModerationData = async () => {
    const [u, e, v, d] = await Promise.all([
      fetch('/api/admin/users').then(r => r.ok ? r.json() : []),
      fetch('/api/admin/extensions/pending').then(r => r.ok ? r.json() : []),
      fetch('/api/admin/versions/pending').then(r => r.ok ? r.json() : []),
      fetch('/api/admin/drafts/pending').then(r => r.ok ? r.json() : []),
    ])
    setUsers(Array.isArray(u) ? u : [])
    setPendingExtensions(Array.isArray(e) ? e : [])
    setPendingVersions(Array.isArray(v) ? v : [])
    setPendingDrafts(Array.isArray(d) ? d : [])
  }

  const submitNews = async e => {
    e.preventDefault()
    try {
      let image = newsForm.image
      if (newsFile) {
        const fd = new FormData(); fd.append('image', newsFile)
        if (passwordVerified) fd.append('password', localStorage.getItem('admin_password'))
        const res = await fetch('/api/admin/news/upload-image', { method: 'POST', body: fd })
        const data = await res.json()
        if (data.success) image = data.url
      }
      await saveNews([{ title: newsForm.title, description: newsForm.description, link: newsForm.link, image, date: new Date().toLocaleDateString() }, ...news])
      setNewsForm({ title: '', description: '', link: '', image: '' }); setNewsFile(null)
    } catch (err) { setUnlockError(err.message) }
  }
  const removeNews = async i => {
    if (!window.confirm('Delete this news item?')) return
    await saveNews(news.filter((_, idx) => idx !== i))
  }
  const toggleMaintenance = async () => {
    const adminPassword = passwordVerified ? localStorage.getItem('admin_password') : undefined
    const res = await fetch('/api/admin/maintenance/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ password: adminPassword }) })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.success) setMaintenanceMode(!!data.isMaintenanceMode)
  }
  const resetStats = async () => {
    if (!window.confirm('Reset all analytics?')) return
    const adminPassword = passwordVerified ? localStorage.getItem('admin_password') : undefined
    await fetch('/api/admin/reset-stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: adminPassword }) })
  }
  const deleteCode = async code => {
    if (!window.confirm(`Delete code ${code}?`)) return
    const adminPassword = passwordVerified ? localStorage.getItem('admin_password') : undefined
    await fetch(adminPassword ? `/api/codes/${code}?password=${encodeURIComponent(adminPassword)}` : `/api/codes/${code}`, { method: 'DELETE' })
    loadCodes()
  }
  const moderateUser = async (id, action) => {
    let reason = ''; let duration = ''
    if (action === 'warn' || action === 'ban') { reason = window.prompt(`Reason for ${action}:`) || ''; if (!reason) return }
    if (action === 'ban') duration = window.prompt('Duration in hours (empty = permanent):') || ''
    if (action === 'promote' && !window.confirm('Grant this user admin access?')) return
    if (action === 'demote' && !window.confirm('Remove admin access from this user?')) return
    await fetch(`/api/admin/users/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, duration }) })
    loadModerationData()
  }
  const moderateExtension = async (id, action) => {
    const reason = action === 'approve' ? '' : window.prompt(`Reason for ${action}:`) || ''
    if (action !== 'approve' && !reason) return
    await fetch(`/api/admin/extensions/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
    loadModerationData()
  }
  const moderateVersion = async (id, action) => {
    await fetch(`/api/admin/versions/${id}/${action}`, { method: 'POST' })
    loadModerationData()
  }
  const moderateDraft = async (id, action) => {
    const reason = action === 'approve' ? '' : window.prompt(`Reason for ${action}:`) || ''
    if (action !== 'approve' && !reason) return
    await fetch(`/api/admin/drafts/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) })
    loadModerationData()
  }

  // Loading state
  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    )
  }

  // Lock screen
  if (!canView) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 py-24">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Lock className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-black text-white">Admin Panel</h1>
            <p className="text-sm text-white/40">Enter the master password or sign in with an admin account.</p>
          </div>

          <div className="rounded-2xl border border-white/6 bg-[#0f0f0f] p-6">
            <form onSubmit={e => { e.preventDefault(); verifyPassword() }} className="flex flex-col gap-4">
              <input
                value={password}
                onChange={e => setPassword(e.target.value)}
                type="password"
                placeholder="Master password"
                className="w-full rounded-xl border border-white/8 bg-white/4 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
              />
              {unlockError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-500/8 px-3 py-2 text-xs text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {unlockError}
                </div>
              )}
              <button type="submit" className="btn-primary">Unlock</button>
              {!auth.loggedIn && (
                <a href={auth.loginUrl} className="btn-ghost text-center">Sign in with Google</a>
              )}
            </form>
          </div>
        </div>
      </div>
    )
  }

  const visibleTabs = TABS.filter(t => {
    if (t.authLevel === 'admin') return isSessionAdmin
    if (t.authLevel === 'tools') return canTools
    return true
  })

  const SocketIcon = socketStatus === 'connected' ? Wifi : WifiOff
  const socketColor = socketStatus === 'connected' ? 'text-emerald-500' : socketStatus === 'connecting' ? 'text-amber-500' : 'text-white/20'

  return (
    <div className="min-h-screen bg-background text-white">
      <main className="mx-auto max-w-7xl px-5 pb-24 pt-8 lg:px-10">

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="section-label mb-2">Administration</div>
            <h1 className="text-3xl font-black tracking-tight text-white">Control Center</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 rounded-xl border border-white/6 bg-[#0f0f0f] px-3.5 py-2 text-xs font-semibold ${socketColor}`}>
              <SocketIcon className="h-3.5 w-3.5" />
              {socketStatus}
            </div>
            {maintenanceMode && (
              <div className="flex items-center gap-1.5 rounded-xl border border-amber-500/15 bg-amber-500/8 px-3.5 py-2 text-xs font-semibold text-amber-400">
                <Wrench className="h-3.5 w-3.5" />
                Maintenance
              </div>
            )}
            {passwordVerified && (
              <button
                onClick={() => { localStorage.removeItem('admin_password'); setPasswordVerified(false); setSocketStatus('offline') }}
                className="flex items-center gap-1.5 rounded-xl border border-white/6 bg-[#0f0f0f] px-3.5 py-2 text-xs font-semibold text-white/40 transition-colors hover:text-white"
              >
                <Lock className="h-3.5 w-3.5" /> Forget pw
              </button>
            )}
            {auth.loggedIn && (
              <a href={auth.logoutUrl} className="flex items-center gap-1.5 rounded-xl border border-white/6 bg-[#0f0f0f] px-3.5 py-2 text-xs font-semibold text-white/40 transition-colors hover:text-red-400">
                <LogOut className="h-3.5 w-3.5" /> Logout
              </a>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-white/6 bg-[#0c0c0c] p-1.5">
          {visibleTabs.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all ${
                  tab === t.id ? 'bg-primary text-black shadow-glow-sm' : 'text-white/40 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            )
          })}
        </div>

        {unlockError && tab !== 'overview' && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/15 bg-red-500/8 px-4 py-3 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {unlockError}
          </div>
        )}

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div className="flex flex-col gap-6">

            {isSessionAdmin && (
              <div>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/30">Needs Attention</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard icon={ShieldCheck} label="Pending Extensions" value={pendingExtensions.length} color="#e27602" onClick={() => setTab('moderation')} />
                  <StatCard icon={Tag}         label="Pending Versions"   value={pendingVersions.length}   color="#3b82f6" onClick={() => setTab('moderation')} />
                  <StatCard icon={FileText}    label="Pending Drafts"     value={pendingDrafts.length}     color="#8b5cf6" onClick={() => setTab('moderation')} />
                  <StatCard icon={UsersIcon}   label="Registered Users"   value={users.length}             color="#10b981" onClick={() => setTab('users')} />
                </div>
              </div>
            )}

            {canTools && (
              <div>
                <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/30">Live Platform</h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard icon={Wifi}        label="Active Users"     value={liveStats.activeUsers || 0}  color="#10b981" live />
                  <StatCard icon={Download}    label="Playing Users"    value={liveStats.playingUsers || 0} color="#3b82f6" live />
                  <StatCard icon={BarChart2}   label="Today's Launches" value={todaysLaunches}              color="#e27602" />
                  <StatCard icon={TrendingUp}  label="Total Downloads"  value={totalDownloads.toLocaleString()} color="#f59e0b" />
                </div>
              </div>
            )}

            <div>
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-white/30">System</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={Lock}           label="Password"     value={passwordVerified ? 'Unlocked' : 'Locked'} />
                <StatCard icon={User}           label="Session Role" value={auth.user?.role || 'guest'} color="#7c3aed" />
                <StatCard icon={Wifi}           label="Socket"       value={socketStatus} color="#3b82f6" />
                <StatCard icon={Wrench}         label="Maintenance"  value={maintenanceMode ? 'ON' : 'OFF'} color={maintenanceMode ? '#f59e0b' : '#e27602'} />
              </div>
            </div>
          </div>
        )}

        {/* ── NEWS ── */}
        {tab === 'news' && canTools && (
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Published News" description={`${news.length} post${news.length !== 1 ? 's' : ''}`}>
              {news.length === 0 ? (
                <EmptyState message="No news posts yet." />
              ) : (
                <div className="flex flex-col gap-3">
                  {news.map((item, i) => (
                    <div key={i} className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
                      <img
                        src={item.image || '/resources/lux_icon.png?v=3'}
                        alt=""
                        className={`h-14 w-14 shrink-0 rounded-xl ${item.image ? 'object-cover' : 'object-contain bg-white/4 p-2'}`}
                        onError={e => { e.currentTarget.src = '/resources/lux_icon.png?v=3' }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-white/35">{item.description}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[11px] text-white/20">{item.date}</span>
                          <button onClick={() => removeNews(i)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-400/60 transition-colors hover:bg-red-500/10 hover:text-red-400">
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Create Post">
              <form onSubmit={submitNews} className="flex flex-col gap-4">
                <FieldLabel label="Title"><AdminInput value={newsForm.title} onChange={v => setNewsForm(c => ({ ...c, title: v }))} placeholder="Post title" /></FieldLabel>
                <FieldLabel label="Description"><AdminTextarea value={newsForm.description} onChange={v => setNewsForm(c => ({ ...c, description: v }))} /></FieldLabel>
                <FieldLabel label="Link"><AdminInput value={newsForm.link} onChange={v => setNewsForm(c => ({ ...c, link: v }))} placeholder="https://…" /></FieldLabel>
                <FieldLabel label="Image URL"><AdminInput value={newsForm.image} onChange={v => setNewsForm(c => ({ ...c, image: v }))} placeholder="https://… (optional)" /></FieldLabel>
                <FieldLabel label="Upload Image">
                  <input type="file" accept="image/*" onChange={e => setNewsFile(e.target.files?.[0] || null)}
                    className="w-full rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-black"
                  />
                </FieldLabel>
                <button type="submit" className="btn-primary">Publish</button>
              </form>
            </SectionCard>
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {tab === 'analytics' && canTools && (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={Wifi}     label="Active Users"    value={liveStats.activeUsers || 0}  color="#10b981" live />
              <StatCard icon={Download} label="Playing Users"   value={liveStats.playingUsers || 0} color="#3b82f6" live />
              <StatCard icon={User}     label="Unique Machines" value={statsData.uniqueMachineCount || 0} color="#8b5cf6" />
              <StatCard icon={BarChart2} label="Today's Launches" value={statsData.launchesPerDay?.[new Date().toISOString().split('T')[0]] || 0} color="#e27602" />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <SectionCard title="Live Activity">
                <div className="h-64"><Line data={activityChart} options={CHART_OPTS} /></div>
              </SectionCard>
              <SectionCard title="Launcher Versions">
                <div className="h-64"><Doughnut data={versionsChart} options={DONUT_OPTS} /></div>
              </SectionCard>
              <SectionCard title="Top Downloads">
                <div className="h-64"><Bar data={downloadsChart} options={CHART_OPTS} /></div>
              </SectionCard>
              <SectionCard title="Server Controls" description="Use carefully — affects live users.">
                <div className="flex flex-col gap-3">
                  <button
                    onClick={toggleMaintenance}
                    className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition ${maintenanceMode ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-primary text-black hover:bg-primary-light'}`}
                  >
                    <Wrench className="h-4 w-4" />
                    {maintenanceMode ? 'Disable maintenance' : 'Enable maintenance'}
                  </button>
                  <button onClick={resetStats} className="flex items-center gap-2 rounded-xl border border-red-500/15 bg-red-500/8 px-5 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500/15">
                    <RefreshCw className="h-4 w-4" /> Reset analytics
                  </button>
                </div>
              </SectionCard>
            </div>
          </div>
        )}

        {/* ── CODES ── */}
        {tab === 'codes' && canTools && (
          <SectionCard
            title="Modpack Codes"
            description="Active share codes from all users."
            action={
              <button onClick={loadCodes} className="flex items-center gap-1.5 rounded-xl border border-white/6 bg-white/4 px-3.5 py-2 text-xs font-semibold text-white/50 transition-colors hover:text-white">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            }
          >
            {codes.length === 0 ? <EmptyState message="No active codes." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-[11px] font-bold uppercase tracking-widest text-white/20">
                      <th className="pb-3 text-left">Code</th>
                      <th className="pb-3 text-left">Name</th>
                      <th className="pb-3 text-left">Version</th>
                      <th className="pb-3 text-left">Uses</th>
                      <th className="pb-3 text-left">Expires</th>
                      <th className="pb-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/4">
                    {codes.map(code => (
                      <tr key={code.code} className="text-sm text-white/60">
                        <td className="py-3 font-mono font-bold text-primary">{code.code}</td>
                        <td className="py-3">{code.name || '—'}</td>
                        <td className="py-3">{code.version || '?'} · {code.loader || '?'}</td>
                        <td className="py-3">{code.uses || 0}</td>
                        <td className="py-3 text-white/30">{code.expires ? new Date(code.expires).toLocaleString() : '—'}</td>
                        <td className="py-3 text-right">
                          <button onClick={() => deleteCode(code.code)} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-red-400/50 transition-colors hover:bg-red-500/10 hover:text-red-400">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        )}

        {/* ── MODERATION ── */}
        {tab === 'moderation' && isSessionAdmin && (
          <div className="flex flex-col gap-5">
            <SectionCard title="Pending Extensions" description="Review new marketplace submissions. Inspect the file before approving.">
              {pendingExtensions.length === 0 ? <EmptyState message="No pending extensions." /> : (
                <div className="flex flex-col gap-3">
                  {pendingExtensions.map(item => (
                    <ModerationItem
                      key={item.id}
                      title={item.name}
                      subtitle={`${item.developer || 'Unknown'} · ${item.identifier}`}
                      image={fixPath(item.banner_path)}
                      extra={<FileInspector filePath={item.file_path} />}
                      actions={[
                        { label: 'Approve', onClick: () => moderateExtension(item.id, 'approve'), tone: 'primary' },
                        { label: 'Action Req.', onClick: () => moderateExtension(item.id, 'action_required') },
                        { label: 'Reject', onClick: () => moderateExtension(item.id, 'reject'), tone: 'danger' },
                      ]}
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Pending Versions" description="Additional version uploads for approved projects. Inspect the file before approving.">
              {pendingVersions.length === 0 ? <EmptyState message="No pending versions." /> : (
                <div className="flex flex-col gap-3">
                  {pendingVersions.map(item => (
                    <ModerationItem
                      key={item.id}
                      title={`${item.extension_name} ${item.version}`}
                      subtitle={item.developer || 'Unknown'}
                      extra={<FileInspector filePath={item.file_path} />}
                      actions={[
                        { label: 'Approve', onClick: () => moderateVersion(item.id, 'approve'), tone: 'primary' },
                        { label: 'Reject',  onClick: () => moderateVersion(item.id, 'reject'),  tone: 'danger' },
                      ]}
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Pending Metadata Drafts" description="Creator-submitted metadata change requests.">
              {pendingDrafts.length === 0 ? <EmptyState message="No pending drafts." /> : (
                <div className="flex flex-col gap-3">
                  {pendingDrafts.map(item => (
                    <ModerationItem key={item.id} title={item.original_name} subtitle={item.developer || 'Unknown'} actions={[
                      { label: 'Approve', onClick: () => moderateDraft(item.id, 'approve'), tone: 'primary' },
                      { label: 'Reject',  onClick: () => moderateDraft(item.id, 'reject'),  tone: 'danger' },
                    ]} />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && isSessionAdmin && (
          <SectionCard
            title="Users"
            description={`${users.length} account${users.length !== 1 ? 's' : ''} registered.`}
            action={
              <button onClick={loadModerationData} className="flex items-center gap-1.5 rounded-xl border border-white/6 bg-white/4 px-3.5 py-2 text-xs font-semibold text-white/50 transition-colors hover:text-white">
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </button>
            }
          >
            {users.length === 0 ? <EmptyState message="No users." /> : (
              <div className="flex flex-col gap-3">
                {users.map(user => (
                  <ModerationItem
                    key={user.id}
                    title={user.username}
                    subtitle={`${user.email || 'No email'} · ${user.role}${user.banned ? ' · BANNED' : ''}`}
                    image={fixPath(user.avatar)}
                    actions={[
                      { label: 'Warn', onClick: () => moderateUser(user.id, 'warn') },
                      user.banned
                        ? { label: 'Unban', onClick: () => moderateUser(user.id, 'unban'), tone: 'primary' }
                        : { label: 'Ban',   onClick: () => moderateUser(user.id, 'ban'),   tone: 'danger' },
                      user.role === 'admin'
                        ? { label: 'Remove Admin', onClick: () => moderateUser(user.id, 'demote'), tone: 'danger' }
                        : { label: 'Make Admin',   onClick: () => moderateUser(user.id, 'promote'), tone: 'primary' },
                    ]}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        )}

      </main>
    </div>
  )
}
