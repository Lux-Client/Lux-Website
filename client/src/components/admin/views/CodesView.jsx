import { useEffect, useMemo, useState } from 'react'
import { Code2, Download, Eye, FileArchive, Loader2, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import { Badge, Button, Cell, EmptyState, Modal, Panel, Row, SearchField, Table } from '../ui'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

const SOURCE_TONES = { modrinth: 'success', curseforge: 'warning', unknown: 'neutral' }
const SOURCE_LABELS = { modrinth: 'Modrinth', curseforge: 'CurseForge', unknown: 'unknown' }

function ScanBadge({ scan }) {
  const status = scan?.status || 'pending'
  if (status === 'clean') return <Badge tone="success"><ShieldCheck className="h-3 w-3" /> clean</Badge>
  if (status === 'infected') return <Badge tone="danger"><ShieldAlert className="h-3 w-3" /> blocked</Badge>
  return <Badge tone="neutral">not scanned yet</Badge>
}

function ContentList({ title, items }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">{title} ({items.length})</p>
      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {items.map((item, index) => (
          <div key={`${item.projectId || item.fileName}-${index}`} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-white/80" title={item.fileName || ''}>{item.title}</span>
            <Badge tone={SOURCE_TONES[item.source] || 'neutral'}>{SOURCE_LABELS[item.source] || item.source}</Badge>
          </div>
        ))}
      </div>
    </div>
  )
}

function CodeDetails({ code, onClose }) {
  const [state, setState] = useState({ loading: true, data: null, error: '' })

  useEffect(() => {
    if (!code) return undefined
    let cancelled = false
    setState({ loading: true, data: null, error: '' })
    fetch(`/api/codes/${encodeURIComponent(code)}/details`, { credentials: 'same-origin' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok || !body.success) throw new Error(body.error || 'Could not load the code')
        if (!cancelled) setState({ loading: false, data: body.data, error: '' })
      })
      .catch((err) => { if (!cancelled) setState({ loading: false, data: null, error: err.message }) })
    return () => { cancelled = true }
  }, [code])

  const data = state.data
  return (
    <Modal
      open={Boolean(code)}
      onClose={onClose}
      width="max-w-2xl"
      title={data ? `${data.code} · ${data.name}` : code}
      description={data
        ? `${data.version || '?'} · ${data.loader || '?'} · ${data.uses || 0} uses · created by ${data.owner ? data.owner.username : (data.ownerUuid ? `Minecraft ${data.ownerUuid}` : `guest ${data.ownerIp || ''}`)}`
        : undefined}
    >
      {state.loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading...
        </div>
      )}
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {data && (
        <div className="max-h-[65vh] space-y-5 overflow-y-auto">
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white/35">
              Uploaded own files ({data.uploads.length})
            </p>
            {data.uploads.length === 0 ? (
              <p className="text-xs text-white/35">None. Everything in this code comes from Modrinth or CurseForge.</p>
            ) : (
              <div className="space-y-1">
                {data.uploads.map((file) => (
                  <div key={file.sha256} className="flex items-center gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2">
                    <FileArchive className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white/85">{file.fileName}</p>
                      <p className="truncate font-mono text-[10px] text-white/30" title={file.sha256}>
                        {file.kind} · {formatBytes(file.size)} · sha256 {file.sha256.slice(0, 16)}…
                        {file.scan?.reason ? ` · ${file.scan.reason}` : ''}
                        {file.scan?.engine ? ` · ${file.scan.engine}` : ''}
                      </p>
                    </div>
                    <ScanBadge scan={file.scan} />
                    {file.scan?.status !== 'infected' && (
                      <a
                        href={file.downloadUrl}
                        className="shrink-0 rounded-lg p-1.5 text-white/35 transition hover:bg-white/[0.06] hover:text-white"
                        title="Download for inspection"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <ContentList title="Mods" items={data.mods} />
          <ContentList title="Resource packs" items={data.resourcePacks} />
          <ContentList title="Shaders" items={data.shaders} />
          <p className="text-xs text-white/35">Game settings (options.txt): {data.hasSettings ? 'included' : 'not included'}</p>
        </div>
      )}
    </Modal>
  )
}

const COLUMNS = [
  { label: 'Code' },
  { label: 'Modpack' },
  { label: 'Target' },
  { label: 'Content' },
  { label: 'Uses' },
  { label: 'Expires' },
  { label: '', align: 'right' },
]

export default function CodesView({ codes, onRefresh, onDelete }) {
  const [query, setQuery] = useState('')
  const [openCode, setOpenCode] = useState(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return codes
    return codes.filter(c =>
      [c.code, c.name, c.version, c.loader].some(v => String(v || '').toLowerCase().includes(q)),
    )
  }, [codes, query])

  return (
    <Panel
      title={`${codes.length} active code${codes.length === 1 ? '' : 's'}`}
      description="Codes stop working once they expire."
      actions={
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Code, modpack, version…" />
          <Button icon={RefreshCw} onClick={onRefresh}>Refresh</Button>
        </>
      }
    >
      {codes.length === 0 ? (
        <EmptyState icon={Code2} title="No active codes" message="Share codes created in Lux Client show up here until they expire." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Code2} title="No match" message={`Nothing matches “${query}”.`} />
      ) : (
        <Table columns={COLUMNS}>
          {filtered.map(code => {
            const expired = code.expires && new Date(code.expires).getTime() < Date.now()
            return (
              <Row key={code.code}>
                <Cell><span className="font-mono text-sm font-black tracking-wider text-primary">{code.code}</span></Cell>
                <Cell>
                  <span className="text-white/80">{code.name || '—'}</span>
                  {code.live && <Badge tone="success" className="ml-2">Live · rev {code.revision || 1}</Badge>}
                </Cell>
                <Cell>
                  <span className="text-xs text-white/50">
                    {code.version || '?'} <span className="text-white/20">·</span> {code.loader || '?'}
                  </span>
                </Cell>
                <Cell>
                  <span className="tabular-nums text-xs text-white/60">{code.contentCount || 0} items</span>
                  {code.uploadCount > 0 && <Badge tone="warning" className="ml-2">{code.uploadCount} own</Badge>}
                </Cell>
                <Cell><span className="tabular-nums text-white/70">{code.uses || 0}</span></Cell>
                <Cell>
                  {code.expires
                    ? <Badge tone={expired ? 'danger' : 'neutral'}>{new Date(code.expires).toLocaleDateString()}</Badge>
                    : <Badge tone="success">Never</Badge>}
                </Cell>
                <Cell align="right">
                  <Button size="sm" icon={Eye} onClick={() => setOpenCode(code.code)} className="mr-2">
                    View
                  </Button>
                  <Button
                    size="sm" variant="danger" icon={Trash2}
                    onClick={() => onDelete(code.code)}
                  >
                    Delete
                  </Button>
                </Cell>
              </Row>
            )
          })}
        </Table>
      )}
      <CodeDetails code={openCode} onClose={() => setOpenCode(null)} />
    </Panel>
  )
}
