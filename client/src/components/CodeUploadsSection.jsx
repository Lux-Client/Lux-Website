import { useCallback, useEffect, useState } from 'react'
import { Package, Trash2, FileArchive, Loader2 } from 'lucide-react'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

// Modpack codes created in Lux Client while signed in. Files that neither Modrinth nor
// CurseForge know were uploaded to the account's cloud storage for the code. They share
// the storage with cloud instances and are deleted together with the code.
export default function CodeUploadsSection() {
  const [codes, setCodes] = useState([])
  const [quota, setQuota] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/modpack/my-uploads', { credentials: 'include' })
      if (!res.ok) {
        setCodes([])
        return
      }
      const body = await res.json()
      setCodes(body.codes || [])
      setQuota(body.quota || null)
      setError('')
    } catch {
      setError('Could not load your modpack codes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const remove = async (code) => {
    setBusy(code)
    try {
      const res = await fetch(`/api/modpack/my-codes/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.message || 'Could not delete the code.')
        return
      }
      setConfirmDelete(null)
      await load()
    } finally {
      setBusy(null)
    }
  }

  if (!loading && codes.length === 0 && !error) return null

  const percent = quota && quota.quotaBytes > 0
    ? Math.min(100, Math.round((quota.usedBytes / quota.quotaBytes) * 100))
    : 0

  return (
    <div className="rounded-2xl border border-white/6 bg-[#0f0f0f]">
      <div className="flex items-center gap-2.5 border-b border-white/5 px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/12 text-amber-400">
          <Package className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-white">Modpack codes</h2>
          <p className="text-xs text-white/30">Codes you created in Lux Client and the files they carry</p>
        </div>
      </div>

      <div className="p-5">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-white/30">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        )}

        {!loading && error && (
          <p className="mb-4 rounded-xl border border-red-500/15 bg-red-500/8 px-4 py-3 text-sm text-red-400">{error}</p>
        )}

        {!loading && quota && (
          <div className="mb-5 rounded-xl border border-white/6 bg-black/30 p-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-white/30">
              <span>Cloud storage</span>
              <span>{formatBytes(quota.usedBytes)} / {formatBytes(quota.quotaBytes)}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${percent > 90 ? 'bg-red-400' : 'bg-sky-400'}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-white/30">
              {formatBytes(quota.codeFileBytes)} in modpack codes · {formatBytes(quota.instanceBytes)} in cloud instances
            </p>
          </div>
        )}

        {!loading && codes.length > 0 && (
          <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/6">
            {codes.map((entry) => (
              <div key={entry.code} className="flex items-start gap-3 bg-black/20 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-white">
                    <span className="font-mono text-sky-400">{entry.code}</span>
                    <span className="truncate">{entry.name}</span>
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-white/30">
                    <span>{[entry.version, entry.loader].filter(Boolean).join(' · ') || '—'}</span>
                    <span className="text-white/15">·</span>
                    <span>{entry.uses || 0} uses</span>
                    <span className="text-white/15">·</span>
                    <span>{entry.expires ? `expires ${new Date(entry.expires).toLocaleDateString()}` : 'never expires'}</span>
                  </p>
                  {entry.files && entry.files.length > 0 ? (
                    <div className="mt-1.5 space-y-0.5">
                      <p className="text-[11px] text-amber-400/80">
                        {entry.files.length} own file{entry.files.length !== 1 ? 's' : ''} uploaded, because Modrinth and
                        CurseForge don't have {entry.files.length !== 1 ? 'them' : 'it'} · {formatBytes(entry.filesBytes)}
                      </p>
                      {entry.files.map((file) => (
                        <p key={`${file.kind}:${file.fileName}`} className="flex items-center gap-1 text-[11px] text-white/35">
                          <FileArchive className="h-3 w-3 shrink-0" />
                          <span className="truncate">{file.fileName}</span>
                          <span className="shrink-0 text-white/20">{formatBytes(file.size)}</span>
                          {file.scan?.status === 'infected' && (
                            <span className="shrink-0 font-semibold text-red-400">blocked by the virus check</span>
                          )}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[11px] text-white/25">Only Modrinth and CurseForge content, no storage used</p>
                  )}
                </div>
                {confirmDelete === entry.code ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => remove(entry.code)}
                      className="rounded-lg bg-red-500 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-red-400 disabled:opacity-50"
                    >
                      {busy === entry.code ? 'Deleting...' : 'Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(null)}
                      className="rounded-lg px-2 py-1 text-xs text-white/40 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => setConfirmDelete(entry.code)}
                    title="Delete the code and its uploaded files"
                    className="shrink-0 rounded-lg p-2 text-white/25 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
