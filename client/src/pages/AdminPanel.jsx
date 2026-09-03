import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend,
  LineElement, LinearScale, PointElement, Tooltip,
} from 'chart.js'
import { io } from 'socket.io-client'
import {
  BarChart2, Cloud as CloudIcon, Code2, History, LayoutDashboard,
  Newspaper, RefreshCw, ShieldCheck, Users as UsersIcon,
} from 'lucide-react'

import AdminShell from '../components/admin/AdminShell'
import LockScreen from '../components/admin/LockScreen'
import CloudPanel from '../components/admin/CloudPanel'
import { Button } from '../components/admin/ui'
import { DialogProvider, ToastProvider, useDialog, useToast } from '../components/admin/feedback'
import OverviewView from '../components/admin/views/OverviewView'
import NewsView from '../components/admin/views/NewsView'
import AnalyticsView from '../components/admin/views/AnalyticsView'
import CodesView from '../components/admin/views/CodesView'
import ModerationView from '../components/admin/views/ModerationView'
import UsersView from '../components/admin/views/UsersView'
import AuditLogView from '../components/admin/views/AuditLogView'
import useAuth from '../hooks/useAuth'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Filler, Tooltip, Legend)

const EMPTY_STATS = {
  downloads: { mod: {}, resourcepack: {}, shader: {}, modpack: {} },
  clientVersions: {}, launchesPerDay: {}, uniqueMachineCount: 0, uniqueMachines: {},
  software: { client: {}, server: {} }, gameVersions: { client: {}, server: {} },
}

const SERIES_COLORS = ['#e27602', '#14b8a6', '#8b5cf6', '#3b82f6', '#f43f5e', '#84cc16', '#f59e0b', '#06b6d4']

/* id → sidebar group, label, required access level and the page heading shown
   in the topbar. `tools` means master password or admin session, `admin` means
   a signed-in admin account. */
const SECTIONS = [
  { id: 'overview',   group: 'Overview',  label: 'Dashboard',     icon: LayoutDashboard, level: 'any',   title: 'Dashboard',     description: 'Everything that needs you, at a glance.' },
  { id: 'news',       group: 'Content',   label: 'News',          icon: Newspaper,       level: 'tools', title: 'News',          description: 'Posts shown in the launcher and on the website.' },
  { id: 'codes',      group: 'Content',   label: 'Modpack codes', icon: Code2,           level: 'tools', title: 'Modpack codes', description: 'Active share codes across all users.' },
  { id: 'analytics',  group: 'Insights',  label: 'Analytics',     icon: BarChart2,       level: 'tools', title: 'Analytics',     description: 'Live usage, versions and download numbers.' },
  { id: 'moderation', group: 'Community', label: 'Moderation',    icon: ShieldCheck,     level: 'admin', title: 'Moderation',    description: 'Review submissions and community reports.' },
  { id: 'users',      group: 'Community', label: 'Accounts',      icon: UsersIcon,       level: 'admin', title: 'Accounts',      description: 'Registered users, roles and bans.' },
  { id: 'cloud',      group: 'System',    label: 'Lux Cloud',     icon: CloudIcon,       level: 'admin', title: 'Lux Cloud',     description: 'Storage, deduplication, quotas and cleanup jobs.' },
  { id: 'auditlog',   group: 'System',    label: 'Audit log',     icon: History,         level: 'admin', title: 'Audit log',     description: 'A record of every moderation action.' },
]

