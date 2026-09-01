import { useCallback, useEffect, useState } from 'react'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function Stat({ label, value, hint, tone = 'default' }) {
  const tones = {
    default: 'border-white/5 bg-surface/50',
    warn: 'border-amber-400/20 bg-amber-500/[0.06]',
    good: 'border-green-400/20 bg-green-500/[0.06]'
  }
  return (
    <div className={`rounded-2xl border p-5 ${tones[tone]}`}>
      <p className="text-xs uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export default function CloudPanel() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [jobs, setJobs] = useState(null)
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState(null)
  const [banTarget, setBanTarget] = useState(null)
  const [banReason, setBanReason] = useState('')

  const load = useCallback(async () => {
    try {
      const [statsRes, usersRes, jobsRes] = await Promise.all([
        fetch('/api/admin/cloud/stats', { credentials: 'include' }),
        fetch('/api/admin/cloud/users?limit=50', { credentials: 'include' }),
        fetch('/api/admin/cloud/expiry', { credentials: 'include' })
      ])
      if (statsRes.ok) setStats(await statsRes.json())
      if (usersRes.ok) setUsers((await usersRes.json()).users || [])
      if (jobsRes.ok) setJobs(await jobsRes.json())
    } catch {
      setMessage('Could not load cloud data.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const runJob = async (endpoint, mode, dryRun) => {
    setBusy(`${mode}-${dryRun}`)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/cloud/${endpoint}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode, dryRun })
      })
      const data = await res.json()
      setMessage(res.ok
        ? `${mode}${dryRun ? ' (dry run)' : ''}: ${JSON.stringify(data.result)}`
        : (data.message || 'Job failed'))
      await load()
    } finally {
      setBusy(null)
    }
  }

  const setQuota = async (user) => {
    const gb = window.prompt(`Storage for ${user.username} in GB:`, String(Math.round(user.quotaBytes / 1024 ** 3)))
    if (gb === null) return
    const value = Number(gb)
    if (!Number.isFinite(value) || value < 0) return

    await fetch(`/api/admin/cloud/users/${user.id}/quota`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ quotaBytes: Math.round(value * 1024 ** 3) })
    })
    await load()
  }

  const toggleBan = async (user, banned) => {
    setBusy(`ban-${user.id}`)
    try {
      const res = await fetch(`/api/admin/cloud/users/${user.id}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ banned, reason: banned ? (banReason || null) : null })
      })
      const data = await res.json()
      if (!res.ok) setMessage(data.message || 'Could not change the ban')
      setBanTarget(null)
      setBanReason('')
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Stored"
          value={stats ? formatBytes(stats.blobs.physicalBytes) : '—'}
          hint={stats ? `${stats.blobs.count} blobs` : null}
        />
        <Stat
          label="Billed to users"
          value={stats ? formatBytes(stats.users.billedBytes) : '—'}
          hint={stats ? `${stats.users.withData} accounts` : null}
        />
        <Stat
          label="Dedup factor"
          value={stats && stats.dedupFactor ? `${stats.dedupFactor}x` : '—'}
          hint="billed / actually stored"
          tone={stats && stats.dedupFactor > 1.5 ? 'good' : 'default'}
        />
        <Stat
          label="GC queue"
          value={stats ? stats.gcQueue : '—'}
          hint={stats ? `${stats.blobs.orphanCount} unreferenced` : null}
          tone={stats && stats.gcQueue > 1000 ? 'warn' : 'default'}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Active instances" value={stats ? stats.instances.active : '—'} />
        <Stat label="In the trash" value={stats ? stats.instances.trashed : '—'} />
        <Stat
          label="Never pulled elsewhere"
          value={stats ? stats.instances.neverPulledElsewhere : '—'}
          hint="these run into the 15 day rule"
          tone={stats && stats.instances.neverPulledElsewhere > 0 ? 'warn' : 'default'}
        />
      </div>

      <div className="rounded-2xl border border-white/5 bg-surface/50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-white">Jobs</h3>
            <p className="text-sm text-gray-500">
              {jobs && jobs.expiry
                ? `Expiry after ${jobs.expiry.policy.expiryDays} days · dry run ${jobs.expiry.dryRun ? 'ON' : 'OFF'}`
                : 'Loading...'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ['gc', 'gc', 'Garbage collection'],
              ['gc', 'reconcile', 'Reconcile refcounts'],
              ['expiry', 'retention', 'Retention'],
              ['expiry', 'expiry', '15 day rule']
            ].map(([endpoint, mode, label]) => (
              <div key={mode} className="flex overflow-hidden rounded-lg border border-white/10">
                <span className="bg-black/30 px-3 py-1.5 text-xs text-gray-400">{label}</span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => runJob(endpoint, mode, true)}
                  className="border-l border-white/10 px-3 py-1.5 text-xs text-gray-300 transition hover:bg-white/5 disabled:opacity-40"
                >
                  dry
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => runJob(endpoint, mode, false)}
                  className="border-l border-white/10 px-3 py-1.5 text-xs text-amber-300 transition hover:bg-amber-500/10 disabled:opacity-40"
                >
                  run
                </button>
              </div>
            ))}
          </div>
        </div>

        {jobs && jobs.expiry && !jobs.expiry.dryRun && (
          <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-xs text-red-200">
            The expiry job is live. It permanently removes cloud instances that no second PC ever pulled.
          </p>
        )}

        {message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] text-gray-400">{message}</pre>
        )}
      </div>

      <div className="rounded-2xl border border-white/5 bg-surface/50 p-6">
        <h3 className="mb-4 text-lg font-bold text-white">Accounts by storage</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="pb-2">User</th>
                <th className="pb-2">Used</th>
                <th className="pb-2">Instances</th>
                <th className="pb-2">Last activity</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map((user) => {
                const percent = user.quotaBytes > 0
                  ? Math.round((user.usedBytes / user.quotaBytes) * 100)
                  : 0
                return (
                  <tr key={user.id} className={user.cloudBanned ? 'bg-red-500/[0.04]' : ''}>
                    <td className="py-2.5">
                      <span className="font-medium text-white">{user.username}</span>
                      {user.cloudBanned && (
                        <span
                          title={user.cloudBanReason || 'Cloud disabled'}
                          className="ml-2 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-300"
                        >
                          CLOUD BANNED
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-gray-300">
                      {formatBytes(user.usedBytes)}
                      <span className={percent > 90 ? 'ml-1 text-red-400' : 'ml-1 text-gray-600'}>
                        ({percent}%)
                      </span>
                    </td>
                    <td className="py-2.5 text-gray-400">{user.instanceCount} / {user.maxInstances}</td>
                    <td className="py-2.5 text-xs text-gray-500">
                      {user.lastActivity ? new Date(user.lastActivity).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setQuota(user)}
                        className="rounded px-2 py-1 text-xs text-gray-400 transition hover:bg-white/5 hover:text-white"
                      >
                        Quota
                      </button>
                      {user.cloudBanned ? (
                        <button
                          type="button"
                          disabled={busy === `ban-${user.id}`}
                          onClick={() => toggleBan(user, false)}
                          className="rounded px-2 py-1 text-xs text-green-400 transition hover:bg-green-500/10 disabled:opacity-40"
                        >
                          Unban
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setBanTarget(user); setBanReason('') }}
                          className="rounded px-2 py-1 text-xs text-red-400 transition hover:bg-red-500/10"
                        >
                          Ban
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {users.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-gray-500">No accounts with cloud data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {banTarget && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#161616] p-6">
            <h3 className="text-lg font-bold text-white">Disable Lux Cloud for {banTarget.username}?</h3>
            <p className="mt-2 text-sm text-gray-400">
              All devices are signed out immediately and the account can no longer use cloud sync.
              Existing cloud data is kept, and local instances on their PCs are not touched.
            </p>

            <input
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="Reason (shown to the user)"
              className="mt-4 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-primary"
            />

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBanTarget(null)}
                className="rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy === `ban-${banTarget.id}`}
                onClick={() => toggleBan(banTarget, true)}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-400 disabled:opacity-50"
              >
                Disable cloud
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
