import { useCallback, useEffect, useState } from 'react'
import {
  Activity, AlertTriangle, CheckCheck, CheckCircle2, ChevronDown, Clock, Mail, MailX, RefreshCw, Send, XCircle,
} from 'lucide-react'
import { Badge, Button, Cell, EmptyState, Panel, Row, SegmentedControl, StatTile, Table } from '../ui'

/* Is anything broken, and are emails getting out? Failures are server-side errors
   (status 500 and up): wrong passwords or taken usernames are normal answers. */

const pct = (v) => `${(v * 100).toFixed(v > 0 && v < 0.01 ? 2 : 1)}%`
const when = (v) => (v ? new Date(v).toLocaleString() : '—')

function rateTone(rate, fails) {
  if (!fails) return 'success'
  if (rate >= 0.05) return 'danger'
  return 'warning'
}

const EMAIL_REASONS = {
  network: 'Could not reach Resend (network)',
  exception: 'Unexpected error while sending',
  quota_check: 'Email counter in the database failed',
  not_configured: 'RESEND_API_KEY is not set',
  daily_limit: 'Our daily limit was used up',
  monthly_limit: 'Our monthly limit was used up',
  resend_daily_quota: 'Resend: daily quota exceeded',
  resend_monthly_quota: 'Resend: monthly quota exceeded',
  http_400: 'Resend rejected the request (400)',
  http_401: 'Resend: API key invalid (401)',
  http_403: 'Resend: not allowed, check the domain (403)',
  http_422: 'Resend: invalid email or sender (422)',
  http_429: 'Resend: too many requests (429)',
  http_500: 'Resend server error (500)',
}

const KIND_LABELS = {
  verify: 'Email confirmation',
  reset: 'Password reset',
  security: 'Security notice',
  cloud_expiry: 'Cloud expiry warning',
  moderation: 'Moderation',
  already_registered: 'Already registered',
}

const STATUS_TONES = { sent: 'success', sending: 'info', failed: 'danger', skipped: 'warning' }

