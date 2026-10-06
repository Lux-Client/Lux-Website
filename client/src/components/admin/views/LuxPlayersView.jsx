import { useEffect, useMemo, useState } from 'react'
import { Coins, Gift, Minus, Plus, RefreshCw, RotateCcw, Search, Trash2, UserRound } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Panel, TextInput } from '../ui'
import { useDialog, useToast } from '../feedback'

/* Lux Client players: Lux Credits (only handed out through giveaways), what they unlocked
   in the shop, and what they currently show to everybody (cosmetics, name style, second line). */

async function call(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

const fmt = n => Number(n || 0).toLocaleString()
const ago = ms => (ms ? new Date(ms).toLocaleString() : 'never')

const NAME_COLORS = ['Normal', 'Fixed colour', 'Gradient', 'Rainbow', 'Pulse', 'Sparkle', 'Fire', 'Ice']
const NAME_ANIMS = ['None', 'Wave', 'Bounce', 'Float', 'Shake']

function itemLabel(item) {
  const [kind, ...rest] = item.split(':')
  const id = rest.join(':')
  if (kind === 'name') {
    const [what, n] = id.split(':')
    if (what === 'color') return `Name colour: ${NAME_COLORS[Number(n)] || n}`
    if (what === 'anim') return `Name animation: ${NAME_ANIMS[Number(n)] || n}`
    if (what === 'bold') return 'Name: bold'
    if (what === 'line') return 'Name: second line (custom text)'
  }
  const kinds = { cosmetic: 'Cosmetic', emote: 'Emote' }
  return `${kinds[kind] || kind}: ${id.replace(/_/g, ' ')}`
}

export default function LuxPlayersView() {
  const toast = useToast()
  const dialog = useDialog()

  const [giveName, setGiveName] = useState('')
  const [giveAmount, setGiveAmount] = useState('')
  const [giveReason, setGiveReason] = useState('Giveaway')
  const [giving, setGiving] = useState(false)

  const [query, setQuery] = useState('')
  const [player, setPlayer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [prices, setPrices] = useState({})
  const [grantItem, setGrantItem] = useState('')

  useEffect(() => {
    call('/api/lux/admin/shop').then(d => setPrices(d.prices || {})).catch(() => {})
  }, [])

  const load = async (name = query) => {
    if (!name.trim()) return
    setLoading(true)
    try {
      setPlayer(await call(`/api/lux/admin/players?name=${encodeURIComponent(name.trim())}`))
    } catch (e) {
      setPlayer(null)
      toast.error('Player not found', e.message)
    } finally {
      setLoading(false)
    }
  }

  const reload = async () => {
    if (!player) return
    try {
      setPlayer(await call(`/api/lux/admin/players/${player.uuid}`))
    } catch (e) {
      toast.error('Could not reload', e.message)
    }
  }

  const give = async e => {
    e.preventDefault()
    const amount = parseInt(giveAmount, 10)
    if (!giveName.trim() || !(amount > 0)) return
    setGiving(true)
    try {
      const r = await call('/api/lux/admin/credits/give', { method: 'POST', body: { name: giveName.trim(), amount, reason: giveReason } })
      toast.success(`${fmt(amount)} Lux Credits for ${r.name}`, `New balance: ${fmt(r.credits)}`)
      setGiveAmount('')
      if (player && player.uuid === r.uuid) reload()
    } catch (err) {
      toast.error('Could not give credits', err.message)
    } finally {
      setGiving(false)
    }
  }

  const changeCredits = async sign => {
    const values = await dialog.prompt({
      title: sign > 0 ? `Add credits to ${player.name}` : `Remove credits from ${player.name}`,
      description: `Current balance: ${fmt(player.credits)} Lux Credits. The balance never goes below 0.`,
      tone: sign > 0 ? 'default' : 'danger',
      confirmLabel: sign > 0 ? 'Add' : 'Remove',
      fields: [
        { name: 'amount', label: 'Amount', type: 'number', placeholder: '1000', required: true },
        { name: 'reason', label: 'Reason', placeholder: sign > 0 ? 'Giveaway' : 'Correction' },
      ],
    })
    if (!values) return
    const amount = parseInt(values.amount, 10)
    if (!(amount > 0)) return
    try {
      await call(`/api/lux/admin/players/${player.uuid}/credits`, { method: 'POST', body: { delta: sign * amount, reason: values.reason } })
      toast.success('Balance updated')
      reload()
    } catch (e) {
      toast.error('Could not change the balance', e.message)
    }
  }

  const action = async (path, body, confirm, success) => {
    if (confirm && !(await dialog.confirm(confirm))) return
    try {
      await call(`/api/lux/admin/players/${player.uuid}/${path}`, { method: 'POST', body: body || {} })
      toast.success(success)
      reload()
    } catch (e) {
      toast.error('Action failed', e.message)
    }
  }

  const grantable = useMemo(() => Object.keys(prices)
    .filter(item => prices[item] > 0 && !(player?.owned || []).some(o => o.item === item))
    .sort(), [prices, player])

  const style = player?.nameStyle
  const cosmetics = player?.cosmetics ? Object.entries(player.cosmetics) : []

  return (
    <div className="flex flex-col gap-5">
      <Panel title="Give Lux Credits" description="For giveaways: Minecraft name and amount. Players who never used Lux are looked up at Mojang.">
        <form onSubmit={give} className="grid gap-3 sm:grid-cols-[1fr_140px_1fr_auto] sm:items-end">
          <Field label="Minecraft name"><TextInput value={giveName} onChange={setGiveName} placeholder="Notch" /></Field>
          <Field label="Credits"><TextInput value={giveAmount} onChange={setGiveAmount} type="number" min="1" placeholder="1000" /></Field>
          <Field label="Reason"><TextInput value={giveReason} onChange={setGiveReason} placeholder="Giveaway" /></Field>
          <Button type="submit" variant="primary" icon={Gift} disabled={giving || !giveName.trim() || !(parseInt(giveAmount, 10) > 0)}>Give</Button>
        </form>
      </Panel>

      <Panel
        title="Look up a player"
        description="Balance, unlocked items, and what the player currently shows to everyone."
        actions={player && <Button icon={RefreshCw} onClick={reload}>Reload</Button>}
      >
        <form onSubmit={e => { e.preventDefault(); load() }} className="mb-4 flex gap-2">
          <TextInput value={query} onChange={setQuery} placeholder="Minecraft name…" />
          <Button type="submit" variant="primary" icon={Search} disabled={loading || !query.trim()}>Load</Button>
        </form>

        {!player ? (
          <EmptyState icon={UserRound} title="No player loaded" message="Enter a Minecraft name to see their Lux Credits and unlocks." />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <img src={`https://mc-heads.net/avatar/${player.uuid}/48`} alt="" className="h-12 w-12 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-lg font-bold text-white">{player.name}</p>
                  <Badge tone={player.online ? 'success' : 'neutral'}>{player.online ? 'Online' : 'Offline'}</Badge>
                  {player.account && <Badge tone="info">Website: {player.account}</Badge>}
                </div>
                <p className="mt-0.5 font-mono text-[11px] text-white/30">{player.uuid} · last seen {ago(player.lastSeen)}</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2">
                <Coins className="h-4 w-4 text-primary" />
                <span className="text-lg font-black text-white">{fmt(player.credits)}</span>
                <span className="text-xs text-white/40">Lux Credits</span>
              </div>
              <div className="flex gap-2">
                <Button icon={Plus} variant="primary" onClick={() => changeCredits(1)}>Add</Button>
                <Button icon={Minus} variant="danger" onClick={() => changeCredits(-1)}>Remove</Button>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white/35">Shown to everybody</p>
                <div className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-sm">
                  <p className="text-white/60">
                    Name style:{' '}
                    {style ? <span className="text-white">{NAME_COLORS[style.color] || style.color}, {NAME_ANIMS[style.animation] || style.animation}{style.bold ? ', bold' : ''}</span> : <span className="text-white/30">none</span>}
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-white/60">
                      Second line:{' '}
                      {style?.line ? <span className="font-semibold text-white">“{style.line}”</span> : <span className="text-white/30">none</span>}
                    </p>
                    {style?.line && (
                      <Button size="sm" icon={RotateCcw} onClick={() => action('reset-line', null,
                        { title: 'Reset the second line?', description: `“${style.line}” disappears for everybody.`, confirmLabel: 'Reset', tone: 'danger' },
                        'Second line reset')}>Reset</Button>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-white/60">
                      Cosmetics:{' '}
                      {cosmetics.length ? <span className="text-white">{cosmetics.map(([slot, c]) => `${c.id.replace(/_/g, ' ')}`).join(', ')}</span> : <span className="text-white/30">none</span>}
                    </p>
                    {cosmetics.length > 0 && (
                      <Button size="sm" icon={RotateCcw} onClick={() => action('reset-cosmetics', null,
                        { title: 'Take off all cosmetics?', description: 'The player keeps what they unlocked, but wears nothing until they pick again.', confirmLabel: 'Take off', tone: 'danger' },
                        'Cosmetics taken off')}>Take off</Button>
                    )}
                  </div>
                </div>

                <p className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-[0.1em] text-white/35">Credit history</p>
                <div className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 text-xs">
                  {player.log.length === 0 && <p className="p-2 text-white/30">No changes yet.</p>}
                  {player.log.map((l, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                      <span className={l.delta >= 0 ? 'font-bold text-emerald-300' : 'font-bold text-red-300'}>{l.delta >= 0 ? '+' : ''}{fmt(l.delta)}</span>
                      <span className="flex-1 truncate text-white/55">{l.reason || '-'}{l.actor ? ` · ${l.actor}` : ''}</span>
                      <span className="text-white/25">{ago(l.at)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-white/35">Unlocked ({player.owned.length})</p>
                <div className="flex max-h-[420px] flex-col gap-1.5 overflow-y-auto rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                  {player.owned.length === 0 && <p className="p-2 text-xs text-white/30">Nothing unlocked yet (free items are always available).</p>}
                  {player.owned.map(o => (
                    <div key={o.item} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.03]">
                      <span className="flex-1 truncate text-white/80">{itemLabel(o.item)}</span>
                      <Badge tone={o.source === 'admin' ? 'info' : 'neutral'}>{o.source === 'admin' ? 'gift' : `${fmt(o.price)} cr`}</Badge>
                      <button type="button" title="Take away" className="text-white/25 hover:text-red-400"
                        onClick={() => action('revoke', { item: o.item },
                          { title: `Take away ${itemLabel(o.item)}?`, description: 'No credits are refunded. If the player wears it, it is taken off.', confirmLabel: 'Take away', tone: 'danger' },
                          'Item taken away')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <select value={grantItem} onChange={e => setGrantItem(e.target.value)}
                    className="flex-1 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-sm text-white outline-none">
                    <option value="">Give an item for free…</option>
                    {grantable.map(item => <option key={item} value={item}>{itemLabel(item)} ({fmt(prices[item])} cr)</option>)}
                  </select>
                  <Button icon={Gift} disabled={!grantItem} onClick={async () => {
                    await action('grant', { item: grantItem }, null, `${itemLabel(grantItem)} given`)
                    setGrantItem('')
                  }}>Give</Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}
