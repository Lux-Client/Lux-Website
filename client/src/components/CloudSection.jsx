import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cloud, HardDrive, Monitor, Clock, AlertTriangle, Trash2, RotateCcw, Loader2 } from 'lucide-react'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatDuration(ms) {
  if (!ms || ms < 60000) return '0m'
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

function daysUntil(timestamp) {
  if (!timestamp) return null
  return Math.ceil((timestamp - Date.now()) / (24 * 60 * 60 * 1000))
}

const PLATFORM_LABELS = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }

export default function CloudSection() {
  const [available, setAvailable] = useState(null)
  const [instances, setInstances] = useState([])
  const [devices, setDevices] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const [confirmPurge, setConfirmPurge] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const statusRes = await fetch('/api/cloud/status')
      const status = statusRes.ok ? await statusRes.json() : { enabled: false }
      setAvailable(Boolean(status.enabled))
      if (!status.enabled) return

      const [instRes, devRes] = await Promise.all([
        fetch('/api/cloud/instances?status=all', { credentials: 'include' }),
        fetch('/api/cloud/devices', { credentials: 'include' })
      ])

      if (instRes.status === 403) {
        const body = await instRes.json().catch(() => ({}))
        setError(body.message || 'Lux Cloud is disabled for your account.')
        return
      }
      if (instRes.ok) setInstances((await instRes.json()).instances || [])
      if (devRes.ok) setDevices((await devRes.json()).devices || [])
    } catch {
      setError('Could not load your cloud data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const active = useMemo(() => instances.filter((i) => i.status === 'active'), [instances])
  const trashed = useMemo(() => instances.filter((i) => i.status === 'trashed'), [instances])

  const totals = useMemo(() => ({
    bytes: active.reduce((sum, i) => sum + (i.logicalBytes || 0), 0),
    playtime: active.reduce((sum, i) => sum + (i.playtimeTotalMs || 0), 0),
    expiring: active.filter((i) => {
      const days = daysUntil(i.expiresAt)
      return !i.everPulledElsewhere && days !== null && days <= 7
    }).length
  }), [active])

  const act = async (instance, action) => {
    setBusy(instance.instanceUuid)
    try {
      const url = `/api/cloud/instances/${instance.instanceUuid}${action === 'restore' ? '/restore' : ''}`
      await fetch(url, { method: action === 'restore' ? 'POST' : 'DELETE', credentials: 'include' })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const purge = async () => {
    setBusy('purge')
    try {
      const res = await fetch('/api/cloud/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirm: 'delete-my-cloud-data' })
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.message || 'Could not delete your cloud data.')
      }
      setConfirmPurge(false)
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (available === false) return null

  return (
    <div className="rounded-2xl border border-white/6 bg-[#0f0f0f]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/12 text-sky-400">
            <Cloud className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-white">Lux Cloud</h2>
            <p className="text-xs text-white/30">Your instances across your PCs</p>
          </div>
        </div>
        {active.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmPurge(true)}
            className="rounded-xl border border-white/6 px-3 py-1.5 text-xs font-semibold text-white/40 transition hover:border-red-500/30 hover:text-red-400"
          >
            Delete all cloud data
          </button>
        )}
      </div>

      <div className="p-5">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-white/30">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        )}

        {!loading && error && (
          <p className="rounded-xl border border-red-500/15 bg-red-500/8 px-4 py-3 text-sm text-red-400">{error}</p>
        )}

        {!loading && !error && (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/6 bg-black/30 p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/30">
                  <HardDrive className="h-3 w-3" /> Storage
                </p>
                <p className="mt-1 text-xl font-black text-white">{formatBytes(totals.bytes)}</p>
              </div>
              <div className="rounded-xl border border-white/6 bg-black/30 p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/30">
                  <Cloud className="h-3 w-3" /> Instances
                </p>
                <p className="mt-1 text-xl font-black text-white">{active.length}</p>
              </div>
              <div className="rounded-xl border border-white/6 bg-black/30 p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/30">
                  <Clock className="h-3 w-3" /> Playtime
                </p>
                <p className="mt-1 text-xl font-black text-white">{formatDuration(totals.playtime)}</p>
              </div>
            </div>

            {totals.expiring > 0 && (
              <p className="mb-5 flex items-start gap-2 rounded-xl border border-amber-500/15 bg-amber-500/8 px-4 py-3 text-xs leading-relaxed text-amber-300/90">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong className="font-semibold">
                    {totals.expiring} instance{totals.expiring !== 1 ? 's' : ''} will be removed from the cloud soon.
                  </strong>{' '}
                  Lux Cloud moves instances between PCs — an instance that no second PC ever downloads is removed
                  after 15 days. Open it on another PC to keep it. Your local files are never touched.
                </span>
              </p>
            )}

            {active.length === 0 && trashed.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-sm text-white/40">No instance is in the cloud yet.</p>
                <p className="mt-1 text-xs text-white/25">
                  Sign in inside Lux Client, open an instance and turn on Cloud Sync.
                </p>
              </div>
            )}

            {active.length > 0 && (
              <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/6">
                {active.map((instance) => {
                  const days = daysUntil(instance.expiresAt)
                  const atRisk = !instance.everPulledElsewhere && days !== null && days <= 7
                  return (
                    <div key={instance.instanceUuid} className="flex items-center gap-3 bg-black/20 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{instance.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-white/30">
                          <span>{[instance.mcVersion, instance.loader].filter(Boolean).join(' · ') || '—'}</span>
                          <span className="text-white/15">·</span>
                          <span>v{instance.revision}</span>
                          <span className="text-white/15">·</span>
                          <span>{formatBytes(instance.logicalBytes)}</span>
                          {instance.playtimeTotalMs > 0 && (
                            <>
                              <span className="text-white/15">·</span>
                              <span>{formatDuration(instance.playtimeTotalMs)}</span>
                            </>
                          )}
                        </p>
                        {atRisk && (
                          <p className="mt-1 text-[11px] text-amber-400/80">
                            Removed in {Math.max(days, 0)} day{days !== 1 ? 's' : ''} unless another PC syncs it
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => act(instance, 'delete')}
                        title="Move to trash"
                        className="shrink-0 rounded-lg p-2 text-white/25 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {trashed.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/25">
                  Trash — recoverable for 30 days
                </p>
                <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/6">
                  {trashed.map((instance) => (
                    <div key={instance.instanceUuid} className="flex items-center gap-3 bg-black/20 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-white/50">{instance.name}</p>
                        <p className="text-xs text-white/25">
                          {formatBytes(instance.logicalBytes)}
                          {instance.purgesAt && ` · gone on ${new Date(instance.purgesAt).toLocaleDateString()}`}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => act(instance, 'restore')}
                        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/6 px-2.5 py-1 text-xs text-white/50 transition hover:border-white/20 hover:text-white disabled:opacity-40"
                      >
                        <RotateCcw className="h-3 w-3" /> Restore
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {devices.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/25">
                  <Monitor className="h-3 w-3" /> Connected PCs
                </p>
                <div className="flex flex-wrap gap-2">
                  {devices.map((device) => (
                    <span
                      key={device.deviceUuid}
                      className="rounded-lg border border-white/6 bg-black/30 px-3 py-1.5 text-xs text-white/50"
                    >
                      {device.name || 'Unnamed'}
                      <span className="ml-1.5 text-white/25">
                        {PLATFORM_LABELS[device.platform] || device.platform}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {confirmPurge && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#141414] p-6">
            <h3 className="text-lg font-bold text-white">Delete all cloud data?</h3>
            <p className="mt-2 text-sm text-white/50">
              All {active.length + trashed.length} cloud instances and their files are removed permanently.
              Your account and your connected PCs stay.
            </p>
            <p className="mt-3 rounded-lg bg-green-500/8 p-3 text-xs text-green-400/90">
              The instances on your own PCs are not touched. Only the copies in the cloud go away.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmPurge(false)}
                className="rounded-xl px-3 py-2 text-sm text-white/40 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy === 'purge'}
                onClick={purge}
                className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-400 disabled:opacity-50"
              >
                {busy === 'purge' ? 'Deleting...' : 'Delete everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
