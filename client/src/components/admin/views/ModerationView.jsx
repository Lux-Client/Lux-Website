import { useState } from 'react'
import { Check, CheckCircle2, Flag, MessageSquare, Undo2, X } from 'lucide-react'
import { Badge, EmptyState, Panel, SegmentedControl } from '../ui'
import { FileInspector, ModerationCard } from '../ModerationCard'
import { fixPath } from '../../../hooks/useAuth'

/* The four queues used to be four stacked cards on one very long page, so the
   size of the backlog was invisible until you scrolled. One queue at a time,
   with the counts up front. */

export default function ModerationView({
  reports, extensions, versions, drafts,
  onModerateReport, onModerateExtension, onModerateVersion, onModerateDraft,
}) {
  const [queue, setQueue] = useState('extensions')

  const tabs = [
    { id: 'extensions', label: 'Extensions', count: extensions.length },
    { id: 'versions',   label: 'Versions',   count: versions.length },
    { id: 'drafts',     label: 'Drafts',     count: drafts.length },
    { id: 'reports',    label: 'Reports',    count: reports.length },
  ]

  const meta = {
    extensions: { title: 'Extension submissions', description: 'New marketplace uploads. Inspect the file before approving — approval publishes it to every user.' },
    versions:   { title: 'Version uploads',       description: 'Additional builds for already approved projects. Inspect the file before approving.' },
    drafts:     { title: 'Metadata drafts',       description: 'Creator-submitted changes to name, description or images of a published project.' },
    reports:    { title: 'User reports',          description: 'Content flagged by the community. Act on it in the relevant queue, then resolve or dismiss here.' },
  }[queue]

  return (
    <div className="flex flex-col gap-5">
      <SegmentedControl items={tabs} value={queue} onChange={setQueue} />

      <Panel title={meta.title} description={meta.description}>
        {queue === 'extensions' && (
          extensions.length === 0
            ? <EmptyState icon={CheckCircle2} title="Queue is empty" message="New extension submissions appear here for review." />
            : <div className="flex flex-col gap-2.5">
                {extensions.map(item => (
                  <ModerationCard
                    key={item.id}
                    image={fixPath(item.banner_path)}
                    title={item.name}
                    subtitle={item.developer || 'Unknown developer'}
                    meta={item.identifier}
                    actions={[
                      { label: 'Approve',      icon: Check, tone: 'primary', onClick: () => onModerateExtension(item, 'approve') },
                      { label: 'Action needed',              onClick: () => onModerateExtension(item, 'action_required') },
                      { label: 'Reject',       icon: X, tone: 'danger',      onClick: () => onModerateExtension(item, 'reject') },
                    ]}
                  >
                    <FileInspector filePath={item.file_path} />
                  </ModerationCard>
                ))}
              </div>
        )}

        {queue === 'versions' && (
          versions.length === 0
            ? <EmptyState icon={CheckCircle2} title="Queue is empty" message="New version uploads for approved projects appear here." />
            : <div className="flex flex-col gap-2.5">
                {versions.map(item => (
                  <ModerationCard
                    key={item.id}
                    title={item.extension_name}
                    subtitle={item.developer || 'Unknown developer'}
                    badge={<Badge tone="info">v{item.version}</Badge>}
                    actions={[
                      { label: 'Approve', icon: Check, tone: 'primary', onClick: () => onModerateVersion(item, 'approve') },
                      { label: 'Reject',  icon: X,     tone: 'danger',  onClick: () => onModerateVersion(item, 'reject') },
                    ]}
                  >
                    <FileInspector filePath={item.file_path} />
                  </ModerationCard>
                ))}
              </div>
        )}

        {queue === 'drafts' && (
          drafts.length === 0
            ? <EmptyState icon={CheckCircle2} title="Queue is empty" message="Metadata change requests appear here." />
            : <div className="flex flex-col gap-2.5">
                {drafts.map(item => (
                  <ModerationCard
                    key={item.id}
                    title={item.original_name}
                    subtitle={item.developer || 'Unknown developer'}
                    actions={[
                      { label: 'Approve', icon: Check, tone: 'primary', onClick: () => onModerateDraft(item, 'approve') },
                      { label: 'Reject',  icon: X,     tone: 'danger',  onClick: () => onModerateDraft(item, 'reject') },
                    ]}
                  />
                ))}
              </div>
        )}

        {queue === 'reports' && (
          reports.length === 0
            ? <EmptyState icon={Flag} title="No open reports" message="Reports filed by users land here." />
            : <div className="flex flex-col gap-2.5">
                {reports.map(item => {
                  const isComment = item.target_type === 'comment'
                  return (
                    <ModerationCard
                      key={item.id}
                      title={isComment ? `Comment on “${item.comment_extension_name || 'Unknown'}”` : (item.extension_name || 'Unknown extension')}
                      subtitle={`Reported by ${item.reporter_username}`}
                      badge={<Badge tone="warning">{item.reason}</Badge>}
                      actions={[
                        { label: 'Resolve', icon: Check, tone: 'primary', onClick: () => onModerateReport(item, 'resolve') },
                        { label: 'Dismiss', icon: Undo2,                  onClick: () => onModerateReport(item, 'dismiss') },
                      ]}
                    >
                      {isComment && item.comment_content && (
                        <blockquote className="mt-3 flex gap-2.5 rounded-xl border border-white/[0.06] bg-black/30 p-3.5 text-xs leading-relaxed text-white/55">
                          <MessageSquare className="mt-px h-3.5 w-3.5 shrink-0 text-white/20" />
                          {item.comment_content}
                        </blockquote>
                      )}
                    </ModerationCard>
                  )
                })}
              </div>
        )}
      </Panel>
    </div>
  )
}
