import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCircle2, Cpu, ListOrdered, Pause, Play, Power, RefreshCw,
  RotateCcw, ShieldAlert, ShieldCheck, Square, X,
} from 'lucide-react'
import { Badge, Button, Cell, EmptyState, Panel, Row, StatTile, Table } from '../ui'
import { useDialog, useToast } from '../feedback'

/* Virus check for own files in modpack codes. Every uploaded file goes into a queue,
   one worker takes one job after the other. ClamAV only runs while there is work and
   stops when the queue is empty. A code with unchecked files does not work. */

const POLL_MS = 3000

const when = (v) => (v ? new Date(v).toLocaleString() : '—')
const ago = (v) => {
  if (!v) return '—'
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000)
  if (s < 0) return `in ${formatSeconds(-s)}`
  return `${formatSeconds(s)} ago`
}
function formatSeconds(s) {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}
function formatBytes(bytes) {
  if (!bytes) return '0 MB'
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

const ENGINE_LABELS = {
  stopped: { label: 'Resting', tone: 'neutral', hint: 'Not running, uses no memory. Starts when a file arrives.' },
  updating: { label: 'Updating signatures', tone: 'info', hint: 'freshclam is downloading the newest virus signatures.' },
  starting: { label: 'Starting', tone: 'info', hint: 'Loading the virus signatures into memory, this takes a moment.' },
  ready: { label: 'Running', tone: 'success', hint: 'Ready to scan.' },
  stopping: { label: 'Stopping', tone: 'warning', hint: 'Freeing the memory.' },
  error: { label: 'Error', tone: 'danger', hint: 'The worker tries again by itself.' },
  unavailable: { label: 'Not installed', tone: 'danger', hint: 'clamd is missing on this server. Files wait in the queue.' },
  off: { label: 'Off', tone: 'warning', hint: 'CLAMAV_MODE=off: only the built-in check runs.' },
}

const WORKER_LABELS = {
  idle: { label: 'Idle', tone: 'neutral' },
  working: { label: 'Working', tone: 'success' },
  waiting_engine: { label: 'Waiting to retry', tone: 'warning' },
  paused: { label: 'Paused (maintenance)', tone: 'warning' },
  stopped: { label: 'Stopped', tone: 'danger' },
}

const RESULT_TONES = { clean: 'success', infected: 'danger', error: 'warning' }
const REASON_LABELS = { upload: 'Upload', rescan: 'Daily rescan', manual: 'Manual' }

const EVENT_TONES = { infected: 'text-red-300', error: 'text-red-300', warning: 'text-amber-300', engine: 'text-sky-300', state: 'text-white/70', job: 'text-white/45' }

export default function VirusScanView() {
  const toast = useToast()
  const dialog = useDialog()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const [, setTick] = useState(0)
  const timer = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/code-scans', { credentials: 'same-origin' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.success) throw new Error(body.error || `HTTP ${res.status}`)
      setData(body.data)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
    timer.current = setInterval(() => {
      if (!document.hidden) load()
      setTick((t) => t + 1)
    }, POLL_MS)
    return () => clearInterval(timer.current)
  }, [load])

  const post = useCallback(async (key, url, body, success) => {
    setBusy(key)
    try {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.success === false) throw new Error(json.error || `HTTP ${res.status}`)
      if (success) toast.success(success)
      await load()
    } catch (e) {
      toast.error('Action failed', e.message)
    } finally {
      setBusy(null)
    }
  }, [load, toast])

  const togglePause = async () => {
    if (!data) return
    if (data.state.paused) {
      await post('pause', '/api/admin/code-scans/pause', { paused: false }, 'Virus check running again')
      return
    }
    const values = await dialog.prompt({
      title: 'Start maintenance?',
      description: 'No files are checked until you end it. Codes with unchecked files tell people that the virus check is down for maintenance and work again afterwards. ClamAV is stopped.',
      confirmLabel: 'Pause checking',
      tone: 'danger',
      fields: [{ name: 'reason', label: 'Reason (optional)', placeholder: 'e.g. server update' }],
    })
    if (!values) return
    await post('pause', '/api/admin/code-scans/pause', { paused: true, reason: values.reason || null }, 'Maintenance started')
  }

  const setVerdict = async (job, status) => {
    const ok = await dialog.confirm({
      title: status === 'clean' ? 'Release this file?' : 'Block this file?',
      description: status === 'clean'
        ? `${job.fileName || job.sha256.slice(0, 12)} is marked as clean by hand. Only do this for a false alarm you checked yourself.`
        : `${job.fileName || job.sha256.slice(0, 12)} is blocked. Codes with it stop working.`,
      confirmLabel: status === 'clean' ? 'Mark clean' : 'Block',
      tone: status === 'clean' ? 'primary' : 'danger',
    })
    if (!ok) return
    await post(`verdict-${job.id}`, `/api/admin/code-scans/files/${job.sha256}/verdict`, { status }, status === 'clean' ? 'File released' : 'File blocked')
  }

  if (!data) {
    return (
      <Panel title="Virus check">
        {error
          ? <EmptyState icon={AlertTriangle} title="Could not load the virus check" message={error} action={<Button icon={RefreshCw} onClick={load}>Try again</Button>} />
          : <p className="py-8 text-center text-xs text-white/30">Loading…</p>}
      </Panel>
    )
  }

  const engine = data.engine
  const engineInfo = ENGINE_LABELS[engine.status] || { label: engine.status, tone: 'neutral' }
  const workerInfo = WORKER_LABELS[data.worker.status] || { label: data.worker.status, tone: 'neutral' }
  const current = data.worker.current
  const pending = (data.files.pending || 0) + (data.files.error || 0)

  return (
    <div className="flex flex-col gap-6">
      {data.state.paused && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-5 py-4">
          <Pause className="h-4 w-4 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-200">Maintenance: files are not being checked</p>
            <p className="text-xs text-amber-200/60">
              {data.state.reason ? `${data.state.reason} · ` : ''}since {when(data.state.since)}{data.state.by ? ` by ${data.state.by}` : ''}.
              {' '}Codes with unchecked files show a maintenance message until you end it.
            </p>
          </div>
          <Button variant="success" icon={Play} disabled={busy === 'pause'} onClick={togglePause}>End maintenance</Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={ListOrdered} label="In the queue" value={data.counts.queued + data.counts.running} color="#3b82f6" live={data.worker.status === 'working'} hint={`${data.counts.running} running now`} />
        <StatTile icon={Activity} label="Waiting files" value={pending} color={pending ? '#f59e0b' : '#10b981'} hint="Files that block a code until they are checked" />
        <StatTile icon={ShieldAlert} label="Blocked files" value={data.files.infected || 0} color={data.files.infected ? '#ef4444' : '#10b981'} />
        <StatTile icon={ShieldCheck} label="Checked files" value={data.files.clean || 0} color="#10b981" hint={`${data.counts.done} jobs done · ${data.counts.failed} failed`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Worker"
          description="Takes one file at a time from the queue. Jobs that were running when the server or ClamAV stopped are done again."
          actions={(
            <Button variant={data.state.paused ? 'success' : 'danger'} icon={data.state.paused ? Play : Pause} disabled={busy === 'pause'} onClick={togglePause}>
              {data.state.paused ? 'End maintenance' : 'Maintenance'}
            </Button>
          )}
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-xs">
            <dt className="text-white/35">Status</dt>
            <dd><Badge tone={workerInfo.tone}>{workerInfo.label}</Badge></dd>
            <dt className="text-white/35">Current job</dt>
            <dd className="text-white/70">
              {current
                ? <>#{current.id} · {current.reason} · attempt {current.attempt} · started {ago(current.startedAt)}</>
                : '—'}
            </dd>
            <dt className="text-white/35">Next retry</dt>
            <dd className="text-white/70">{data.worker.nextRetryAt ? ago(data.worker.nextRetryAt) : '—'}</dd>
            <dt className="text-white/35">Last job</dt>
            <dd className="text-white/70">{ago(data.worker.lastJobAt)}</dd>
            <dt className="text-white/35">Done since start</dt>
            <dd className="text-white/70">{data.worker.processed} · max {data.worker.maxAttempts} attempts per file</dd>
          </dl>
        </Panel>

        <Panel
          title="ClamAV"
          description={engineInfo.hint}
          actions={(
            <div className="flex gap-2">
              {['stopped', 'error', 'unavailable'].includes(engine.status) ? (
                <Button size="sm" icon={Power} disabled={busy === 'engine' || engine.mode === 'off'} onClick={() => post('engine', '/api/admin/code-scans/engine', { action: 'start' }, 'ClamAV started')}>Start</Button>
              ) : (
                <Button size="sm" icon={Square} disabled={busy === 'engine' || engine.mode !== 'local'} onClick={() => post('engine', '/api/admin/code-scans/engine', { action: 'stop' }, 'ClamAV stopped')}>Stop</Button>
              )}
              <Button size="sm" icon={RefreshCw} disabled={busy === 'engine' || engine.mode !== 'local'} onClick={() => post('engine', '/api/admin/code-scans/engine', { action: 'update' }, 'Signatures updated')}>Update signatures</Button>
            </div>
          )}
        >
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2.5 text-xs">
            <dt className="text-white/35">Status</dt>
            <dd className="flex items-center gap-2">
              <Badge tone={engineInfo.tone}>{engineInfo.label}</Badge>
              <span className="text-white/30">mode {engine.mode}</span>
            </dd>
            <dt className="text-white/35">Memory</dt>
            <dd className="text-white/70">
              {engine.pid ? `${formatBytes(engine.memoryBytes)} (pid ${engine.pid})` : 'none, not running'}
            </dd>
            <dt className="text-white/35">Rest mode</dt>
            <dd className="text-white/70">
              {engine.idleStopsAt
                ? `stops ${ago(engine.idleStopsAt)} if nothing arrives`
                : `after ${formatSeconds(engine.idleStopSeconds)} without work`}
            </dd>
            <dt className="text-white/35">Signatures</dt>
            <dd className="text-white/70">
              {engine.signatures ? `${engine.signatures.files} files, updated ${ago(engine.signatures.updatedAt)}` : engine.mode === 'local' ? 'not downloaded yet' : '—'}
            </dd>
            <dt className="text-white/35">Version</dt>
            <dd className="text-white/70">{engine.version || '—'}</dd>
            <dt className="text-white/35">Starts / crashes</dt>
            <dd className="text-white/70">{engine.starts} / {engine.crashes}</dd>
            {engine.lastError && (
              <>
                <dt className="text-white/35">Last error</dt>
                <dd className="text-red-300/90">{engine.lastError} <span className="text-white/30">({ago(engine.lastErrorAt)})</span></dd>
              </>
            )}
          </dl>
        </Panel>
      </div>

      <Panel title="Queue" description="Uploads come before the daily rescans. A code works once all its files are checked.">
        {data.queue.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Queue is empty" message="ClamAV rests until the next file arrives." />
        ) : (
          <Table columns={[{ label: '#' }, { label: 'File' }, { label: 'Why' }, { label: 'Status' }, { label: 'Attempts', align: 'right' }, { label: 'Note', className: 'pl-6' }, { label: '', align: 'right' }]}>
            {data.queue.map((job) => (
              <Row key={job.id}>
                <Cell className="font-mono text-[11px] text-white/35">{job.id}</Cell>
                <Cell>
                  <p className="text-xs font-semibold text-white/80">{job.fileName || 'unnamed file'}</p>
                  <p className="font-mono text-[10px] text-white/25">{job.sha256.slice(0, 16)}…</p>
                </Cell>
                <Cell className="text-xs">{REASON_LABELS[job.reason] || job.reason}</Cell>
                <Cell>
                  {job.status === 'running'
                    ? <Badge tone="success">Scanning</Badge>
                    : job.nextAttemptAt && new Date(job.nextAttemptAt).getTime() > Date.now()
                      ? <Badge tone="warning">Retry {ago(job.nextAttemptAt)}</Badge>
                      : <Badge tone="info">Waiting</Badge>}
                </Cell>
                <Cell align="right" className="tabular-nums text-xs">{job.attempts}{job.restarts ? ` (+${job.restarts} restarts)` : ''}</Cell>
                <Cell className="max-w-xs pl-6 text-[11px] text-white/40">{job.detail || '—'}</Cell>
                <Cell align="right">
                  {job.status === 'queued' && (
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="subtle" icon={Play} disabled={busy === `retry-${job.id}`} onClick={() => post(`retry-${job.id}`, `/api/admin/code-scans/jobs/${job.id}/retry`, null, `Job #${job.id} moved up`)}>Now</Button>
                      <Button size="sm" variant="subtle" icon={X} disabled={busy === `cancel-${job.id}`} onClick={() => post(`cancel-${job.id}`, `/api/admin/code-scans/jobs/${job.id}/cancel`, null, `Job #${job.id} cancelled`)}>Cancel</Button>
                    </div>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Recent results" description="Finished, failed and cancelled jobs.">
          {data.recent.length === 0 ? (
            <EmptyState icon={ShieldCheck} title="No jobs yet" message="Results appear after the first upload." />
          ) : (
            <Table columns={[{ label: 'File' }, { label: 'Result' }, { label: 'Engines' }, { label: 'Finished' }, { label: '', align: 'right' }]}>
              {data.recent.map((job) => (
                <Row key={job.id}>
                  <Cell>
                    <p className="text-xs font-semibold text-white/80">{job.fileName || 'unnamed file'}</p>
                    <p className="text-[10px] text-white/25">#{job.id} · {REASON_LABELS[job.reason] || job.reason}{job.requestedBy && job.reason === 'manual' ? ` by ${job.requestedBy}` : ''}</p>
                  </Cell>
                  <Cell>
                    {job.status === 'done'
                      ? <Badge tone={RESULT_TONES[job.result] || 'neutral'}>{job.result === 'infected' ? 'Blocked' : 'Clean'}</Badge>
                      : <Badge tone={job.status === 'failed' ? 'danger' : 'neutral'}>{job.status === 'failed' ? 'Failed' : 'Cancelled'}</Badge>}
                    {job.detail && <p className="mt-1 max-w-xs text-[11px] text-white/40">{job.detail}</p>}
                  </Cell>
                  <Cell className="font-mono text-[11px] text-white/40">{job.engine || '—'}</Cell>
                  <Cell className="whitespace-nowrap text-xs text-white/35">{ago(job.finishedAt)}</Cell>
                  <Cell align="right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="subtle" icon={RotateCcw} disabled={busy === `rescan-${job.id}`} onClick={() => post(`rescan-${job.id}`, `/api/admin/code-scans/files/${job.sha256}/rescan`, null, 'Queued for a new check')}>Rescan</Button>
                      {job.result === 'infected' && (
                        <Button size="sm" variant="subtle" icon={ShieldCheck} disabled={busy === `verdict-${job.id}`} onClick={() => setVerdict(job, 'clean')}>False alarm</Button>
                      )}
                      {job.result === 'clean' && (
                        <Button size="sm" variant="subtle" icon={ShieldAlert} disabled={busy === `verdict-${job.id}`} onClick={() => setVerdict(job, 'infected')}>Block</Button>
                      )}
                    </div>
                  </Cell>
                </Row>
              ))}
            </Table>
          )}
        </Panel>

        <Panel title="Activity" description="What the worker and ClamAV did, newest first. Live." bodyClass="p-0">
          <div className="max-h-[480px] overflow-y-auto px-5 py-3">
            {data.events.length === 0 ? (
              <p className="py-6 text-center text-xs text-white/30">Nothing happened since the server started.</p>
            ) : data.events.map((event, index) => (
              <div key={`${event.at}-${index}`} className="flex gap-3 border-b border-white/[0.04] py-2 last:border-0">
                <span className="w-16 shrink-0 text-[10px] tabular-nums text-white/25">{new Date(event.at).toLocaleTimeString()}</span>
                <span className={`text-[11px] ${EVENT_TONES[event.type] || 'text-white/50'}`}>
                  {event.type === 'engine' && <Cpu className="mr-1 inline h-3 w-3" />}
                  {event.message}
                  {event.detail && <span className="block text-white/30">{event.detail}</span>}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
