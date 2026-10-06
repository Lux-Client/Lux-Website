import { useState } from 'react'
import { Check, CheckCircle2, Flag, MessageSquare, Trash2, Undo2, X } from 'lucide-react'
import { Badge, EmptyState, Panel, SegmentedControl } from '../ui'
import { FileInspector, ModerationCard } from '../ModerationCard'
import { fixPath } from '../../../hooks/useAuth'
import { CapePreview } from '../../../pages/Capes'

/* The four queues used to be four stacked cards on one very long page, so the
   size of the backlog was invisible until you scrolled. One queue at a time,
   with the counts up front. */

export default function ModerationView({
  reports, extensions, versions, drafts,
  onModerateReport, onModerateExtension, onModerateVersion, onModerateDraft,
  luxCapes = [], luxImages = [], liveCapes = [], onModerateLuxCape, onModerateLuxImage,
}) {
  const [queue, setQueue] = useState('extensions')

  const tabs = [
    { id: 'extensions', label: 'Extensions', count: extensions.length },
    { id: 'versions',   label: 'Versions',   count: versions.length },
    { id: 'drafts',     label: 'Drafts',     count: drafts.length },
    { id: 'reports',    label: 'Reports',    count: reports.length },
    { id: 'capes',      label: 'Capes',      count: luxCapes.length + luxImages.length },
  ]

  const meta = {
    extensions: { title: 'Extension submissions', description: 'New marketplace uploads. Inspect the file before approving — approval publishes it to every user.' },
    versions:   { title: 'Version uploads',       description: 'Additional builds for already approved projects. Inspect the file before approving.' },
    drafts:     { title: 'Metadata drafts',       description: 'Creator-submitted changes to name, description or images of a published project.' },
    reports:    { title: 'User reports',          description: 'Content flagged by the community. Act on it in the relevant queue, then resolve or dismiss here.' },
    capes:      { title: 'Lux Client capes',      description: 'Cape pictures for the Lux Client mod. Nothing is visible to other players until it is approved here — reject anything sexual, violent, hateful or stolen.' },
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

        {queue === 'capes' && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/35">Marketplace uploads</p>
              {luxCapes.length === 0
                ? <EmptyState icon={CheckCircle2} title="Queue is empty" message="Capes uploaded to the marketplace appear here." />
                : <div className="flex flex-col gap-2.5">
                    {luxCapes.map(item => (
                      <ModerationCard
                        key={item.id}
                        title={item.title}
                        subtitle={`by ${item.author}`}
                        meta={`${item.width}×${item.height} px`}
                        actions={[
                          { label: 'Approve', icon: Check, tone: 'primary', onClick: () => onModerateLuxCape(item, 'approve') },
                          { label: 'Reject',  icon: X,     tone: 'danger',  onClick: () => onModerateLuxCape(item, 'reject') },
                        ]}
                      >
                        <CapeEvidence src={item.image} />
                      </ModerationCard>
                    ))}
                  </div>}
            </div>

            <div>
              <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/35">Own pictures from the game</p>
              {luxImages.length === 0
                ? <EmptyState icon={CheckCircle2} title="Queue is empty" message="Pictures players choose as their cape in the mod appear here." />
                : <div className="flex flex-col gap-2.5">
                    {luxImages.map(item => (
                      <ModerationCard
                        key={item.hash}
                        title={item.player || 'Unknown player'}
                        subtitle={item.account ? `Website account: ${item.account}` : 'No website account linked'}
                        meta={`${item.width}×${item.height} px`}
                        actions={[
                          { label: 'Approve', icon: Check, tone: 'primary', onClick: () => onModerateLuxImage(item, 'approve') },
                          { label: 'Reject',  icon: X,     tone: 'danger',  onClick: () => onModerateLuxImage(item, 'reject') },
                        ]}
                      >
                        <CapeEvidence src={item.image} />
                      </ModerationCard>
                    ))}
                  </div>}
            </div>

            {liveCapes.length > 0 && (
              <div>
                <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/35">Published capes ({liveCapes.length})</p>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {liveCapes.map(item => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <CapePreview src={item.image} className="!h-12 !w-[30px] shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{item.title}</p>
                        <p className="truncate text-xs text-white/40">by {item.author} · worn {item.uses}×</p>
                      </div>
                      <button type="button" title="Remove from the marketplace" onClick={() => onModerateLuxCape(item, 'reject')}
                        className="text-white/25 transition-colors hover:text-red-400">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

/* The cape as players will see it, next to the whole uploaded picture. */
function CapeEvidence({ src }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-white/[0.05] pt-3">
      <div className="grid place-items-center rounded-xl bg-black/30 p-3"><CapePreview src={src} /></div>
      <a href={src} target="_blank" rel="noopener noreferrer" className="block">
        <img src={src} alt="" className="h-36 w-auto max-w-[288px] object-contain rounded-lg border border-white/[0.06] bg-[repeating-conic-gradient(#222_0_25%,#2c2c2c_0_50%)] bg-[length:16px_16px]" style={{ imageRendering: 'pixelated' }} />
      </a>
    </div>
  )
}
