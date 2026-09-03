import { useMemo, useState } from 'react'
import { Ban, RefreshCw, ShieldMinus, ShieldPlus, TriangleAlert, UserCheck, Users as UsersIcon } from 'lucide-react'
import { Badge, Button, EmptyState, Panel, SearchField, SegmentedControl } from '../ui'
import { ModerationCard } from '../ModerationCard'
import { fixPath } from '../../../hooks/useAuth'

const FILTERS = [
  { id: 'all',    label: 'All' },
  { id: 'admin',  label: 'Admins' },
  { id: 'banned', label: 'Banned' },
]

export default function UsersView({ users, onRefresh, onModerate }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')

  const counts = useMemo(() => ({
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    banned: users.filter(u => u.banned).length,
  }), [users])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter(user => {
      if (filter === 'admin' && user.role !== 'admin') return false
      if (filter === 'banned' && !user.banned) return false
      if (!q) return true
      return [user.username, user.email, user.role].some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [users, query, filter])

  return (
    <Panel
      title={`${users.length} account${users.length === 1 ? '' : 's'}`}
      description="Warnings and bans are written to the audit log."
      actions={
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Username or email…" />
          <Button icon={RefreshCw} onClick={onRefresh}>Refresh</Button>
        </>
      }
    >
      <div className="mb-4">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          items={FILTERS.map(f => ({ ...f, count: counts[f.id] }))}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title={users.length === 0 ? 'No accounts yet' : 'No match'}
          message={users.length === 0 ? 'Accounts appear here once people sign in with Google.' : 'Try a different search or filter.'}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map(user => (
            <ModerationCard
              key={user.id}
              image={fixPath(user.avatar)}
              title={user.username}
              subtitle={user.email || 'No email on file'}
              badge={
                <>
                  {user.role === 'admin' && <Badge tone="primary">Admin</Badge>}
                  {user.banned && <Badge tone="danger">Banned</Badge>}
                </>
              }
              actions={[
                { label: 'Warn', icon: TriangleAlert, onClick: () => onModerate(user, 'warn') },
                user.banned
                  ? { label: 'Unban', icon: UserCheck, tone: 'success', onClick: () => onModerate(user, 'unban') }
                  : { label: 'Ban',   icon: Ban,       tone: 'danger',  onClick: () => onModerate(user, 'ban') },
                user.role === 'admin'
                  ? { label: 'Revoke admin', icon: ShieldMinus, tone: 'danger',  onClick: () => onModerate(user, 'demote') }
                  : { label: 'Make admin',   icon: ShieldPlus,                   onClick: () => onModerate(user, 'promote') },
              ]}
            />
          ))}
        </div>
      )}
    </Panel>
  )
}
