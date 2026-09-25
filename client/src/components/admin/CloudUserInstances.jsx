import { useCallback, useEffect, useState } from 'react'
import { Archive, Database, RefreshCw, Trash2 } from 'lucide-react'
import { Badge, Button, Cell, EmptyState, Modal, Row, Table } from './ui'
import { useToast } from './feedback'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '—'
}

const COLUMNS = [
  { label: 'Instance' },
  { label: 'Status' },
  { label: 'Size' },
  { label: 'Revisions' },
  { label: 'Last activity' },
  { label: '', align: 'right' },
]

// Cloud-Instanzen eines Kontos, mit endgueltigem Loeschen. Der Papierkorb des Nutzers
// behaelt eine Instanz noch Tage lang; hier ist sie sofort und unwiderruflich weg.
export default function CloudUserInstances({ user, onClose, onChanged }) {
  const toast = useToast()

  const [instances, setInstances] = useState(null)
  const [error,     setError]     = useState(null)
  const [armed,     setArmed]     = useState(null)
  const [busy,      setBusy]      = useState(null)

  const load = useCallback(async () => {
    if (!user) return
    setError(null)
    try {
      const res = await fetch(`/api/admin/cloud/instances?userId=${user.id}`, { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Could not load instances')
      setInstances(data.instances || [])
    } catch (err) {
      setError(err.message)
      setInstances([])
    }
  }, [user])

  useEffect(() => {
    setInstances(null)
    setArmed(null)
    load()
  }, [load])

  const remove = async instance => {
    setBusy(instance.id)
    try {
      const res = await fetch(`/api/admin/cloud/instances/${instance.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Delete failed')
      toast.success(`“${instance.name}” deleted`, `${data.revisionsRemoved} revision(s) removed from the cloud.`)
      setArmed(null)
      await load()
      onChanged?.()
    } catch (err) {
      toast.error('Could not delete the instance', err.message)
    } finally {
      setBusy(null)
    }
  }

  const totalBytes = (instances || []).reduce((sum, instance) => sum + instance.logicalBytes, 0)

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      width="max-w-4xl"
      title={`Cloud instances of ${user?.username || ''}`}
      description={instances
        ? `${instances.length} instance(s) · ${formatBytes(totalBytes)} · deleting here is permanent and skips the trash.`
        : 'Loading…'}
      footer={(
        <>
          <Button size="lg" variant="ghost" icon={RefreshCw} onClick={load}>Reload</Button>
          <Button size="lg" variant="ghost" onClick={onClose}>Close</Button>
        </>
      )}
    >
      <div className="max-h-[60vh] overflow-y-auto">
        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        {instances && instances.length === 0 ? (
          <EmptyState icon={Database} title="No cloud instances" message="This account has nothing in Lux Cloud." />
        ) : (
          <Table columns={COLUMNS}>
            {(instances || []).map(instance => (
              <Row key={instance.id}>
                <Cell>
                  <p className="font-semibold text-white">{instance.name}</p>
                  <p className="mt-0.5 text-[11px] text-white/30">
                    {[instance.mcVersion, instance.loader, instance.loaderVersion].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-white/20">{instance.instanceUuid}</p>
                </Cell>
                <Cell>
                  {instance.status === 'trashed' ? (
                    <Badge tone="warning"><Archive className="h-3 w-3" />Trash</Badge>
                  ) : (
                    <Badge tone="success">Active</Badge>
                  )}
                </Cell>
                <Cell><span className="tabular-nums text-white/60">{formatBytes(instance.logicalBytes)}</span></Cell>
                <Cell>
                  <span className="tabular-nums text-white/60">v{instance.revision}</span>
                  <span className="ml-1 text-[11px] text-white/30">({instance.revisionCount})</span>
                </Cell>
                <Cell><span className="text-xs text-white/30">{formatDate(instance.lastTouchedAt)}</span></Cell>
                <Cell align="right">
                  {armed === instance.id ? (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" disabled={busy === instance.id} onClick={() => setArmed(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="danger" icon={Trash2} disabled={busy === instance.id} onClick={() => remove(instance)}>
                        {busy === instance.id ? 'Deleting…' : 'Delete forever'}
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="danger" icon={Trash2} disabled={busy !== null} onClick={() => setArmed(instance.id)}>
                      Delete
                    </Button>
                  )}
                </Cell>
              </Row>
            ))}
          </Table>
        )}
      </div>
    </Modal>
  )
}
