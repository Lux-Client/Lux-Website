import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, Lock, LogOut, Menu, Wifi, WifiOff, Wrench, X } from 'lucide-react'
import { cn } from '../../lib/utils'

/* Layout frame for the admin panel: a persistent, grouped sidebar instead of a
   single row of tabs that ran off the edge of the screen once Cloud and Audit
   Log were added. On mobile the same navigation slides in as a drawer. */

const SOCKET_LOOK = {
  connected:  { label: 'Live',      icon: Wifi,    className: 'text-emerald-400', dot: 'bg-emerald-400' },
  connecting: { label: 'Connecting', icon: Wifi,   className: 'text-amber-400',   dot: 'bg-amber-400' },
  error:      { label: 'Error',     icon: WifiOff, className: 'text-red-400',     dot: 'bg-red-400' },
  offline:    { label: 'Offline',   icon: WifiOff, className: 'text-white/30',    dot: 'bg-white/25' },
}

function NavButton({ item, active, onSelect }) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className={cn(
        'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all',
        active ? 'bg-primary/[0.12] text-white' : 'text-white/45 hover:bg-white/[0.04] hover:text-white',
      )}
    >
      {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />}
      <Icon className={cn('h-4 w-4 shrink-0 transition-colors', active ? 'text-primary' : 'text-white/30 group-hover:text-white/60')} />
      <span className="truncate">{item.label}</span>
      {item.badge > 0 && (
        <span className={cn(
          'ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] font-black tabular-nums',
          item.badgeTone === 'danger' ? 'bg-red-500/20 text-red-300' : 'bg-primary/20 text-primary',
        )}>
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </button>
  )
}

function SidebarBody({ groups, active, onSelect, role, passwordVerified, onForgetPassword, logoutUrl }) {
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5">
        <img src="/resources/lux_icon.png?v=3" alt="" className="h-7 w-7 object-contain" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-extrabold tracking-tight text-white">Lux Client</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Admin</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map(group => (
          <div key={group.label} className="mb-5 last:mb-0">
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/[0.22]">{group.label}</p>
            <div className="flex flex-col gap-0.5">
              {group.items.map(item => (
                <NavButton key={item.id} item={item} active={item.id === active} onSelect={onSelect} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <div className="mb-2 flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-[11px] font-black uppercase text-primary">
            {(role || 'g').slice(0, 1)}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-xs font-bold capitalize text-white">{role || 'guest'}</p>
            <p className="text-[10px] text-white/30">{passwordVerified ? 'Master password' : 'Session only'}</p>
          </div>
        </div>

        <Link
          to="/"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white/35 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          <ArrowUpRight className="h-3.5 w-3.5" /> Back to website
        </Link>
        {passwordVerified && (
          <button
            type="button"
            onClick={onForgetPassword}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white/35 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <Lock className="h-3.5 w-3.5" /> Forget password
          </button>
        )}
        {logoutUrl && (
          <a
            href={logoutUrl}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-white/35 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </a>
        )}
      </div>
    </>
  )
}

export default function AdminShell({
  groups, active, onSelect, title, description, actions, children,
  socketStatus = 'offline', maintenanceMode = false, role, passwordVerified,
  onForgetPassword, logoutUrl,
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => { setDrawerOpen(false) }, [active])

  const socket = SOCKET_LOOK[socketStatus] || SOCKET_LOOK.offline
  const SocketIcon = socket.icon

  const select = id => { onSelect(id); setDrawerOpen(false) }

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-white/[0.06] bg-[#0a0a0a] lg:flex">
        <SidebarBody
          groups={groups} active={active} onSelect={select} role={role}
          passwordVerified={passwordVerified} onForgetPassword={onForgetPassword} logoutUrl={logoutUrl}
        />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
              transition={{ type: 'tween', duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-[95] flex w-[264px] flex-col border-r border-white/[0.06] bg-[#0a0a0a] lg:hidden"
            >
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="absolute right-3 top-4 rounded-lg p-1.5 text-white/30 transition-colors hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
              <SidebarBody
                groups={groups} active={active} onSelect={select} role={role}
                passwordVerified={passwordVerified} onForgetPassword={onForgetPassword} logoutUrl={logoutUrl}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-[264px]">
        {/* Topbar */}
        <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#080808]/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-5 py-3.5 lg:px-8">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg border border-white/[0.08] bg-white/[0.04] p-2 text-white/60 transition-colors hover:text-white lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-black tracking-tight text-white">{title}</h1>
              {description && <p className="truncate text-xs text-white/[0.35]">{description}</p>}
            </div>

            <div className="flex items-center gap-2">
              {actions}
              {maintenanceMode && (
                <span className="flex items-center gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-400">
                  <Wrench className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Maintenance</span>
                </span>
              )}
              <span
                title={`Realtime connection: ${socketStatus}`}
                className={cn('flex items-center gap-1.5 rounded-xl border border-white/[0.06] bg-[#0f0f0f] px-3 py-2 text-[11px] font-bold', socket.className)}
              >
                <SocketIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{socket.label}</span>
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-5 pb-20 pt-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
