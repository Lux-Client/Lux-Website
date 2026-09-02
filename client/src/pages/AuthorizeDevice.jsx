import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PageShell from '../components/PageShell'

const PLATFORM_LABELS = {
  win32: 'Windows',
  darwin: 'macOS',
  linux: 'Linux',
}

const PERMISSIONS = [
  'Read your Lux username and avatar',
  'Store your instance list, mod metadata and playtime in your Lux Cloud',
  'Download your cloud instances onto this device',
]

export default function AuthorizeDevice() {
  const [params] = useSearchParams()
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [manualCode, setManualCode] = useState(null)

  const codeChallenge = params.get('code_challenge') || ''
  const state = params.get('state') || ''
  const deviceName = params.get('device_name') || 'Lux Client'
  const platform = params.get('platform') || ''

  const platformLabel = useMemo(() => PLATFORM_LABELS[platform] || null, [platform])
  const requestLooksValid = codeChallenge.length === 43 && state.length >= 8

  useEffect(() => {
    let cancelled = false

    fetch('/api/user', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (!data.loggedIn) {
          window.location.href = `/auth/google?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`
          return
        }
        setUser(data.user)
        setStatus('idle')
      })
      .catch(() => {
        if (cancelled) return
        setError('Could not load your account. Please reload the page.')
        setStatus('idle')
      })

    return () => {
      cancelled = true
    }
  }, [])

  const send = async (path, doneStatus) => {
    setStatus('working')
    setError(null)
    try {
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code_challenge: codeChallenge,
          state,
          device_name: deviceName,
          platform,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || 'Request failed')

      setStatus(doneStatus)
      if (data.manualCode) setManualCode(data.manualCode)
      window.location.href = data.redirectUrl
    } catch (err) {
      setError(err.message || 'Something went wrong.')
      setStatus('idle')
    }
  }

  return (
    <PageShell showFooter={false}>
      <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-32">
        <div className="w-full rounded-[2rem] border border-white/5 bg-surface/50 p-8 md:p-10">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-primary">Lux Cloud</p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-white">Authorize this device</h1>

          {!requestLooksValid ? (
            <p className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
              This authorization link is incomplete or expired. Start the sign-in again from the Lux Client.
            </p>
          ) : (
            <>
              <p className="mt-4 text-gray-400">
                The Lux Client on <span className="font-semibold text-white">{deviceName}</span>
                {platformLabel ? ` (${platformLabel})` : ''} wants to connect to your Lux account.
              </p>

              {user && (
                <div className="mt-8 flex items-center gap-4 rounded-2xl border border-white/5 bg-background/40 px-4 py-3">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="h-10 w-10 rounded-full" />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-primary/20" />
                  )}
                  <div>
                    <p className="font-semibold text-white">{user.username}</p>
                    <p className="text-xs text-gray-500">Signed in on lux.pluginhub.de</p>
                  </div>
                </div>
              )}

              <ul className="mt-8 space-y-2 text-sm text-gray-400">
                {PERMISSIONS.map((permission) => (
                  <li key={permission} className="flex gap-3">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{permission}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-6 text-xs text-gray-500">
                You can sign this device out at any time from your Lux Client settings or your dashboard.
                Only authorize a device you are sitting in front of right now.
              </p>

              {error && (
                <p className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                  {error}
                </p>
              )}

              {status === 'approved' && (
                <>
                  <p className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
                    Device authorized. You can close this tab and return to the Lux Client.
                  </p>

                  {manualCode && (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 px-5 py-5 text-center">
                      <p className="text-sm text-gray-400">
                        Did Lux not react? Enter this code in the launcher instead:
                      </p>
                      <p className="mt-3 font-mono text-4xl font-black tracking-[0.35em] text-white">
                        {manualCode}
                      </p>
                      <p className="mt-3 text-xs text-gray-500">
                        Valid for 10 minutes and only usable by the launcher that started this sign-in.
                      </p>
                    </div>
                  )}
                </>
              )}

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={status !== 'idle'}
                  onClick={() => send('/auth/device/approve', 'approved')}
                  className="rounded-full bg-primary px-6 py-3 font-bold text-background transition hover:brightness-110 disabled:opacity-50"
                >
                  {status === 'working' ? 'Working...' : 'Authorize device'}
                </button>
                <button
                  type="button"
                  disabled={status !== 'idle'}
                  onClick={() => send('/auth/device/deny', 'denied')}
                  className="rounded-full border border-white/10 px-6 py-3 font-bold text-gray-300 transition hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </PageShell>
  )
}
