import { useState } from 'react'
import { FileSearch, ShieldAlert } from 'lucide-react'
import { Button } from './ui'
import { cn } from '../../lib/utils'

/* Lazily fetches size/SHA-256 for an uploaded file and links out to VirusTotal —
   there's no automated scan, but this gives moderators enough to run one manually. */
export function FileInspector({ filePath }) {
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
    <div className="mt-3 border-t border-white/[0.05] pt-3">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/35 transition-colors hover:text-white"
      >
        <FileSearch className="h-3.5 w-3.5" />
        {open ? 'Hide file info' : 'Inspect file'}
      </button>

      {open && (
        <div className="mt-2.5 rounded-xl border border-white/[0.06] bg-black/30 p-3.5 text-xs">
          {loading && <p className="text-white/30">Loading…</p>}
          {error && <p className="text-red-400">{error}</p>}
          {info && (
            <div className="flex flex-col gap-2">
              {[
                ['File', <span key="f" className="truncate font-mono text-white/70">{info.filename}</span>],
                ['Size', <span key="s" className="text-white/70">{(info.size / 1024).toFixed(1)} KB</span>],
                ['SHA-256', <span key="h" className="truncate font-mono text-[11px] text-white/70">{info.sha256}</span>],
              ].map(([label, node]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="shrink-0 text-white/30">{label}</span>
                  {node}
                </div>
              ))}
              <div className="mt-1 flex flex-wrap gap-2">
                <a href={info.downloadUrl} target="_blank" rel="noopener noreferrer"
                  className="rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-bold text-white/60 transition-colors hover:text-white">
                  Download
                </a>
                <a href={info.virusTotalUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20">
                  <ShieldAlert className="h-3 w-3" /> Check on VirusTotal
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* One reviewable item in a moderation queue: identity on the left, the decision
   on the right, and any extra evidence underneath. */
export function ModerationCard({ title, subtitle, meta, image, badge, actions = [], children, className }) {
  return (
    <div className={cn('rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.1]', className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {image && (
            <img
              src={image} alt=""
              className="h-11 w-11 shrink-0 rounded-xl border border-white/[0.06] object-cover"
              onError={e => { e.currentTarget.style.display = 'none' }}
            />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-bold text-white">{title}</p>
              {badge}
            </div>
            {subtitle && <p className="mt-0.5 truncate text-xs text-white/[0.38]">{subtitle}</p>}
            {meta && <p className="mt-1 text-[11px] text-white/[0.24]">{meta}</p>}
          </div>
        </div>

        {actions.length > 0 && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {actions.map(action => (
              <Button
                key={action.label}
                size="sm"
                variant={action.tone || 'ghost'}
                icon={action.icon}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}
