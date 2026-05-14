import { useEffect, useMemo, useState } from 'react'
import { Bar, Doughnut, Line } from 'react-chartjs-2'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import { io } from 'socket.io-client'
import useAuth, { fixPath } from '../hooks/useAuth'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, PointElement, LineElement, Tooltip, Legend)

const baseChartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { labels: { color: '#d1d5db' } } },
  scales: {
    x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
    y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true },
  },
}

const emptyStats = {
  downloads: { mod: {}, resourcepack: {}, shader: {}, modpack: {} },
  clientVersions: {},
  launchesPerDay: {},
  uniqueMachineCount: 0,
  uniqueMachines: {},
  software: { client: {}, server: {} },
  gameVersions: { client: {}, server: {} },
}

export default function AdminPanel() {
  const auth = useAuth()
  const [tab, setTab] = useState('overview')
  const [password, setPassword] = useState('')
  const [passwordVerified, setPasswordVerified] = useState(false)
  const [unlockError, setUnlockError] = useState('')
  const [socketStatus, setSocketStatus] = useState('offline')
  const [statsData, setStatsData] = useState(emptyStats)
  const [liveStats, setLiveStats] = useState({ activeUsers: 0, playingUsers: 0, versions: {}, playingInstances: {} })
  const [activity, setActivity] = useState({ labels: [], active: [], playing: [] })
  const [news, setNews] = useState([])
  const [newsForm, setNewsForm] = useState({ title: '', description: '', link: '', image: '' })
  const [newsFile, setNewsFile] = useState(null)
  const [maintenanceMode, setMaintenanceMode] = useState(false)
  const [codes, setCodes] = useState([])
  const [users, setUsers] = useState([])
  const [pendingExtensions, setPendingExtensions] = useState([])
  const [pendingVersions, setPendingVersions] = useState([])
  const [pendingDrafts, setPendingDrafts] = useState([])

  const isSessionAdmin = auth.user?.role === 'admin'
  const canView = isSessionAdmin || passwordVerified
  const canAccessTools = passwordVerified || isSessionAdmin

  useEffect(() => {
    const savedPassword = window.localStorage.getItem('admin_password')
    if (!savedPassword) return
    verifyPassword(savedPassword, false)
  }, [])

  useEffect(() => {
    if (!canAccessTools) return undefined

    const socket = io()
    setSocketStatus('connecting')

    socket.on('connect', () => {
      setSocketStatus('connected')
      socket.emit('admin-subscribe', passwordVerified ? (window.localStorage.getItem('admin_password') || '') : '')
    })
    socket.on('disconnect', () => setSocketStatus('offline'))
    socket.on('connect_error', () => setSocketStatus('error'))
    socket.on('error', () => {
      setSocketStatus('error')
      if (!isSessionAdmin) {
        setPasswordVerified(false)
        window.localStorage.removeItem('admin_password')
      }
    })

    const handlePayload = (payload) => {
      const live = payload.live || payload || {}
      const persistent = payload.persistent || emptyStats
      setLiveStats(live)
      setStatsData({ ...emptyStats, ...persistent })
      setActivity((current) => {
        const label = new Date().toLocaleTimeString()
        const labels = [...current.labels, label].slice(-20)
        const active = [...current.active, Number(live.activeUsers || 0)].slice(-20)
        const playing = [...current.playing, Number(live.playingUsers || 0)].slice(-20)
        return { labels, active, playing }
      })
    }

    socket.on('init-stats', handlePayload)
    socket.on('live-update', handlePayload)

    return () => socket.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passwordVerified, isSessionAdmin])

  useEffect(() => {
    if (!canAccessTools) return
    loadNews()
    loadCodes()
    loadMaintenanceStatus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passwordVerified, isSessionAdmin])

  useEffect(() => {
    if (!isSessionAdmin) return
    loadModerationData()
  }, [isSessionAdmin])

  const versionsChart = useMemo(() => ({
    labels: Object.keys(statsData.clientVersions || {}),
    datasets: [{ data: Object.values(statsData.clientVersions || {}), backgroundColor: ['#e27602', '#14b8a6', '#8b5cf6', '#3b82f6', '#f43f5e'], borderWidth: 0 }],
  }), [statsData.clientVersions])

  const downloadsChart = useMemo(() => {
    const merged = Object.entries(statsData.downloads || {}).flatMap(([type, items]) => Object.entries(items || {}).map(([name, count]) => ({ label: `${type}: ${name}`, count })))
      .sort((a, b) => Number(b.count) - Number(a.count))
      .slice(0, 10)

    return {
      labels: merged.map((item) => item.label),
      datasets: [{ label: 'Downloads', data: merged.map((item) => Number(item.count)), backgroundColor: '#3498db', borderRadius: 12 }],
    }
  }, [statsData.downloads])

  const activityChart = useMemo(() => ({
    labels: activity.labels,
    datasets: [
      { label: 'Active Launchers', data: activity.active, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.12)', fill: true, tension: 0.35 },
      { label: 'In Game', data: activity.playing, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.12)', fill: true, tension: 0.35 },
    ],
  }), [activity])

  const verifyPassword = async (value = password, persist = true) => {
    setUnlockError('')
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: value }),
    })
    const data = await response.json().catch(() => ({}))

    if (!response.ok || !data.success) {
      setUnlockError(data.error || 'Invalid password')
      if (persist) window.localStorage.removeItem('admin_password')
      return false
    }

    setPasswordVerified(true)
    setPassword(value)
    if (persist) window.localStorage.setItem('admin_password', value)
    return true
  }

  const loadNews = async () => {
    const response = await fetch('/api/news')
    const data = response.ok ? await response.json() : []
    setNews(Array.isArray(data) ? data : [])
  }

  const saveNews = async (nextNews) => {
    const adminPassword = passwordVerified ? window.localStorage.getItem('admin_password') : undefined
    const response = await fetch('/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ news: nextNews, password: adminPassword }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error || 'Failed to save news')
    }
    setNews(nextNews)
  }

  const loadCodes = async () => {
    const adminPassword = passwordVerified ? window.localStorage.getItem('admin_password') : undefined
    const url = adminPassword ? `/api/codes/list?password=${encodeURIComponent(adminPassword)}` : '/api/codes/list'
    const response = await fetch(url)
    const data = response.ok ? await response.json() : { success: false, codes: [] }
    setCodes(Array.isArray(data.codes) ? data.codes : [])
  }

  const loadMaintenanceStatus = async () => {
    const response = await fetch('/api/admin/maintenance/status', { credentials: 'same-origin' })
    const data = response.ok ? await response.json() : { isMaintenanceMode: false }
    setMaintenanceMode(!!data.isMaintenanceMode)
  }

  const loadModerationData = async () => {
    const requests = await Promise.all([
      fetch('/api/admin/users').then((response) => response.ok ? response.json() : []),
      fetch('/api/admin/extensions/pending').then((response) => response.ok ? response.json() : []),
      fetch('/api/admin/versions/pending').then((response) => response.ok ? response.json() : []),
      fetch('/api/admin/drafts/pending').then((response) => response.ok ? response.json() : []),
    ])

    setUsers(Array.isArray(requests[0]) ? requests[0] : [])
    setPendingExtensions(Array.isArray(requests[1]) ? requests[1] : [])
    setPendingVersions(Array.isArray(requests[2]) ? requests[2] : [])
    setPendingDrafts(Array.isArray(requests[3]) ? requests[3] : [])
  }

  const submitNews = async (event) => {
    event.preventDefault()
    try {
      let image = newsForm.image
      if (newsFile) {
        const uploadData = new FormData()
        uploadData.append('image', newsFile)
        if (passwordVerified) uploadData.append('password', window.localStorage.getItem('admin_password'))
        const uploadResponse = await fetch('/api/upload', { method: 'POST', body: uploadData })
        const uploadResult = await uploadResponse.json()
        if (uploadResult.success) {
          image = `${uploadResult.url}?t=${Date.now()}`
        }
      }

      const nextNews = [
        {
          title: newsForm.title,
          description: newsForm.description,
          link: newsForm.link,
          image,
          date: new Date().toLocaleDateString(),
        },
        ...news,
      ]

      await saveNews(nextNews)
      setNewsForm({ title: '', description: '', link: '', image: '' })
      setNewsFile(null)
      setTab('news')
    } catch (error) {
      setUnlockError(error.message)
    }
  }

  const removeNews = async (index) => {
    if (!window.confirm('Delete this news item?')) return
    const nextNews = news.filter((_, newsIndex) => newsIndex !== index)
    await saveNews(nextNews)
  }

  const toggleMaintenance = async () => {
    const adminPassword = passwordVerified ? window.localStorage.getItem('admin_password') : undefined
    const response = await fetch('/api/admin/maintenance/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password: adminPassword }),
    })
    const data = await response.json().catch(() => ({}))
    if (response.ok && data.success) setMaintenanceMode(!!data.isMaintenanceMode)
  }

  const resetStats = async () => {
    if (!window.confirm('Reset all analytics data?')) return
    const adminPassword = passwordVerified ? window.localStorage.getItem('admin_password') : undefined
    await fetch('/api/admin/reset-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword }),
    })
  }

  const deleteCode = async (code) => {
    if (!window.confirm(`Delete code ${code}?`)) return
    const adminPassword = passwordVerified ? window.localStorage.getItem('admin_password') : undefined
    const url = adminPassword ? `/api/codes/${code}?password=${encodeURIComponent(adminPassword)}` : `/api/codes/${code}`
    await fetch(url, { method: 'DELETE' })
    loadCodes()
  }

  const moderateUser = async (id, action) => {
    let reason = ''
    let duration = ''
    if (action === 'warn' || action === 'ban') {
      reason = window.prompt(`Reason for ${action}:`) || ''
      if (!reason) return
    }
    if (action === 'ban') {
      duration = window.prompt('Duration in hours (leave empty for permanent):') || ''
    }

    await fetch(`/api/admin/users/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, duration }),
    })
    loadModerationData()
  }

  const moderateExtension = async (id, action) => {
    const reason = action === 'approve' ? '' : window.prompt(`Reason for ${action}:`) || ''
    if (action !== 'approve' && !reason) return
    await fetch(`/api/admin/extensions/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    loadModerationData()
  }

  const moderateVersion = async (id, action) => {
    await fetch(`/api/admin/versions/${id}/${action}`, { method: 'POST' })
    loadModerationData()
  }

  const moderateDraft = async (id, action) => {
    const reason = action === 'approve' ? '' : window.prompt(`Reason for ${action}:`) || ''
    if (action !== 'approve' && !reason) return
    await fetch(`/api/admin/drafts/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    loadModerationData()
  }

  const signOutPassword = () => {
    window.localStorage.removeItem('admin_password')
    setPasswordVerified(false)
    setSocketStatus('offline')
  }

  if (auth.loading) {
    return <div className="min-h-screen bg-background text-gray-200"><div className="mx-auto max-w-7xl px-6 pb-24 pt-16"><div className="h-[30rem] animate-pulse rounded-[2rem] border border-white/5 bg-surface/50" /></div></div>
  }

  if (!canView) {
    return (
      <div className="min-h-screen bg-background text-gray-200">
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Admin</p>
          <h1 className="mt-4 text-5xl font-black text-white">Unlock the admin panel</h1>
          <p className="mt-4 text-lg text-gray-400">Use the ADMIN_PASSWORD or sign in with an administrator account to access protected tools.</p>
          <form onSubmit={(event) => { event.preventDefault(); verifyPassword() }} className="mt-8 w-full rounded-[2rem] border border-white/5 bg-surface/50 p-8 text-left">
            <label className="block text-sm font-bold text-gray-400">Master password</label>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" className="mt-3 w-full rounded-2xl border border-white/10 bg-background px-5 py-4 text-white outline-none transition focus:border-primary" />
            {unlockError && <p className="mt-3 text-sm font-bold text-red-300">{unlockError}</p>}
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="submit" className="rounded-xl bg-primary px-6 py-3 font-black text-black transition hover:bg-primary-dark">Unlock with password</button>
              {!auth.loggedIn && <a href={auth.loginUrl} className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 font-bold text-white transition hover:border-primary/40 hover:text-primary">Sign in</a>}
            </div>
          </form>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-gray-200">
      <main className="mx-auto max-w-7xl px-6 pb-24 pt-10 lg:px-12">
        <section className="rounded-[2.5rem] border border-white/5 bg-surface/50 p-8 md:p-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Administration</p>
              <h1 className="mt-3 text-4xl font-black text-white">Lux control center</h1>
              <p className="mt-3 max-w-3xl text-gray-400">Manage news, analytics, maintenance mode, codes, and moderation workflows from a single React dashboard.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {passwordVerified && (
                <button onClick={signOutPassword} className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-white transition hover:border-primary/40 hover:text-primary">Forget password</button>
              )}
              {auth.loggedIn && <a href={auth.logoutUrl} className="rounded-xl bg-primary px-5 py-3 font-black text-black transition hover:bg-primary-dark">Logout</a>}
            </div>
          </div>
        </section>

        <div className="mt-6 flex flex-wrap gap-3">
          {[
            { id: 'overview', label: 'Overview', enabled: true },
            { id: 'news', label: 'News', enabled: canAccessTools },
            { id: 'analytics', label: 'Analytics', enabled: canAccessTools },
            { id: 'codes', label: 'Codes', enabled: canAccessTools },
            { id: 'moderation', label: 'Moderation', enabled: isSessionAdmin },
          ].filter((item) => item.enabled).map((item) => (
            <button key={item.id} onClick={() => setTab(item.id)} className={`rounded-xl px-5 py-3 text-sm font-black uppercase tracking-[0.2em] transition ${tab === item.id ? 'bg-primary text-black' : 'border border-white/10 bg-white/5 text-gray-300 hover:text-white'}`}>
              {item.label}
            </button>
          ))}
        </div>

        {unlockError && <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-300">{unlockError}</div>}

        {tab === 'overview' && (
          <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <OverviewCard label="Password Tools" value={passwordVerified ? 'Unlocked' : 'Locked'} />
            <OverviewCard label="Session Role" value={auth.user?.role || 'guest'} />
            <OverviewCard label="Socket Status" value={socketStatus} />
            <OverviewCard label="Maintenance" value={maintenanceMode ? 'On' : 'Off'} />
          </section>
        )}

        {tab === 'news' && canAccessTools && (
          <section className="mt-8 grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
              <h2 className="text-3xl font-black text-white">Published news</h2>
              <div className="mt-6 space-y-4">
                {news.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/10 p-8 text-center text-gray-500">No news posts yet.</div>
                ) : news.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="rounded-[1.5rem] border border-white/5 bg-black/20 p-5">
                    <div className="flex gap-4">
                      <img src={item.image || '/resources/lux_icon.png?v=3'} alt="" className="h-20 w-20 rounded-2xl object-cover" />
                      <div className="flex-1">
                        <h3 className="text-xl font-black text-white">{item.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-gray-400">{item.description}</p>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
                          <span>{item.date}</span>
                          <button onClick={() => removeNews(index)} className="text-red-300 transition hover:text-red-200">Delete</button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
              <h2 className="text-3xl font-black text-white">Create post</h2>
              <form onSubmit={submitNews} className="mt-6 space-y-5">
                <Input label="Title" value={newsForm.title} onChange={(value) => setNewsForm((current) => ({ ...current, title: value }))} />
                <Textarea label="Description" value={newsForm.description} onChange={(value) => setNewsForm((current) => ({ ...current, description: value }))} />
                <Input label="Link" value={newsForm.link} onChange={(value) => setNewsForm((current) => ({ ...current, link: value }))} />
                <Input label="Image URL" value={newsForm.image} onChange={(value) => setNewsForm((current) => ({ ...current, image: value }))} />
                <label className="block">
                  <span className="mb-2 block text-sm font-bold text-gray-400">Upload image</span>
                  <input type="file" accept="image/*" onChange={(event) => setNewsFile(event.target.files?.[0] || null)} className="w-full rounded-2xl border border-white/10 bg-background px-5 py-4 text-white file:mr-4 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:font-bold file:text-black" />
                </label>
                <button type="submit" className="rounded-xl bg-primary px-6 py-3 font-black text-black transition hover:bg-primary-dark">Publish news</button>
              </form>
            </div>
          </section>
        )}

        {tab === 'analytics' && canAccessTools && (
          <section className="mt-8 space-y-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <OverviewCard label="Active Users" value={liveStats.activeUsers || 0} />
              <OverviewCard label="Playing Users" value={liveStats.playingUsers || 0} />
              <OverviewCard label="Unique Machines" value={statsData.uniqueMachineCount || 0} />
              <OverviewCard label="Daily Launches" value={statsData.launchesPerDay?.[new Date().toISOString().split('T')[0]] || 0} />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Live activity"><Line data={activityChart} options={baseChartOptions} /></ChartCard>
              <ChartCard title="Launcher versions"><Doughnut data={versionsChart} options={{ plugins: { legend: { labels: { color: '#d1d5db' } } } }} /></ChartCard>
              <ChartCard title="Top downloads"><Bar data={downloadsChart} options={baseChartOptions} /></ChartCard>
              <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-6 md:p-8">
                <h2 className="text-2xl font-black text-white">Maintenance & resets</h2>
                <p className="mt-3 text-gray-400">Use these controls carefully. They affect live users and stored analytics.</p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <button onClick={toggleMaintenance} className={`rounded-xl px-5 py-3 font-black transition ${maintenanceMode ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-primary text-black hover:bg-primary-dark'}`}>
                    {maintenanceMode ? 'Disable maintenance' : 'Enable maintenance'}
                  </button>
                  <button onClick={resetStats} className="rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-3 font-bold text-red-300 transition hover:bg-red-500/20">Reset analytics</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === 'codes' && canAccessTools && (
          <section className="mt-8 rounded-[2rem] border border-white/5 bg-surface/50 p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-black text-white">Modpack codes</h2>
                <p className="mt-2 text-gray-400">Inspect active share codes and delete anything that should be retired.</p>
              </div>
              <button onClick={loadCodes} className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 font-bold text-white transition hover:border-primary/40 hover:text-primary">Refresh</button>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-white/5 text-left text-sm text-gray-300">
                <thead>
                  <tr className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3">Uses</th>
                    <th className="px-4 py-3">Expires</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {codes.length === 0 ? (
                    <tr><td colSpan="6" className="px-4 py-8 text-center text-gray-500">No active codes.</td></tr>
                  ) : codes.map((code) => (
                    <tr key={code.code}>
                      <td className="px-4 py-4 font-mono font-bold text-primary">{code.code}</td>
                      <td className="px-4 py-4">{code.name}</td>
                      <td className="px-4 py-4">{code.version || '?'} ({code.loader || '?'})</td>
                      <td className="px-4 py-4">{code.uses || 0}</td>
                      <td className="px-4 py-4">{code.expires ? new Date(code.expires).toLocaleString() : '—'}</td>
                      <td className="px-4 py-4 text-right"><button onClick={() => deleteCode(code.code)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 font-bold text-red-300 transition hover:bg-red-500/20">Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === 'moderation' && isSessionAdmin && (
          <section className="mt-8 space-y-8">
            <ModerationCard title="Pending extensions" description="Approve, reject, or request changes for new marketplace submissions.">
              {pendingExtensions.length === 0 ? <EmptyRow message="No pending extensions." /> : pendingExtensions.map((item) => (
                <ModerationItem key={item.id} title={item.name} subtitle={`${item.developer || 'Unknown'} · ${item.identifier}`} image={fixPath(item.banner_path)} actions={[
                  { label: 'Approve', onClick: () => moderateExtension(item.id, 'approve'), tone: 'primary' },
                  { label: 'Action Required', onClick: () => moderateExtension(item.id, 'action_required') },
                  { label: 'Reject', onClick: () => moderateExtension(item.id, 'reject'), tone: 'danger' },
                ]} />
              ))}
            </ModerationCard>

            <ModerationCard title="Pending versions" description="Review additional version uploads for already approved projects.">
              {pendingVersions.length === 0 ? <EmptyRow message="No pending versions." /> : pendingVersions.map((item) => (
                <ModerationItem key={item.id} title={`${item.extension_name} ${item.version}`} subtitle={`${item.developer || 'Unknown'} · ${item.changelog || 'No changelog provided'}`} actions={[
                  { label: 'Approve', onClick: () => moderateVersion(item.id, 'approve'), tone: 'primary' },
                  { label: 'Reject', onClick: () => moderateVersion(item.id, 'reject'), tone: 'danger' },
                ]} />
              ))}
            </ModerationCard>

            <ModerationCard title="Pending metadata drafts" description="Approve or reject pending metadata changes submitted by creators.">
              {pendingDrafts.length === 0 ? <EmptyRow message="No pending drafts." /> : pendingDrafts.map((item) => (
                <ModerationItem key={item.id} title={item.original_name} subtitle={`${item.developer || 'Unknown'} · ${item.summary || item.description || 'Draft update pending'}`} actions={[
                  { label: 'Approve', onClick: () => moderateDraft(item.id, 'approve'), tone: 'primary' },
                  { label: 'Reject', onClick: () => moderateDraft(item.id, 'reject'), tone: 'danger' },
                ]} />
              ))}
            </ModerationCard>

            <ModerationCard title="Users" description="Warn, ban, or restore accounts from the current user database.">
              {users.length === 0 ? <EmptyRow message="No users loaded." /> : users.map((user) => (
                <ModerationItem key={user.id} title={user.username} subtitle={`${user.email || 'No email'} · ${user.role}`} image={fixPath(user.avatar)} actions={[
                  { label: 'Warn', onClick: () => moderateUser(user.id, 'warn') },
                  user.banned
                    ? { label: 'Unban', onClick: () => moderateUser(user.id, 'unban'), tone: 'primary' }
                    : { label: 'Ban', onClick: () => moderateUser(user.id, 'ban'), tone: 'danger' },
                ]} />
              ))}
            </ModerationCard>
          </section>
        )}
      </main>
    </div>
  )
}

function OverviewCard({ label, value }) {
  return (
    <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-6">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">{label}</p>
      <p className="mt-4 text-4xl font-black text-white">{value}</p>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-6 md:p-8">
      <h2 className="text-2xl font-black text-white">{title}</h2>
      <div className="mt-6 h-80">{children}</div>
    </div>
  )
}

function Input({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-gray-400">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-background px-5 py-4 text-white outline-none transition focus:border-primary" />
    </label>
  )
}

function Textarea({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-gray-400">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows="5" className="w-full rounded-2xl border border-white/10 bg-background px-5 py-4 text-white outline-none transition focus:border-primary" />
    </label>
  )
}

function ModerationCard({ title, description, children }) {
  return (
    <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
      <h2 className="text-3xl font-black text-white">{title}</h2>
      <p className="mt-2 text-gray-400">{description}</p>
      <div className="mt-6 space-y-4">{children}</div>
    </div>
  )
}

function ModerationItem({ title, subtitle, image, actions }) {
  return (
    <div className="rounded-[1.5rem] border border-white/5 bg-black/20 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          {image && <img src={image} alt="" className="h-16 w-16 rounded-2xl object-cover" />}
          <div>
            <h3 className="text-xl font-black text-white">{title}</h3>
            <p className="mt-2 text-sm leading-7 text-gray-400">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className={`rounded-xl px-4 py-3 text-sm font-black transition ${action.tone === 'danger' ? 'border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20' : action.tone === 'primary' ? 'bg-primary text-black hover:bg-primary-dark' : 'border border-white/10 bg-white/5 text-white hover:border-primary/40 hover:text-primary'}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmptyRow({ message }) {
  return <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-black/10 p-8 text-center text-gray-500">{message}</div>
}
