import { useState } from 'react'
import PageShell from '../components/PageShell'
import useAuth from '../hooks/useAuth'

const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/

const PLATFORM_LABELS = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux'
}

export default function LinkDevice() {
  const auth = useAuth()
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(null)
  const [state, setState] = useState('idle')
  const [error, setError] = useState(null)

  const normalized = code.trim().toUpperCase()
  const valid = CODE_RE.test(normalized)

  const lookup = async (event) => {
    event.preventDefault()
    if (!valid) return

    setState('looking')
    setError(null)
    try {
      const res = await fetch(`/api/auth/device/pair/lookup?code=${normalized}`, { credentials: 'include' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'That code is not valid.')
        setState('idle')
        return
      }
      setPending(data)
      setState('confirm')
    } catch {
      setError('Could not reach the server.')
      setState('idle')
    }
  }

  const decide = async (approve) => {
    setState('working')
    setError(null)
    try {
      const res = await fetch(`/api/auth/device/pair/${approve ? 'approve' : 'deny'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ code: normalized })
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || 'That did not work.')
        setState('confirm')
        return
      }
      setState(approve ? 'approved' : 'denied')
    } catch {
      setError('Could not reach the server.')
      setState('confirm')
    }
  }

  if (auth.loading) {
    return (
      <PageShell>
        <main className="mx-auto max-w-lg px-6 pb-24 pt-32 text-center text-gray-400">Loading...</main>
      </PageShell>
    )
  }

  if (!auth.user) {
    return (
      <PageShell>
        <main className="mx-auto max-w-lg px-6 pb-24 pt-32 text-center">
          <h1 className="text-4xl font-black text-white">Connect Lux Client</h1>
          <p className="mt-4 text-gray-400">Sign in first, then come back to enter the code from your launcher.</p>
          <a
            href={`/auth/google?returnTo=${encodeURIComponent('/link')}`}
            className="mt-8 inline-block rounded-xl bg-primary px-6 py-3 font-bold text-black transition hover:opacity-90"
          >
            Sign in with Google
          </a>
        </main>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-lg px-6 pb-24 pt-32">
        <header className="mb-10 text-center">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Lux Cloud</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white">Connect a device</h1>
          <p className="mt-3 text-gray-400">
            Signed in as <span className="font-semibold text-white">{auth.user.username}</span>
          </p>
        </header>

        <div className="rounded-[2rem] border border-white/5 bg-surface/50 p-8">
          {state === 'approved' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-3xl">✓</div>
              <h2 className="text-xl font-bold text-white">Device connected</h2>
              <p className="mt-2 text-sm text-gray-400">
                You can close this page. The launcher continues on its own.
              </p>
            </div>
          )}

          {state === 'denied' && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 text-3xl">✕</div>
              <h2 className="text-xl font-bold text-white">Request declined</h2>
              <p className="mt-2 text-sm text-gray-400">Nothing was connected to your account.</p>
            </div>
          )}

          {state === 'confirm' && pending && (
            <div>
              <h2 className="text-lg font-bold text-white">Connect this device?</h2>

              <dl className="mt-5 space-y-2 rounded-xl bg-black/30 p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Device</dt>
                  <dd className="font-medium text-white">{pending.deviceName || 'Unnamed device'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">System</dt>
                  <dd className="text-gray-300">{PLATFORM_LABELS[pending.platform] || pending.platform || 'unknown'}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Code</dt>
                  <dd className="font-mono tracking-widest text-gray-300">{normalized}</dd>
                </div>
              </dl>

              <p className="mt-5 rounded-xl bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200/85">
                <strong className="block font-semibold text-amber-100">Only continue if you started this yourself.</strong>
                If someone sent you this code, they are trying to connect their own PC to your account and would get
                access to your cloud instances. Nobody from Lux will ever ask you for a code.
              </p>

              {error && <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => decide(true)}
                  disabled={state === 'working'}
                  className="flex-1 rounded-xl bg-primary px-4 py-3 font-bold text-black transition hover:opacity-90 disabled:opacity-50"
                >
                  Connect
                </button>
                <button
                  type="button"
                  onClick={() => decide(false)}
                  disabled={state === 'working'}
                  className="rounded-xl border border-white/10 px-4 py-3 font-medium text-gray-400 transition hover:border-white/25 hover:text-white disabled:opacity-50"
                >
                  It wasn't me
                </button>
              </div>
            </div>
          )}

          {(state === 'idle' || state === 'looking') && (
            <form onSubmit={lookup}>
              <label htmlFor="pair-code" className="block text-sm font-medium text-gray-300">
                Enter the six characters shown in Lux Client
              </label>

              <input
                id="pair-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABC123"
                autoComplete="off"
                autoFocus
                className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-4 text-center font-mono text-3xl tracking-[0.4em] text-white outline-none transition focus:border-primary"
              />

              {error && <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

              <button
                type="submit"
                disabled={!valid || state === 'looking'}
                className="mt-5 w-full rounded-xl bg-primary px-4 py-3 font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {state === 'looking' ? 'Checking...' : 'Continue'}
              </button>

              <p className="mt-4 text-center text-xs text-gray-500">
                The code is valid for 10 minutes. Letters that look alike (O, I, L, 0, 1) are never used.
              </p>
            </form>
          )}
        </div>
      </main>
    </PageShell>
  )
}
