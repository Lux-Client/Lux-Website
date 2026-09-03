import { useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '../../lib/utils'

/* Shared building blocks for the admin panel.
   Everything in here is presentational — no fetching, no business rules — so the
   views stay readable and every surface in the panel looks like the same product. */

// ─── Surfaces ────────────────────────────────────────────────────────────────

export function Panel({ title, description, actions, footer, children, className, bodyClass }) {
  const hasHeader = title || description || actions
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0f0f0f]', className)}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.05] px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-bold tracking-tight text-white">{title}</h2>}
            {description && <p className="mt-1 text-xs leading-relaxed text-white/[0.38]">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('p-5', bodyClass)}>{children}</div>
      {footer && <footer className="border-t border-white/[0.05] bg-white/[0.015] px-5 py-3">{footer}</footer>}
    </section>
  )
}

export function GroupHeading({ children, hint }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/[0.32]">{children}</h3>
      {hint && <span className="text-[11px] text-white/[0.22]">{hint}</span>}
    </div>
  )
}

// ─── Data display ────────────────────────────────────────────────────────────

export function StatTile({ icon: Icon, label, value, hint, color = '#e27602', live = false, onClick, loading = false }) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border border-white/[0.06] bg-[#0f0f0f] p-4 text-left transition-colors',
        onClick && 'hover:border-white/[0.14] hover:bg-white/[0.02]',
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: color + '1f', color }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-white/[0.34]">{label}</span>
        {live && <LiveDot className="ml-auto" />}
      </div>
      {loading
        ? <div className="h-8 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
        : <p className="text-[28px] font-black leading-none tracking-tight text-white tabular-nums">{String(value)}</p>}
      {hint && <p className="text-[11px] leading-snug text-white/[0.3]">{hint}</p>}
      {onClick && (
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-0 transition-opacity group-hover:opacity-100"
          style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        />
      )}
    </Wrapper>
  )
}

export function LiveDot({ className }) {
  return (
    <span className={cn('relative flex h-2 w-2', className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  )
}

const BADGE_TONES = {
  neutral: 'border-white/[0.08] bg-white/[0.05] text-white/60',
  primary: 'border-primary/25 bg-primary/10 text-primary',
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400',
  warning: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  danger:  'border-red-500/20 bg-red-500/10 text-red-400',
  info:    'border-blue-500/20 bg-blue-500/10 text-blue-400',
}

export function Badge({ tone = 'neutral', children, className }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]',
      BADGE_TONES[tone] || BADGE_TONES.neutral, className,
    )}>
      {children}
    </span>
  )
}