function AdminPanelInner() {
  const auth   = useAuth()
  const toast  = useToast()
  const dialog = useDialog()

  const [tab,              setTab]              = useState('overview')
  const [password,         setPassword]         = useState('')
  const [passwordVerified, setPasswordVerified] = useState(false)
  const [unlockError,      setUnlockError]      = useState('')
  const [unlockBusy,       setUnlockBusy]       = useState(false)
  const [socketStatus,     setSocketStatus]     = useState('offline')

  const [statsData, setStatsData] = useState(EMPTY_STATS)
  const [liveStats, setLiveStats] = useState({ activeUsers: 0, playingUsers: 0, versions: {}, playingInstances: {} })
  const [activity,  setActivity]  = useState({ labels: [], active: [], playing: [] })

  const [news,     setNews]     = useState([])
  const [newsForm, setNewsForm] = useState({ title: '', description: '', link: '', image: '' })
  const [newsFile, setNewsFile] = useState(null)
  const [newsBusy, setNewsBusy] = useState(false)

  const [maintenanceMode,   setMaintenanceMode]   = useState(false)
  const [codes,             setCodes]             = useState([])
  const [users,             setUsers]             = useState([])
  const [pendingExtensions, setPendingExtensions] = useState([])
  const [pendingVersions,   setPendingVersions]   = useState([])
  const [pendingDrafts,     setPendingDrafts]     = useState([])
  const [reports,           setReports]           = useState([])
  const [auditLog,          setAuditLog]          = useState([])
  const [auditLogLoaded,    setAuditLogLoaded]    = useState(false)

  const isSessionAdmin = auth.user?.role === 'admin'
  const canView        = isSessionAdmin || passwordVerified
  const canTools       = isSessionAdmin || passwordVerified

  const adminPassword = () => (passwordVerified ? localStorage.getItem('admin_password') : undefined)

  // ─── Requests ──────────────────────────────────────────────────────────────

  /* One place where a failed admin action turns into a visible toast — the old
     panel fired these off and showed nothing either way. */
  const request = useCallback(async (url, options, { success, failure }) => {
    try {
      const res  = await fetch(url, options)
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.success === false) {
        throw new Error(data.error || data.message || `Request failed (${res.status})`)
      }
      if (success) toast.success(success)
      return data
    } catch (error) {
      toast.error(failure, error.message)
      return null
    }
  }, [toast])

  const verifyPassword = useCallback(async (value, persist = true) => {
    setUnlockError('')
    setUnlockBusy(true)
    try {
      const res  = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setUnlockError(data.error || 'Invalid password')
        if (persist) localStorage.removeItem('admin_password')
        return false
      }
      setPasswordVerified(true)
      setPassword(value)
      if (persist) localStorage.setItem('admin_password', value)
      return true
    } catch {
      setUnlockError('Could not reach the server')
      return false
    } finally {
      setUnlockBusy(false)
    }
  }, [])

  const loadNews = useCallback(async () => {
    const res = await fetch('/api/news')
    setNews(res.ok ? (await res.json().catch(() => [])) : [])
  }, [])

  const loadCodes = useCallback(async () => {
    const pw  = adminPassword()
    const res = await fetch(pw ? `/api/codes/list?password=${encodeURIComponent(pw)}` : '/api/codes/list')
    const data = res.ok ? await res.json().catch(() => ({})) : {}
    setCodes(Array.isArray(data.codes) ? data.codes : [])
  }, [passwordVerified])

  const loadMaintenanceStatus = useCallback(async () => {
    const res  = await fetch('/api/admin/maintenance/status', { credentials: 'same-origin' })
    const data = res.ok ? await res.json().catch(() => ({})) : {}
    setMaintenanceMode(!!data.isMaintenanceMode)
  }, [])

  const loadModerationData = useCallback(async () => {
    const [u, e, v, d, r] = await Promise.all([
      fetch('/api/admin/users').then(res => res.ok ? res.json() : []),
      fetch('/api/admin/extensions/pending').then(res => res.ok ? res.json() : []),
      fetch('/api/admin/versions/pending').then(res => res.ok ? res.json() : []),
      fetch('/api/admin/drafts/pending').then(res => res.ok ? res.json() : []),
      fetch('/api/admin/reports').then(res => res.ok ? res.json() : []),
    ])
    setUsers(Array.isArray(u) ? u : [])
    setPendingExtensions(Array.isArray(e) ? e : [])
    setPendingVersions(Array.isArray(v) ? v : [])
    setPendingDrafts(Array.isArray(d) ? d : [])
    setReports(Array.isArray(r) ? r : [])
  }, [])

  const loadAuditLog = useCallback(async () => {
    const res  = await fetch('/api/admin/audit-log')
    const data = res.ok ? await res.json().catch(() => []) : []
    setAuditLog(Array.isArray(data) ? data : [])
    setAuditLogLoaded(true)
  }, [])

  // ─── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const saved = localStorage.getItem('admin_password')
    if (saved) verifyPassword(saved, false)
  }, [verifyPassword])

  useEffect(() => {
    if (!canTools) return
    const socket = io()
    setSocketStatus('connecting')
    socket.on('connect', () => {
      setSocketStatus('connected')
      socket.emit('admin-subscribe', passwordVerified ? (localStorage.getItem('admin_password') || '') : '')
    })
    socket.on('disconnect',    () => setSocketStatus('offline'))
    socket.on('connect_error', () => setSocketStatus('error'))
    socket.on('error', () => {
      setSocketStatus('error')
      if (!isSessionAdmin) {
        setPasswordVerified(false)
        localStorage.removeItem('admin_password')
      }
    })
    const handle = payload => {
      const live       = payload.live || payload || {}
      const persistent = payload.persistent || EMPTY_STATS
      setLiveStats(live)
      setStatsData({ ...EMPTY_STATS, ...persistent })
      setActivity(cur => ({
        labels:  [...cur.labels,  new Date().toLocaleTimeString()].slice(-20),
        active:  [...cur.active,  Number(live.activeUsers  || 0)].slice(-20),
        playing: [...cur.playing, Number(live.playingUsers || 0)].slice(-20),
      }))
    }
    socket.on('init-stats',  handle)
    socket.on('live-update', handle)
    return () => socket.disconnect()
  }, [canTools, passwordVerified, isSessionAdmin])

  useEffect(() => {
    if (!canTools) return
    loadNews(); loadCodes(); loadMaintenanceStatus()
  }, [canTools, loadNews, loadCodes, loadMaintenanceStatus])

  useEffect(() => {
    if (!isSessionAdmin) return
    loadModerationData()
  }, [isSessionAdmin, loadModerationData])

  useEffect(() => {
    if (!isSessionAdmin || tab !== 'auditlog' || auditLogLoaded) return
    loadAuditLog()
  }, [isSessionAdmin, tab, auditLogLoaded, loadAuditLog])

  /* Keep the panel on a section the current access level actually allows. */
  useEffect(() => {
    const section = SECTIONS.find(s => s.id === tab)
    if (!section) return
    const allowed = section.level === 'any' || (section.level === 'tools' ? canTools : isSessionAdmin)
    if (!allowed) setTab('overview')
  }, [tab, canTools, isSessionAdmin])

  // ─── Derived data ──────────────────────────────────────────────────────────

  const versionsChart = useMemo(() => {
    const labels = Object.keys(statsData.clientVersions || {})
    return {
      labels,
      datasets: [{
        data: Object.values(statsData.clientVersions || {}).map(Number),
        backgroundColor: labels.map((_, i) => SERIES_COLORS[i % SERIES_COLORS.length]),
        borderColor: '#0f0f0f',
        borderWidth: 2,
      }],
    }
  }, [statsData.clientVersions])

  const downloadsChart = useMemo(() => {
    const merged = Object.entries(statsData.downloads || {})
      .flatMap(([type, items]) => Object.entries(items || {}).map(([name, count]) => ({ label: `${name} · ${type}`, count: Number(count || 0) })))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
    return {
      labels: merged.map(i => i.label),
      datasets: [{ label: 'Downloads', data: merged.map(i => i.count), backgroundColor: 'rgba(226,118,2,0.75)', hoverBackgroundColor: '#e27602', borderRadius: 5, borderSkipped: false }],
    }
  }, [statsData.downloads])

  const activityChart = useMemo(() => ({
    labels: activity.labels,
    datasets: [
      { label: 'Active',  data: activity.active,  borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.10)', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 },
      { label: 'In game', data: activity.playing, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.10)', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 },
    ],
  }), [activity])

  const totalDownloads = useMemo(() => Object.values(statsData.downloads || {})
    .flatMap(items => Object.values(items || {}))
    .reduce((sum, n) => sum + Number(n || 0), 0), [statsData.downloads])

  const todaysLaunches = statsData.launchesPerDay?.[new Date().toISOString().split('T')[0]] || 0
  const uniqueMachines = Number(statsData.uniqueMachineCount || 0)
  const pendingTotal   = pendingExtensions.length + pendingVersions.length + pendingDrafts.length + reports.length

  const navGroups = useMemo(() => {
    const allowed = SECTIONS.filter(s =>
      s.level === 'any' || (s.level === 'tools' ? canTools : isSessionAdmin))
    return allowed.reduce((groups, section) => {
      const badge = section.id === 'moderation' ? pendingTotal : 0
      const existing = groups.find(g => g.label === section.group)
      const item = { id: section.id, label: section.label, icon: section.icon, badge, badgeTone: 'danger' }
      if (existing) existing.items.push(item)
      else groups.push({ label: section.group, items: [item] })
      return groups
    }, [])
  }, [canTools, isSessionAdmin, pendingTotal])

  const section = SECTIONS.find(s => s.id === tab) || SECTIONS[0]

  // ─── Actions ───────────────────────────────────────────────────────────────

  const refreshCurrent = () => {
    if (tab === 'news')                             loadNews()
    else if (tab === 'codes')                       loadCodes()
    else if (tab === 'auditlog')                    loadAuditLog()
    else if (tab === 'moderation' || tab === 'users') loadModerationData()
    else { loadMaintenanceStatus(); if (isSessionAdmin) loadModerationData() }
    toast.info('Refreshed')
  }

  const submitNews = async event => {
    event.preventDefault()
    setNewsBusy(true)
    try {
      let image = newsForm.image
      if (newsFile) {
        const body = new FormData()
        body.append('image', newsFile)
        const pw = adminPassword()
        if (pw) body.append('password', pw)
        const res  = await fetch('/api/admin/news/upload-image', { method: 'POST', body })
        const data = await res.json().catch(() => ({}))
        if (!data.success) throw new Error(data.error || 'Image upload failed')
        image = data.url
      }
      const next = [{ ...newsForm, image, date: new Date().toLocaleDateString() }, ...news]
      const res  = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ news: next, password: adminPassword() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Could not publish the post')
      }
      setNews(next)
      setNewsForm({ title: '', description: '', link: '', image: '' })
      setNewsFile(null)
      toast.success('Post published')
    } catch (error) {
      toast.error('Publishing failed', error.message)
    } finally {
      setNewsBusy(false)
    }
  }

  const removeNews = async index => {
    const item = news[index]
    const ok = await dialog.confirm({
      title: 'Delete this post?',
      description: `“${item?.title}” disappears from the launcher and the website immediately.`,
      confirmLabel: 'Delete post',
      tone: 'danger',
    })
    if (!ok) return
    const next = news.filter((_, i) => i !== index)
    const res  = await request('/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ news: next, password: adminPassword() }),
    }, { success: 'Post deleted', failure: 'Could not delete the post' })
    if (res) setNews(next)
  }

  const toggleMaintenance = async () => {
    const enabling = !maintenanceMode
    const ok = await dialog.confirm({
      title: enabling ? 'Enable maintenance mode?' : 'Disable maintenance mode?',
      description: enabling
        ? 'Visitors are redirected to the maintenance page until you turn this off again.'
        : 'The website becomes reachable for everyone again.',
      confirmLabel: enabling ? 'Enable' : 'Disable',
      tone: enabling ? 'danger' : 'default',
    })
    if (!ok) return
    const data = await request('/api/admin/maintenance/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password: adminPassword() }),
    }, { success: enabling ? 'Maintenance mode enabled' : 'Maintenance mode disabled', failure: 'Could not change maintenance mode' })
    if (data) setMaintenanceMode(!!data.isMaintenanceMode)
  }

  const resetStats = async () => {
    const ok = await dialog.confirm({
      title: 'Reset all analytics?',
      description: 'Download counts, launch history, version distribution and machine identifiers are permanently deleted. This cannot be undone.',
      confirmLabel: 'Reset everything',
      tone: 'danger',
    })
    if (!ok) return
    await request('/api/admin/reset-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword() }),
    }, { success: 'Analytics reset', failure: 'Could not reset analytics' })
  }

  const deleteCode = async code => {
    const ok = await dialog.confirm({
      title: `Delete code ${code}?`,
      description: 'Anyone still holding this code will no longer be able to redeem it.',
      confirmLabel: 'Delete code',
      tone: 'danger',
    })
    if (!ok) return
    const pw = adminPassword()
    const done = await request(
      pw ? `/api/codes/${code}?password=${encodeURIComponent(pw)}` : `/api/codes/${code}`,
      { method: 'DELETE' },
      { success: 'Code deleted', failure: 'Could not delete the code' },
    )
    if (done) loadCodes()
  }

  const moderateUser = async (user, action) => {
    let body = { reason: '', duration: '' }

    if (action === 'warn') {
      const values = await dialog.prompt({
        title: `Warn ${user.username}`,
        description: 'The reason is shown to the user in their notifications.',
        fields: [{ name: 'reason', label: 'Reason', placeholder: 'What went wrong?', required: true }],
        confirmLabel: 'Send warning',
      })
      if (!values) return
      body = { reason: values.reason, duration: '' }
    } else if (action === 'ban') {
      const values = await dialog.prompt({
        title: `Ban ${user.username}`,
        description: 'The user loses access immediately.',
        tone: 'danger',
        confirmLabel: 'Ban account',
        fields: [
          { name: 'reason',   label: 'Reason', placeholder: 'Why is this account banned?', required: true },
          { name: 'duration', label: 'Duration in hours', type: 'number', placeholder: '24', hint: 'Leave empty for a permanent ban.' },
        ],
      })
      if (!values) return
      body = { reason: values.reason, duration: values.duration || '' }
    } else {
      const copy = {
        unban:   { title: `Unban ${user.username}?`,      description: 'The account can sign in and publish again.',              confirmLabel: 'Unban',        tone: 'default' },
        promote: { title: `Make ${user.username} admin?`, description: 'They gain full access to this panel, including bans.',    confirmLabel: 'Grant admin',  tone: 'danger' },
        demote:  { title: `Revoke admin from ${user.username}?`, description: 'They lose access to this panel immediately.',      confirmLabel: 'Revoke admin', tone: 'danger' },
      }[action]
      if (copy && !(await dialog.confirm(copy))) return
    }

    const done = await request(`/api/admin/users/${user.id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, { success: `${user.username}: ${action} applied`, failure: `Could not ${action} ${user.username}` })
    if (done) loadModerationData()
  }

  /* Approvals go straight through; anything negative asks for a reason, because
     that reason is what the creator receives. */
  const moderateSubmission = async (kind, item, action, label) => {
    let reason = ''
    if (action !== 'approve') {
      const values = await dialog.prompt({
        title: `${action === 'reject' ? 'Reject' : 'Request changes for'} “${label}”`,
        description: 'The reason is sent to the creator.',
        tone: action === 'reject' ? 'danger' : 'default',
        confirmLabel: action === 'reject' ? 'Reject' : 'Send request',
        fields: [{ name: 'reason', label: 'Reason', placeholder: 'What needs to change?', required: true }],
      })
      if (!values) return
      reason = values.reason
    }
    const done = await request(`/api/admin/${kind}/${item.id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }, { success: `“${label}” ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'sent back'}`, failure: `Could not ${action} “${label}”` })
    if (done) loadModerationData()
  }

  const moderateVersion = async (item, action) => {
    if (action === 'reject') {
      const ok = await dialog.confirm({
        title: `Reject ${item.extension_name} ${item.version}?`,
        description: 'The upload is discarded and the creator is notified.',
        confirmLabel: 'Reject version',
        tone: 'danger',
      })
      if (!ok) return
    }
    const done = await request(`/api/admin/versions/${item.id}/${action}`, { method: 'POST' },
      { success: `Version ${item.version} ${action === 'approve' ? 'approved' : 'rejected'}`, failure: `Could not ${action} the version` })
    if (done) loadModerationData()
  }

  const moderateReport = async (item, action) => {
    const done = await request(`/api/admin/reports/${item.id}/${action}`, { method: 'POST' },
      { success: action === 'resolve' ? 'Report resolved' : 'Report dismissed', failure: 'Could not update the report' })
    if (done) loadModerationData()
  }

  const forgetPassword = () => {
    localStorage.removeItem('admin_password')
    setPasswordVerified(false)
    setPassword('')
    setSocketStatus('offline')
    toast.info('Master password forgotten on this device')
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080808]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
      </div>
    )
  }

  if (!canView) {
    return (
      <LockScreen
        password={password}
        onPasswordChange={setPassword}
        onSubmit={e => { e.preventDefault(); verifyPassword(password) }}
        error={unlockError}
        busy={unlockBusy}
        loggedIn={auth.loggedIn}
        loginUrl={auth.loginUrl}
      />
    )
  }

  return (
    <AdminShell
      groups={navGroups}
      active={tab}
      onSelect={setTab}
      title={section.title}
      description={section.description}
      socketStatus={socketStatus}
      maintenanceMode={maintenanceMode}
      role={auth.user?.role || (passwordVerified ? 'operator' : 'guest')}
      passwordVerified={passwordVerified}
      onForgetPassword={forgetPassword}
      logoutUrl={auth.loggedIn ? auth.logoutUrl : null}
      actions={<Button icon={RefreshCw} onClick={refreshCurrent}><span className="hidden sm:inline">Refresh</span></Button>}
    >
      {tab === 'overview' && (
        <OverviewView
          isSessionAdmin={isSessionAdmin}
          canTools={canTools}
          liveStats={liveStats}
          activity={activity}
          todaysLaunches={todaysLaunches}
          totalDownloads={totalDownloads}
          uniqueMachines={uniqueMachines}
          counts={{
            extensions: pendingExtensions.length,
            versions:   pendingVersions.length,
            drafts:     pendingDrafts.length,
            reports:    reports.length,
            users:      users.length,
          }}
          socketStatus={socketStatus}
          maintenanceMode={maintenanceMode}
          onToggleMaintenance={toggleMaintenance}
          passwordVerified={passwordVerified}
          role={auth.user?.role}
          onNavigate={setTab}
        />
      )}

      {tab === 'news' && canTools && (
        <NewsView
          news={news}
          form={newsForm}
          onFormChange={patch => setNewsForm(cur => ({ ...cur, ...patch }))}
          file={newsFile}
          onFileChange={setNewsFile}
          onSubmit={submitNews}
          onRemove={removeNews}
          submitting={newsBusy}
        />
      )}

      {tab === 'analytics' && canTools && (
        <AnalyticsView
          liveStats={liveStats}
          uniqueMachines={uniqueMachines}
          todaysLaunches={todaysLaunches}
          totalDownloads={totalDownloads}
          activityChart={activityChart}
          versionsChart={versionsChart}
          downloadsChart={downloadsChart}
          hasVersions={versionsChart.labels.length > 0}
          hasDownloads={downloadsChart.labels.length > 0}
          onResetStats={resetStats}
        />
      )}

      {tab === 'codes' && canTools && (
        <CodesView codes={codes} onRefresh={loadCodes} onDelete={deleteCode} />
      )}

      {tab === 'moderation' && isSessionAdmin && (
        <ModerationView
          reports={reports}
          extensions={pendingExtensions}
          versions={pendingVersions}
          drafts={pendingDrafts}
          onModerateReport={moderateReport}
          onModerateExtension={(item, action) => moderateSubmission('extensions', item, action, item.name)}
          onModerateVersion={moderateVersion}
          onModerateDraft={(item, action) => moderateSubmission('drafts', item, action, item.original_name)}
        />
      )}

      {tab === 'users' && isSessionAdmin && (
        <UsersView users={users} onRefresh={loadModerationData} onModerate={moderateUser} />
      )}

      {tab === 'cloud' && isSessionAdmin && <CloudPanel />}

      {tab === 'auditlog' && isSessionAdmin && (
        <AuditLogView entries={auditLog} loaded={auditLogLoaded} onRefresh={loadAuditLog} />
      )}
    </AdminShell>
  )
}

export default function AdminPanel() {
  return (
    <ToastProvider>
      <DialogProvider>
        <AdminPanelInner />
      </DialogProvider>
    </ToastProvider>
  )
}
