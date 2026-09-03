import { useCallback, useEffect, useState } from 'react'
import {
  Archive, Ban, Database, HardDrive, Layers, Play, RefreshCw,
  Trash2, TriangleAlert, UserCheck, Users as UsersIcon,
} from 'lucide-react'
import {
  Badge, Button, Cell, EmptyState, Field, GroupHeading, Modal,
  Panel, Row, SearchField, StatTile, Table, TextInput,
} from './ui'
import { useDialog, useToast } from './feedback'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const JOBS = [
  { endpoint: 'gc',     mode: 'gc',        label: 'Garbage collection', hint: 'Delete blobs nothing references any more.' },
  { endpoint: 'gc',     mode: 'reconcile', label: 'Reconcile refcounts', hint: 'Recount references and repair drift.' },
  { endpoint: 'expiry', mode: 'retention', label: 'Retention',           hint: 'Apply the configured retention window.' },
  { endpoint: 'expiry', mode: 'expiry',    label: '15 day rule',         hint: 'Remove instances no second PC ever pulled.' },
]

const USER_COLUMNS = [
  { label: 'Account' },
  { label: 'Storage used' },
  { label: 'Instances' },
  { label: 'Last activity' },
  { label: '', align: 'right' },
]

export default function CloudPanel() {
  const toast  = useToast()
  const dialog = useDialog()

  const [stats,     setStats]     = useState(null)
  const [users,     setUsers]     = useState([])
  const [jobs,      setJobs]      = useState(null)
  const [busy,      setBusy]      = useState(null)
  const [output,    setOutput]    = useState(null)
  const [query,     setQuery]     = useState('')
  const [banTarget, setBanTarget] = useState(null)
  const [banReason, setBanReason] = useState('')

  const load = useCallback(async () => {
    try {
      const [statsRes, usersRes, jobsRes] = await Promise.all([
        fetch('/api/admin/cloud/stats', { credentials: 'include' }),
        fetch('/api/admin/cloud/users?limit=50', { credentials: 'include' }),
        fetch('/api/admin/cloud/expiry', { credentials: 'include' }),
      ])
      if (statsRes.ok) setStats(await statsRes.json())
      if (usersRes.ok) setUsers((await usersRes.json()).users || [])
      if (jobsRes.ok)  setJobs(await jobsRes.json())
    } catch {
      toast.error('Could not load cloud data')
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  const runJob = async (job, dryRun) => {
    if (!dryRun) {
      const ok = await dialog.confirm({
        title: `Run “${job.label}” for real?`,
        description: 'This job deletes data. Run it as a dry run first if you are unsure.',
        confirmLabel: 'Run job',
        tone: 'danger',
      })
      if (!ok) return
    }
    setBusy(`${job.mode}-${dryRun}`)
    setOutput(null)
    try {
      const res = await fetch(`/api/admin/cloud/${job.endpoint}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mode: job.mode, dryRun }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Job failed')
      setOutput({ job: `${job.label}${dryRun ? ' (dry run)' : ''}`, result: JSON.stringify(data.result, null, 2) })
      toast.success(`${job.label} finished`, dryRun ? 'Dry run — nothing was deleted.' : undefined)
      await load()
    } catch (error) {
      toast.error(`${job.label} failed`, error.message)
    } finally {
      setBusy(null)
    }
  }

  const setQuota = async user => {
    const values = await dialog.prompt({
      title: `Storage quota for ${user.username}`,
      description: `Currently using ${formatBytes(user.usedBytes)} of ${formatBytes(user.quotaBytes)}.`,
      confirmLabel: 'Save quota',
      fields: [{
        name: 'gb', label: 'Quota in GB', type: 'number', required: true,
        defaultValue: String(Math.round(user.quotaBytes / 1024 ** 3)),
        hint: 'Set 0 to block new uploads without banning the account.',
      }],
    })
    if (!values) return
    const value = Number(values.gb)
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Invalid quota', 'Enter a number of gigabytes, zero or more.')
      return
    }
    try {
      const res = await fetch(`/api/admin/cloud/users/${user.id}/quota`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ quotaBytes: Math.round(value * 1024 ** 3) }),
      })
      if (!res.ok) throw new Error('Request rejected')
      toast.success(`Quota for ${user.username} set to ${value} GB`)
      await load()
    } catch (error) {
      toast.error('Could not change the quota', error.message)
    }
  }

  const toggleBan = async (user, banned) => {
    setBusy(`ban-${user.id}`)
    try {
      const res = await fetch(`/api/admin/cloud/users/${user.id}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ banned, reason: banned ? (banReason || null) : null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Could not change the ban')
      toast.success(banned ? `Cloud disabled for ${user.username}` : `Cloud restored for ${user.username}`)
      setBanTarget(null)
      setBanReason('')
      await load()
    } catch (error) {
      toast.error('Ban not applied', error.message)
    } finally {
      setBusy(null)
    }
  }

  const filteredUsers = users.filter(user =>
    !query.trim() || user.username?.toLowerCase().includes(query.trim().toLowerCase()))

  const expiryLive = jobs?.expiry && !jobs.expiry.dryRun

  return (
    <div className="flex flex-col gap-6">
      <section>
        <GroupHeading hint={stats ? `${stats.blobs.count} blobs stored` : 'Loading…'}>Storage</GroupHeading>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={HardDrive} label="Physically stored" color="#e27602" loading={!stats}
            value={stats ? formatBytes(stats.blobs.physicalBytes) : '—'}
            hint={stats ? `${stats.blobs.orphanCount} unreferenced` : null}
          />
          <StatTile
            icon={UsersIcon} label="Billed to users" color="#3b82f6" loading={!stats}
            value={stats ? formatBytes(stats.users.billedBytes) : '—'}
            hint={stats ? `${stats.users.withData} accounts with data` : null}
          />
          <StatTile
            icon={Layers} label="Dedup factor" color="#10b981" loading={!stats}
            value={stats?.dedupFactor ? `${stats.dedupFactor}x` : '—'}
            hint="Billed divided by actually stored"
          />
          <StatTile
            icon={Trash2} label="GC queue" color={stats && stats.gcQueue > 1000 ? '#f59e0b' : '#8b5cf6'} loading={!stats}
            value={stats ? stats.gcQueue : '—'}
            hint="Blobs waiting to be collected"
          />
        </div>
      </section>

      <section>
        <GroupHeading>Instances</GroupHeading>
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile icon={Database} label="Active"       value={stats ? stats.instances.active : '—'}  color="#10b981" loading={!stats} hint="Instances in normal use" />
          <StatTile icon={Archive}  label="In the trash" value={stats ? stats.instances.trashed : '—'} color="#8b5cf6" loading={!stats} hint="Deleted, still recoverable" />
          <StatTile
            icon={TriangleAlert} label="Never pulled elsewhere" loading={!stats}
            value={stats ? stats.instances.neverPulledElsewhere : '—'}
            color={stats && stats.instances.neverPulledElsewhere > 0 ? '#f59e0b' : '#3f3f3f'}
            hint="These run into the 15 day rule"
          />
        </div>
      </section>

      <Panel
        title="Maintenance jobs"
        description={jobs?.expiry
          ? `Expiry after ${jobs.expiry.policy.expiryDays} days · dry run ${jobs.expiry.dryRun ? 'ON' : 'OFF'}`
          : 'Loading job configuration…'}
        actions={<Button icon={RefreshCw} onClick={load}>Reload</Button>}
      >
        {expiryLive && (
          <p className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.08] p-3.5 text-xs leading-relaxed text-red-300">
            <TriangleAlert className="mt-px h-4 w-4 shrink-0" />
            The expiry job is live. It permanently removes cloud instances that no second PC ever pulled.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {JOBS.map(job => (
            <div key={job.mode} className="flex flex-col gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div>
                <p className="text-sm font-bold text-white">{job.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-white/[0.34]">{job.hint}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => runJob(job, true)}>
                  Dry run
                </Button>
                <Button size="sm" variant="danger" icon={Play} disabled={busy !== null} onClick={() => runJob(job, false)}>
                  Run for real
                </Button>
              </div>
            </div>
          ))}
        </div>

        {output && (
          <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.06] bg-black/40">
            <p className="border-b border-white/[0.06] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
              {output.job}
            </p>
            <pre className="max-h-52 overflow-auto p-3.5 text-[11px] leading-relaxed text-white/50">{output.result}</pre>
          </div>
        )}
      </Panel>

      <Panel
        title="Accounts by storage"
        description="The 50 accounts using the most cloud storage."
        actions={<SearchField value={query} onChange={setQuery} placeholder="Username…" />}
      >
        {filteredUsers.length === 0 ? (
          <EmptyState
            icon={HardDrive}
            title={users.length === 0 ? 'No cloud data yet' : 'No match'}
            message={users.length === 0 ? 'Accounts appear here once they sync something to Lux Cloud.' : 'Try a different username.'}
          />
        ) : (
          <Table columns={USER_COLUMNS}>
            {filteredUsers.map(user => {
              const percent = user.quotaBytes > 0 ? Math.round((user.usedBytes / user.quotaBytes) * 100) : 0
              return (
                <Row key={user.id} className={user.cloudBanned ? 'bg-red-500/[0.04]' : ''}>
                  <Cell>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{user.username}</span>
                      {user.cloudBanned && <Badge tone="danger">Cloud banned</Badge>}
                    </div>
                    {user.cloudBanned && user.cloudBanReason && (
                      <p className="mt-0.5 text-[11px] text-white/30">{user.cloudBanReason}</p>
                    )}
                  </Cell>
                  <Cell>
                    <div className="flex items-center gap-2.5">
                      <span className="w-20 shrink-0 tabular-nums text-white/70">{formatBytes(user.usedBytes)}</span>
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.07]">
                        <span
                          className={`block h-full rounded-full ${percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${Math.min(percent, 100)}%` }}
                        />
                      </span>
                      <span className={`text-[11px] tabular-nums ${percent > 90 ? 'text-red-400' : 'text-white/30'}`}>{percent}%</span>
                    </div>
                  </Cell>
                  <Cell><span className="tabular-nums text-white/50">{user.instanceCount} / {user.maxInstances}</span></Cell>
                  <Cell><span className="text-xs text-white/30">{user.lastActivity ? new Date(user.lastActivity).toLocaleDateString() : '—'}</span></Cell>
                  <Cell align="right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setQuota(user)}>Quota</Button>
                      {user.cloudBanned ? (
                        <Button size="sm" variant="success" icon={UserCheck} disabled={busy === `ban-${user.id}`} onClick={() => toggleBan(user, false)}>
                          Unban
                        </Button>
                      ) : (
                        <Button size="sm" variant="danger" icon={Ban} onClick={() => { setBanTarget(user); setBanReason('') }}>
                          Ban
                        </Button>
                      )}
                    </div>
                  </Cell>
                </Row>
              )
            })}
          </Table>
        )}
      </Panel>

      <Modal
        open={!!banTarget}
        onClose={() => setBanTarget(null)}
        title={`Disable Lux Cloud for ${banTarget?.username}?`}
        description="All devices are signed out immediately and the account can no longer use cloud sync. Existing cloud data is kept, and local instances on their PCs are not touched."
        footer={(
          <>
            <Button size="lg" variant="ghost" onClick={() => setBanTarget(null)}>Cancel</Button>
            <Button
              size="lg" variant="solid" icon={Ban}
              disabled={busy === `ban-${banTarget?.id}`}
              onClick={() => toggleBan(banTarget, true)}
            >
              Disable cloud
            </Button>
          </>
        )}
      >
        <Field label="Reason" hint="Shown to the user when they try to sync.">
          <TextInput value={banReason} onChange={setBanReason} placeholder="Why is cloud access being disabled?" />
        </Field>
      </Modal>
    </div>
  )
}