export function EmptyState({ icon: Icon, title, message, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.08] px-6 py-12 text-center', className)}>
      {Icon && <Icon className="mb-1 h-6 w-6 text-white/[0.14]" />}
      {title && <p className="text-sm font-semibold text-white/70">{title}</p>}
      {message && <p className="max-w-sm text-xs leading-relaxed text-white/[0.3]">{message}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export function Table({ columns, children }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th
                key={i}
                className={cn(
                  'sticky top-0 border-b border-white/[0.07] bg-[#0f0f0f] pb-2.5 pt-0 text-[10px] font-bold uppercase tracking-[0.14em] text-white/[0.28]',
                  c.align === 'right' ? 'text-right' : 'text-left',
                  c.className,
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Row({ children, className }) {
  return <tr className={cn('group transition-colors hover:bg-white/[0.025]', className)}>{children}</tr>
}

export function Cell({ children, align = 'left', className }) {
  return (
    <td className={cn(
      'border-b border-white/[0.04] py-3 pr-4 align-middle text-white/60 last:pr-0',
      align === 'right' && 'pr-0 text-right',
      className,
    )}>
      {children}
    </td>
  )
}

// ─── Controls ────────────────────────────────────────────────────────────────

const BUTTON_VARIANTS = {
  primary: 'bg-primary text-black hover:bg-primary-light shadow-glow-sm hover:shadow-glow',
  ghost:   'border border-white/[0.08] bg-white/[0.04] text-white/70 hover:border-white/[0.16] hover:bg-white/[0.08] hover:text-white',
  danger:  'border border-red-500/20 bg-red-500/[0.08] text-red-400 hover:bg-red-500/[0.16] hover:text-red-300',
  success: 'border border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-400 hover:bg-emerald-500/[0.16] hover:text-emerald-300',
  solid:   'bg-red-500 text-white hover:bg-red-400',
  subtle:  'text-white/40 hover:bg-white/[0.05] hover:text-white',
}

const BUTTON_SIZES = {
  sm: 'gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]',
  md: 'gap-2 rounded-xl px-3.5 py-2 text-xs',
  lg: 'gap-2 rounded-xl px-5 py-3 text-sm',
}

export function Button({ variant = 'ghost', size = 'md', icon: Icon, children, className, ...props }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center justify-center font-bold transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.ghost,
        BUTTON_SIZES[size] || BUTTON_SIZES.md,
        className,
      )}
    >
      {Icon && <Icon className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />}
      {children}
    </button>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/[0.36]">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-snug text-white/[0.26]">{hint}</span>}
    </label>
  )
}

const CONTROL = 'w-full rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-white/20 focus:border-primary/50 focus:bg-white/[0.05] focus:ring-2 focus:ring-primary/10'

export function TextInput({ value, onChange, className, ...props }) {
  return <input value={value} onChange={e => onChange?.(e.target.value)} {...props} className={cn(CONTROL, className)} />
}

export function TextArea({ value, onChange, rows = 4, className, ...props }) {
  return <textarea value={value} onChange={e => onChange?.(e.target.value)} rows={rows} {...props} className={cn(CONTROL, 'resize-none leading-relaxed', className)} />
}

export function FileInput({ onChange, accept, fileName }) {
  return (
    <div className="flex items-center gap-3">
      <label className={cn(CONTROL, 'flex cursor-pointer items-center gap-3 py-2')}>
        <span className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-black">Choose file</span>
        <span className="truncate text-xs text-white/40">{fileName || 'No file selected'}</span>
        <input type="file" accept={accept} onChange={e => onChange?.(e.target.files?.[0] || null)} className="hidden" />
      </label>
    </div>
  )
}

export function SearchField({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/25" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/[0.08] bg-white/[0.035] py-2 pl-9 pr-8 text-xs text-white outline-none transition placeholder:text-white/20 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/25 transition-colors hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

export function SegmentedControl({ items, value, onChange }) {
  return (
    <div className="flex w-full gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-[#0c0c0c] p-1">
      {items.map(item => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition-all',
              active ? 'bg-white/[0.08] text-white' : 'text-white/40 hover:text-white/80',
            )}
          >
            {item.label}
            {item.count > 0 && (
              <span className={cn(
                'rounded-full px-1.5 py-px text-[10px] font-black tabular-nums',
                active ? 'bg-primary text-black' : 'bg-white/[0.08] text-white/50',
              )}>
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function Switch({ checked, onChange, label, description, tone = 'primary' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-left transition-colors hover:border-white/[0.12]"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-snug text-white/[0.34]">{description}</span>}
      </span>
      <span className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        checked ? (tone === 'warning' ? 'bg-amber-500' : 'bg-primary') : 'bg-white/[0.12]',
      )}>
        <span className={cn(
          'absolute top-1 h-4 w-4 rounded-full bg-black transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )} />
      </span>
    </button>
  )
}

// ─── Modal ───────────────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, description, children, footer, width = 'max-w-md' }) {
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cn('relative w-full rounded-2xl border border-white/[0.1] bg-[#111111] shadow-2xl', width)}>
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-white">{title}</h3>
            {description && <p className="mt-1 text-xs leading-relaxed text-white/[0.4]">{description}</p>}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1 text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>
        {children && <div className="px-5 py-4">{children}</div>}
        {footer && <footer className="flex justify-end gap-2 border-t border-white/[0.06] px-5 py-4">{footer}</footer>}
      </div>
    </div>
  )
}

// ─── Misc ────────────────────────────────────────────────────────────────────

/* Tiny inline sparkline — enough to show the shape of the last few minutes
   without pulling a chart library into every tile. */
export function Sparkline({ data = [], color = '#10b981', height = 34 }) {
  if (data.length < 2) return <div className="h-[34px]" />
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const span = max - min || 1
  const step = 100 / (data.length - 1)
  const points = data.map((v, i) => `${(i * step).toFixed(2)},${(100 - ((v - min) / span) * 100).toFixed(2)}`)
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} className="w-full">
      <polyline points={`0,100 ${points.join(' ')} 100,100`} fill={color} opacity="0.12" stroke="none" />
      <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
