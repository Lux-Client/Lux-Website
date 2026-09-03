import { useMemo, useState } from 'react'
import { Code2, RefreshCw, Trash2 } from 'lucide-react'
import { Badge, Button, Cell, EmptyState, Panel, Row, SearchField, Table } from '../ui'

const COLUMNS = [
  { label: 'Code' },
  { label: 'Modpack' },
  { label: 'Target' },
  { label: 'Uses' },
  { label: 'Expires' },
  { label: '', align: 'right' },
]

export default function CodesView({ codes, onRefresh, onDelete }) {
  const [query, setQuery] = useState('')

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
        <EmptyState icon={Code2} title="No active codes" message="Share codes created in the modpack editor show up here until they expire." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Code2} title="No match" message={`Nothing matches “${query}”.`} />
      ) : (
        <Table columns={COLUMNS}>
          {filtered.map(code => {
            const expired = code.expires && new Date(code.expires).getTime() < Date.now()
            return (
              <Row key={code.code}>
                <Cell><span className="font-mono text-sm font-black tracking-wider text-primary">{code.code}</span></Cell>
                <Cell><span className="text-white/80">{code.name || '—'}</span></Cell>
                <Cell>
                  <span className="text-xs text-white/50">
                    {code.version || '?'} <span className="text-white/20">·</span> {code.loader || '?'}
                  </span>
                </Cell>
                <Cell><span className="tabular-nums text-white/70">{code.uses || 0}</span></Cell>
                <Cell>
                  {code.expires
                    ? <Badge tone={expired ? 'danger' : 'neutral'}>{new Date(code.expires).toLocaleDateString()}</Badge>
                    : <Badge tone="success">Never</Badge>}
                </Cell>
                <Cell align="right">
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
    </Panel>
  )
}
