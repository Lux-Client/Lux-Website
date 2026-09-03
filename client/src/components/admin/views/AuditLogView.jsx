import { useMemo, useState } from 'react'
import { History, RefreshCw } from 'lucide-react'
import { Badge, Button, Cell, EmptyState, Panel, Row, SearchField, Table } from '../ui'

const COLUMNS = [
  { label: 'When' },
  { label: 'Admin' },
  { label: 'Action' },
  { label: 'Target' },
  { label: 'Details' },
]

/* Approvals read green, removals read red — scanning the log for "who deleted
   that" should not mean reading every row. */
function actionTone(action = '') {
  if (/approve|resolve|unban|restore|promote/.test(action)) return 'success'
  if (/reject|ban|delete|remove|demote/.test(action))       return 'danger'
  if (/warn|action_required|dismiss/.test(action))          return 'warning'
  return 'neutral'
}

export default function AuditLogView({ entries, loaded, onRefresh }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(e =>
      [e.admin_label, e.action, e.target_type, e.details].some(v => String(v || '').toLowerCase().includes(q)),
    )
  }, [entries, query])

  return (
    <Panel
      title={`${entries.length} recorded action${entries.length === 1 ? '' : 's'}`}
      description="Newest first, up to the last 200."
      actions={
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Admin, action, target…" />
          <Button icon={RefreshCw} onClick={onRefresh}>Refresh</Button>
        </>
      }
    >
      {!loaded ? (
        <EmptyState icon={History} title="Loading…" message="Fetching the most recent admin actions." />
      ) : entries.length === 0 ? (
        <EmptyState icon={History} title="Nothing recorded yet" message="Moderation actions are written here as they happen." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={History} title="No match" message={`Nothing matches “${query}”.`} />
      ) : (
        <Table columns={COLUMNS}>
          {filtered.map(entry => (
            <Row key={entry.id}>
              <Cell className="whitespace-nowrap text-xs text-white/[0.32]">
                {new Date(entry.created_at).toLocaleString()}
              </Cell>
              <Cell><span className="font-semibold text-white">{entry.admin_label}</span></Cell>
              <Cell><Badge tone={actionTone(entry.action)}>{entry.action}</Badge></Cell>
              <Cell>
                <span className="text-xs text-white/50">{entry.target_type} <span className="font-mono text-white/30">#{entry.target_id}</span></span>
              </Cell>
              <Cell className="max-w-xs"><span className="line-clamp-2 text-xs text-white/[0.32]">{entry.details || '—'}</span></Cell>
            </Row>
          ))}
        </Table>
      )}
    </Panel>
  )
}
