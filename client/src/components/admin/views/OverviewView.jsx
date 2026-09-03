import {
  BarChart2, CheckCircle2, Cloud, Download, FileText, Flag, Lock,
  RefreshCw, ShieldCheck, Tag, TrendingUp, Users as UsersIcon, Wifi, Wrench,
} from 'lucide-react'
import { Badge, Button, EmptyState, GroupHeading, LiveDot, Panel, Sparkline, StatTile, Switch } from '../ui'

/* The landing view. Three questions, in order: is anything waiting on me, how
   is the platform doing right now, and is the system in a sane state. */

function AttentionRow({ icon: Icon, label, hint, count, color, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 text-left transition-all hover:border-white/[0.14] hover:bg-white/[0.04]"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: color + '1f', color }}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-white">{label}</span>
        <span className="block text-xs text-white/[0.34]">{hint}</span>
      </span>
      <span className="text-xl font-black tabular-nums" style={{ color }}>{count}</span>
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/25 transition-colors group-hover:text-white">
        Review
      </span>
    </button>
  )
}

export default function OverviewView({
  isSessionAdmin, canTools, liveStats, activity, todaysLaunches, totalDownloads,
  uniqueMachines, counts, socketStatus, maintenanceMode, onToggleMaintenance,
  passwordVerified, role, onNavigate,
}) {
  const queue = [
    { id: 'extensions', icon: ShieldCheck, label: 'Extension submissions', hint: 'New marketplace uploads awaiting review', count: counts.extensions, color: '#e27602', tab: 'moderation' },
    { id: 'versions',   icon: Tag,         label: 'Version uploads',       hint: 'New builds for approved projects',        count: counts.versions,   color: '#3b82f6', tab: 'moderation' },
    { id: 'drafts',     icon: FileText,    label: 'Metadata drafts',       hint: 'Creator-submitted metadata changes',      count: counts.drafts,     color: '#8b5cf6', tab: 'moderation' },
    { id: 'reports',    icon: Flag,        label: 'User reports',          hint: 'Content flagged by the community',        count: counts.reports,    color: '#ef4444', tab: 'moderation' },
  ].filter(item => item.count > 0)

  return (
    <div className="flex flex-col gap-8">

      {canTools && (
        <section>
          <GroupHeading hint={socketStatus === 'connected' ? 'Updating in realtime' : 'Waiting for the realtime feed'}>
            Right now
          </GroupHeading>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col justify-between gap-3 overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.09] to-transparent p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                  <Wifi className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/[0.34]">Active users</span>
                <LiveDot className="ml-auto" />
              </div>
              <p className="text-[28px] font-black leading-none tracking-tight text-white tabular-nums">
                {liveStats.activeUsers || 0}
              </p>
              <Sparkline data={activity.active} color="#10b981" />
            </div>

            <div className="flex flex-col justify-between gap-3 overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/[0.09] to-transparent p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400">
                  <Download className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/[0.34]">In game</span>
                <LiveDot className="ml-auto" />
              </div>
              <p className="text-[28px] font-black leading-none tracking-tight text-white tabular-nums">
                {liveStats.playingUsers || 0}
              </p>
              <Sparkline data={activity.playing} color="#3b82f6" />
            </div>

            <StatTile
              icon={BarChart2} label="Launches today" value={todaysLaunches}
              hint="Client starts since midnight" color="#e27602"
            />
            <StatTile
              icon={TrendingUp} label="Total downloads" value={totalDownloads.toLocaleString()}
              hint={`${uniqueMachines.toLocaleString()} unique machines seen`} color="#f59e0b"
              onClick={() => onNavigate('analytics')}
            />
          </div>
        </section>
      )}

      {isSessionAdmin && (
        <section>
          <GroupHeading hint={queue.length ? `${queue.reduce((s, i) => s + i.count, 0)} open item(s)` : undefined}>
            Needs attention
          </GroupHeading>
          {queue.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Everything is reviewed"
              message="No pending submissions, versions, drafts or reports. New items land here as soon as they arrive."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {queue.map(item => (
                <AttentionRow key={item.id} {...item} onOpen={() => onNavigate(item.tab)} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className="grid items-start gap-4 lg:grid-cols-3">
        <Panel
          title="System"
          description="Access level and services backing this session."
          className="lg:col-span-2"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: Lock,      label: 'Master password', value: passwordVerified ? 'Unlocked' : 'Not used', tone: passwordVerified ? 'success' : 'neutral' },
              { icon: UsersIcon, label: 'Session role',    value: role || 'guest',                            tone: role === 'admin' ? 'primary' : 'neutral' },
              { icon: Wifi,      label: 'Realtime feed',   value: socketStatus,                               tone: socketStatus === 'connected' ? 'success' : socketStatus === 'error' ? 'danger' : 'warning' },
              { icon: Wrench,    label: 'Maintenance',     value: maintenanceMode ? 'Enabled' : 'Disabled',   tone: maintenanceMode ? 'warning' : 'success' },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-3">
                <row.icon className="h-4 w-4 shrink-0 text-white/25" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/50">{row.label}</span>
                <Badge tone={row.tone}>{row.value}</Badge>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Quick actions" description="The switches you reach for most.">
          <div className="flex flex-col gap-3">
            {canTools && (
              <Switch
                checked={maintenanceMode}
                onChange={onToggleMaintenance}
                tone="warning"
                label="Maintenance mode"
                description={maintenanceMode ? 'The website is closed to visitors.' : 'The website is open to everyone.'}
              />
            )}
            {isSessionAdmin && (
              <>
                <Button size="lg" variant="ghost" icon={UsersIcon} onClick={() => onNavigate('users')} className="justify-start">
                  Manage users
                </Button>
                <Button size="lg" variant="ghost" icon={Cloud} onClick={() => onNavigate('cloud')} className="justify-start">
                  Lux Cloud storage
                </Button>
              </>
            )}
            {canTools && (
              <Button size="lg" variant="ghost" icon={RefreshCw} onClick={() => onNavigate('analytics')} className="justify-start">
                Open analytics
              </Button>
            )}
          </div>
        </Panel>
      </section>
    </div>
  )
}