function HourBars({ hourly }) {
  const max = Math.max(1, ...hourly.map((h) => h.ok + h.fail))
  return (
    <div>
      <div className="flex h-24 items-end gap-[3px]">
        {hourly.map((h) => {
          const total = h.ok + h.fail
          return (
            <div key={h.bucket} className="group relative flex h-full flex-1 flex-col justify-end" title={`${new Date(h.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${total} requests, ${h.fail} failed`}>
              <div className="w-full rounded-t-sm bg-red-500/80" style={{ height: `${(h.fail / max) * 100}%` }} />
              <div className="w-full bg-emerald-500/35" style={{ height: `${(h.ok / max) * 100}%`, borderTopLeftRadius: h.fail ? 0 : 2, borderTopRightRadius: h.fail ? 0 : 2 }} />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-white/25">
        <span>24 h ago</span><span>now</span>
      </div>
    </div>
  )
}

function ErrorRow({ error }) {
  const [open, setOpen] = useState(false)
  return (
    <Row>
      <Cell className="whitespace-nowrap text-xs text-white/[0.32]">{when(error.created_at)}</Cell>
      <Cell>
        <div className="flex items-center gap-2">
          {!error.seen_at && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" title="New" />}
          <span className="text-xs font-semibold text-white/80">{error.areaLabel}</span>
        </div>
      </Cell>
      <Cell className="max-w-md">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-1.5 text-left">
          <span className={`text-xs text-red-300/90 ${open ? '' : 'line-clamp-2'}`}>{error.message}</span>
          {error.detail && <ChevronDown className={`mt-0.5 h-3 w-3 shrink-0 text-white/30 transition-transform ${open ? 'rotate-180' : ''}`} />}
        </button>
        {open && error.detail && (
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2.5 font-mono text-[10px] leading-relaxed text-white/45">{error.detail}</pre>
        )}
      </Cell>
      <Cell className="whitespace-nowrap font-mono text-[11px] text-white/35">
        {error.method} {error.path}{error.status ? ` · ${error.status}` : ''}
      </Cell>
    </Row>
  )
}

function ErrorsPanel({ data, onSeen }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Activity} label="Requests (24 h)" value={(data.totals.ok24 + data.totals.fail24).toLocaleString()} color="#3b82f6" />
        <StatTile icon={XCircle} label="Failed (24 h)" value={data.totals.fail24.toLocaleString()} color="#ef4444" hint="Server errors, status 500 and up" />
        <StatTile icon={AlertTriangle} label="Error rate (24 h)" value={pct(data.totals.rate24)} color={data.totals.rate24 >= 0.05 ? '#ef4444' : data.totals.fail24 ? '#f59e0b' : '#10b981'} />
        <StatTile icon={Clock} label="New errors" value={data.unseenErrors} color={data.unseenErrors ? '#ef4444' : '#10b981'} hint="Not marked as seen yet" />
      </div>

      <Panel title="Last 24 hours" description="Requests per hour. Red is the part that failed.">
        <HourBars hourly={data.hourly} />
      </Panel>

      <Panel title="Error rate by area" description="Sorted by failures. Counted from the moment this version was deployed.">
        {data.areas.length === 0 ? (
          <EmptyState icon={Activity} title="No traffic recorded yet" message="Numbers appear here after the first requests." />
        ) : (
          <Table columns={[{ label: 'Area' }, { label: 'Requests 24 h', align: 'right' }, { label: 'Failed 24 h', align: 'right' }, { label: 'Rate 24 h', align: 'right' }, { label: 'Rate 7 days', align: 'right' }, { label: 'Last error', className: 'pl-8' }]}>
            {data.areas.map((a) => (
              <Row key={a.area}>
                <Cell><span className="text-xs font-semibold text-white/80">{a.label}</span></Cell>
                <Cell align="right" className="tabular-nums text-xs">{(a.ok24 + a.fail24).toLocaleString()}</Cell>
                <Cell align="right" className={`tabular-nums text-xs ${a.fail24 ? 'font-bold text-red-400' : ''}`}>{a.fail24}</Cell>
                <Cell align="right"><Badge tone={rateTone(a.rate24, a.fail24)}>{pct(a.rate24)}</Badge></Cell>
                <Cell align="right" className="tabular-nums text-xs text-white/40">{pct(a.rate7d)}</Cell>
                <Cell className="max-w-xs pl-8">
                  {a.lastError
                    ? <span className="line-clamp-1 text-[11px] text-white/35" title={a.lastError.message}>{when(a.lastError.created_at)} · {a.lastError.message}</span>
                    : <span className="text-[11px] text-white/20">—</span>}
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Panel>

      <Panel
        title="Recent failures"
        description="The same failure is stored once every 10 minutes; it is still counted every time. Kept for 30 days."
        actions={data.unseenErrors > 0 && <Button icon={CheckCheck} onClick={onSeen}>Mark all as seen</Button>}
      >
        {data.errors.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No failures" message="Everything ran without server errors." />
        ) : (
          <Table columns={[{ label: 'When' }, { label: 'Area' }, { label: 'Error' }, { label: 'Request' }]}>
            {data.errors.map((e) => <ErrorRow key={e.id} error={e} />)}
          </Table>
        )}
      </Panel>
    </div>
  )
}

function QuotaBar({ label, quota }) {
  const share = Math.min(1, quota.used / Math.max(1, quota.limit))
  const color = quota.blocked || share >= 1 ? 'bg-red-500' : share >= 0.8 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-semibold text-white/60">{label}</span>
        <span className="text-xs tabular-nums text-white/50"><span className="font-bold text-white">{quota.used}</span> / {quota.limit}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${share * 100}%` }} />
      </div>
      <span className="text-[11px] text-white/30">
        {quota.blocked ? 'Paused by Resend. ' : share >= 1 ? 'Used up. ' : ''}Resets {when(quota.resetsAt)}
      </span>
    </div>
  )
}

function EmailPanel({ email }) {
  const c = email.counts
  return (
    <div className="flex flex-col gap-6">
      {!email.status.available && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4">
          <MailX className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="text-xs leading-relaxed text-red-200/90">
            <p className="font-bold text-red-300">Emails are paused, email sign-up is closed.</p>
            <p className="mt-0.5 text-red-200/70">
              {email.status.reason === 'not_configured' && 'RESEND_API_KEY is not set in the environment.'}
              {email.status.reason === 'daily' && `The daily limit is reached. Sending resumes ${when(email.status.resumesAt)}.`}
              {email.status.reason === 'monthly' && `The monthly limit is reached. Sending resumes ${when(email.status.resumesAt)}.`}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={CheckCircle2} label="Sent" value={c.sent.last24} hint={`${c.sent.last30} in 30 days`} color="#10b981" />
        <StatTile icon={Send} label="Sending now" value={c.sending.last24} hint={email.stuck ? `${email.stuck} stuck for over 5 minutes` : 'In progress right now'} color="#3b82f6" />
        <StatTile icon={XCircle} label="Failed" value={c.failed.last24} hint={`${c.failed.last30} in 30 days`} color="#ef4444" />
        <StatTile icon={Clock} label="Not sent (limit)" value={c.skipped.last24} hint={`${c.skipped.last30} in 30 days`} color="#f59e0b" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Resend free tier" description={email.configured ? 'Counted by us, and paused early if Resend reports its own limit.' : (email.devConsole ? 'No API key: emails are printed to the server console (development).' : 'No API key set.')}>
          <div className="flex flex-col gap-5">
            <QuotaBar label="Today (UTC)" quota={email.quota.daily} />
            <QuotaBar label="This month" quota={email.quota.monthly} />
          </div>
        </Panel>

        <Panel title="Why emails were not sent" description="Last 30 days.">
          {email.reasons.length === 0 ? (
            <EmptyState icon={Mail} title="Nothing failed" message="Every email in the last 30 days went out." />
          ) : (
            <ul className="flex flex-col gap-2">
              {email.reasons.map((r) => (
                <li key={`${r.status}-${r.reason}`} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
                  <Badge tone={STATUS_TONES[r.status]}>{r.status}</Badge>
                  <span className="min-w-0 flex-1 text-xs text-white/70">{EMAIL_REASONS[r.reason] || r.reason}</span>
                  <span className="text-sm font-black tabular-nums text-white">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
          {email.kinds.length > 0 && (
            <p className="mt-4 text-[11px] leading-relaxed text-white/30">
              By type (30 days): {email.kinds.map((k) => `${KIND_LABELS[k.kind] || k.kind} ${k.count}`).join(' · ')}
            </p>
          )}
        </Panel>
      </div>

      <Panel title="Email log" description="The last 100 emails. Addresses are shortened on purpose. Kept for 30 days.">
        {email.recent.length === 0 ? (
          <EmptyState icon={Mail} title="No emails yet" message="Sign-up confirmations, password resets and notices show up here." />
        ) : (
          <Table columns={[{ label: 'When' }, { label: 'Type' }, { label: 'To' }, { label: 'Status' }, { label: 'Reason' }]}>
            {email.recent.map((m) => (
              <Row key={m.id}>
                <Cell className="whitespace-nowrap text-xs text-white/[0.32]">{when(m.created_at)}</Cell>
                <Cell><span className="text-xs text-white/70" title={m.subject}>{KIND_LABELS[m.kind] || m.kind}</span></Cell>
                <Cell className="font-mono text-[11px] text-white/45">{m.recipient || '—'}</Cell>
                <Cell><Badge tone={STATUS_TONES[m.status]}>{m.status}</Badge></Cell>
                <Cell className="max-w-xs">
                  {m.reason
                    ? <span className="line-clamp-2 text-[11px] text-white/40" title={m.error || ''}>{EMAIL_REASONS[m.reason] || m.reason}{m.error ? ` · ${m.error}` : ''}</span>
                    : <span className="text-[11px] text-white/20">—</span>}
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  )
}

export default function HealthView({ onSummaryChange }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useState('errors')

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await fetch('/api/admin/health', { credentials: 'same-origin' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not load')
      setData(json)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [load])

  const markSeen = async () => {
    await fetch('/api/admin/health/seen', { method: 'POST', credentials: 'same-origin' })
    await load()
    onSummaryChange?.()
  }

  if (error && !data) return <EmptyState icon={AlertTriangle} title="Could not load the health report" message={error} action={<Button icon={RefreshCw} onClick={load}>Try again</Button>} />
  if (!data) return <EmptyState icon={Activity} title="Loading…" message="Collecting error rates and the email log." />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:w-auto sm:min-w-[320px]">
          <SegmentedControl
            items={[
              { id: 'errors', label: 'Errors', count: data.unseenErrors },
              { id: 'email', label: 'Emails', count: data.email.counts.failed.last24 },
            ]}
            value={view}
            onChange={setView}
          />
        </div>
        <span className="text-[11px] text-white/25">Updates every 30 s · {new Date(data.generatedAt).toLocaleTimeString()}</span>
      </div>
      {view === 'errors' ? <ErrorsPanel data={data} onSeen={markSeen} /> : <EmailPanel email={data.email} />}
    </div>
  )
}
