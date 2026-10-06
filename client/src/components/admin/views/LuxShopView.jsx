import { useEffect, useMemo, useState } from 'react'
import { Ban, Check, Coins, RefreshCw, RotateCcw, ShoppingBag } from 'lucide-react'
import { Badge, Button, Cell, EmptyState, Panel, Row, SearchField, SegmentedControl, Table } from '../ui'
import { useToast } from '../feedback'

/* Lux Shop: the price of every cosmetic, emote and name style feature. Defaults come from
   luxShop.js; what is changed here is stored on the server and every Lux Client picks it
   up within a few seconds (the mod sees the new price version in its live poll). */

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

function PriceRow({ item, onSaved }) {
  const toast = useToast()
  const [value, setValue] = useState(item.price === null ? '' : String(item.price))
  const [busy, setBusy] = useState(false)
  useEffect(() => { setValue(item.price === null ? '' : String(item.price)) }, [item.price])

  const save = async body => {
    setBusy(true)
    try {
      const r = await call('/api/lux/admin/prices', { method: 'PUT', body: { item: item.item, ...body } })
      toast.success(`${item.name}`, r.price === null ? 'Not for sale' : `${fmt(r.price)} Lux Credits`)
      onSaved()
    } catch (e) {
      toast.error('Could not save the price', e.message)
    } finally {
      setBusy(false)
    }
  }

  const parsed = value.trim() === '' ? null : Number(value)
  const valid = parsed !== null && Number.isInteger(parsed) && parsed >= 0 && parsed <= 1000000
  const changed = valid && parsed !== item.price

  return (
    <Row>
      <Cell>
        <p className="font-semibold text-white">{item.name}</p>
        <p className="font-mono text-[10px] text-white/25">{item.item}</p>
      </Cell>
      <Cell>
        {item.price === null
          ? <Badge tone="danger">Not for sale</Badge>
          : item.price === 0 ? <Badge tone="success">Free</Badge> : <span className="font-bold text-white">{fmt(item.price)}</span>}
        {item.overridden && <Badge tone="info" className="ml-2">changed</Badge>}
      </Cell>
      <Cell className="text-white/35">{item.default === null ? '—' : fmt(item.default)}</Cell>
      <Cell align="right">
        <form
          onSubmit={e => { e.preventDefault(); if (changed) save({ price: parsed }) }}
          className="flex items-center justify-end gap-1.5"
        >
          <input
            value={value}
            onChange={e => setValue(e.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            placeholder="price"
            className="w-24 rounded-lg border border-white/[0.08] bg-white/[0.035] px-2.5 py-1.5 text-right text-xs text-white outline-none focus:border-primary/40"
          />
          <Button type="submit" size="sm" variant="primary" icon={Check} disabled={busy || !changed}>Save</Button>
          {item.price !== null && (
            <Button type="button" size="sm" variant="danger" icon={Ban} disabled={busy} onClick={() => save({ forSale: false })} title="Take off sale" />
          )}
          {item.overridden && (
            <Button type="button" size="sm" icon={RotateCcw} disabled={busy} onClick={() => save({ price: null })} title="Back to the default price" />
          )}
        </form>
      </Cell>
    </Row>
  )
}

export default function LuxShopView() {
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')

  const load = async () => {
    try {
      const d = await call('/api/lux/admin/prices')
      setItems(d.items || [])
    } catch (e) {
      toast.error('Could not load prices', e.message)
      setItems([])
    }
  }
  useEffect(() => { load() }, [])

  const categories = useMemo(() => {
    const counts = {}
    for (const i of items || []) counts[i.category] = (counts[i.category] || 0) + 1
    return [{ id: 'all', label: 'All', count: (items || []).length },
      ...Object.keys(counts).map(c => ({ id: c, label: c, count: counts[c] }))]
  }, [items])

  const shown = useMemo(() => (items || [])
    .filter(i => category === 'all' || i.category === category)
    .filter(i => !query || `${i.name} ${i.item}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.category.localeCompare(b.category) || (a.price ?? -1) - (b.price ?? -1) || a.name.localeCompare(b.name)),
  [items, category, query])

  return (
    <Panel
      title="Lux Shop prices"
      description="Prices in Lux Credits. Changes are saved on the server and reach every Lux Client within a few seconds. Credits themselves can't be bought."
      actions={<div className="flex items-center gap-2"><SearchField value={query} onChange={setQuery} placeholder="Search items…" /><Button icon={RefreshCw} onClick={load}>Reload</Button></div>}
    >
      {items === null ? (
        <p className="text-sm text-white/40">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState icon={ShoppingBag} title="No items" message="The price list is empty." />
      ) : (
        <div className="flex flex-col gap-4">
          <SegmentedControl items={categories} value={category} onChange={setCategory} />
          <Table columns={[{ label: 'Item' }, { label: 'Price' }, { label: 'Default' }, { label: 'Change', align: 'right' }]}>
            {shown.map(i => <PriceRow key={i.item} item={i} onSaved={load} />)}
          </Table>
          <p className="flex items-center gap-2 text-[11px] text-white/30"><Coins className="h-3.5 w-3.5" /> 0 = free for everybody. “Take off sale” hides the item from the shop (players who own it keep it).</p>
        </div>
      )}
    </Panel>
  )
}
