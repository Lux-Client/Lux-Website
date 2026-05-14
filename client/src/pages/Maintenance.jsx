import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Maintenance() {
  const navigate = useNavigate()
  const [panelOpen, setPanelOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const checkStatus = () => {
      fetch('/api/admin/maintenance/status', { credentials: 'same-origin', cache: 'no-store' })
        .then((response) => response.ok ? response.json() : null)
        .then((data) => {
          if (data && data.isMaintenanceMode === false) {
            navigate('/')
          }
        })
        .catch(() => {})
    }

    checkStatus()
    const interval = window.setInterval(checkStatus, 3000)
    const onVisibilityChange = () => {
      if (!document.hidden) checkStatus()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [navigate])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/admin/maintenance/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error('Invalid password')
      }

      navigate('/admin')
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 text-center text-gray-200">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute right-1/4 top-1/3 h-96 w-96 rounded-full bg-yellow-500/10 blur-[100px]" />
        <div className="absolute bottom-[-8rem] left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-3xl">
        <div className="relative mx-auto mb-8 inline-block">
          <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl" />
          <img src="/resources/lux_icon.png?v=3" alt="Lux Client" className="relative mx-auto h-28 w-28 animate-pulse object-contain" />
        </div>

        <h1 className="text-5xl font-black tracking-tight text-white md:text-7xl">
          <span className="text-gradient">System</span> Maintenance
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-xl text-gray-400 md:text-2xl">
          We are performing scheduled upgrades to improve the Lux Client experience. Please check back shortly.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <a href="https://pluginhub.de/discord.html" target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-white/10 bg-white/5 px-8 py-4 font-bold text-white transition hover:bg-white/10">
            Join Discord
          </a>
          <button onClick={() => navigate('/')} className="rounded-2xl bg-primary px-8 py-4 font-black text-black transition hover:bg-primary-dark">
            Try Access Again
          </button>
        </div>
      </div>

      <div className="fixed bottom-4 right-4 z-20">
        <button onClick={() => setPanelOpen((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-full text-white/20 transition hover:text-white/40" title="Admin Auth">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </button>

        {panelOpen && (
          <form onSubmit={handleSubmit} className="absolute bottom-12 right-0 w-72 rounded-[1.5rem] border border-white/10 bg-surface/95 p-4 text-left shadow-2xl backdrop-blur-xl">
            <h2 className="mb-3 text-xs font-black uppercase tracking-[0.25em] text-primary">Admin Bypass</h2>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Master password"
              className="w-full rounded-xl border border-white/10 bg-background px-4 py-3 text-sm text-white outline-none transition focus:border-primary"
            />
            {error && <p className="mt-2 text-xs font-bold text-red-400">{error}</p>}
            <button type="submit" disabled={submitting} className="mt-3 w-full rounded-xl bg-primary py-3 text-sm font-black text-black transition hover:bg-primary-dark disabled:opacity-60">
              {submitting ? 'Authorizing...' : 'Authenticate'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
