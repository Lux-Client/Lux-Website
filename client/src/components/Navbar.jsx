import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Github, Download, X, Menu, ChevronRight } from 'lucide-react'
import useAuth, { fixPath } from '../hooks/useAuth'

const NAV_LINKS = [
  { to: '/#features', label: 'Features' },
  { to: '/extensions', label: 'Extensions' },
  { to: '/docs', label: 'Docs' },
  { to: '/modpack', label: 'Modpack' },
  { href: 'https://pluginhub.de/discord.html', label: 'Support', external: true },
]

export default function Navbar({ onDownload }) {
  const location = useLocation()
  const auth = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const NavLink = ({ item }) => {
    if (item.external) {
      return (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="relative text-sm font-medium text-white/50 transition-colors hover:text-white group"
        >
          {item.label}
          <span className="absolute -bottom-0.5 left-0 h-px w-0 bg-primary transition-all duration-300 group-hover:w-full" />
        </a>
      )
    }
    const active = location.pathname === item.to || (item.to?.startsWith('/#') && location.pathname === '/')
    return (
      <Link
        to={item.to}
        className={`relative text-sm font-medium transition-colors group ${active ? 'text-white' : 'text-white/50 hover:text-white'}`}
      >
        {item.label}
        <span className={`absolute -bottom-0.5 left-0 h-px bg-primary transition-all duration-300 ${active ? 'w-full' : 'w-0 group-hover:w-full'}`} />
      </Link>
    )
  }

  return (
    <>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed left-0 right-0 top-0 z-[100] transition-all duration-500 ${
          scrolled
            ? 'border-b border-white/6 bg-background/85 backdrop-blur-2xl shadow-[0_1px_0_rgba(255,255,255,0.04)]'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-10">
          {/* Logo */}
          <Link to="/" className="group flex shrink-0 items-center gap-2.5">
            <div className="relative flex h-8 w-8 items-center justify-center">
              <img
                src="/resources/lux_icon.png?v=3"
                alt="Lux Client"
                className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-110"
              />
              <div className="absolute inset-0 rounded-full bg-primary/20 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
            </div>
            <span className="text-[15px] font-extrabold tracking-tight text-white">
              Lux <span className="text-primary">Client</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-7 md:flex">
            {NAV_LINKS.map(item => <NavLink key={item.label} item={item} />)}
          </div>

          {/* Desktop actions */}
          <div className="hidden items-center gap-2 md:flex">
            <a
              href="https://github.com/Lux-Client/Lux-Client"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/6 hover:text-white"
              aria-label="GitHub"
            >
              <Github className="h-4 w-4" />
            </a>

            {auth.loggedIn ? (
              <div className="flex items-center gap-2 border-l border-white/8 pl-3">
                <Link to="/dashboard" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/6 hover:text-white">
                  <img
                    src={fixPath(auth.user?.avatar || auth.user?.avatar_url)}
                    alt=""
                    className="h-6 w-6 rounded-full border border-primary/30 object-cover"
                  />
                  <span className="max-w-[80px] truncate">{auth.user?.username}</span>
                </Link>
                <a href={auth.logoutUrl} className="rounded-lg px-2 py-1.5 text-xs text-white/30 transition-colors hover:text-red-400">
                  Logout
                </a>
              </div>
            ) : (
              <a href={auth.loginUrl} className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/40 transition-colors hover:bg-white/6 hover:text-white">
                Sign in
              </a>
            )}

            <button
              onClick={onDownload}
              className="shine relative ml-1 flex h-9 items-center gap-2 overflow-hidden rounded-lg bg-primary px-4 text-sm font-bold text-black shadow-glow-sm transition-all hover:bg-primary-light hover:shadow-glow active:scale-95"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(v => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/6 hover:text-white md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </motion.nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              key="drawer"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed right-0 top-0 z-[95] flex h-full w-72 flex-col border-l border-white/8 bg-[#0c0c0c] px-5 py-6 md:hidden"
            >
              <div className="mb-8 flex items-center justify-between">
                <span className="text-sm font-bold text-white/30 uppercase tracking-widest">Menu</span>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 hover:bg-white/6 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-1">
                {NAV_LINKS.map(item => (
                  item.external ? (
                    <a
                      key={item.label}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold text-white/60 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      {item.label}
                      <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                    </a>
                  ) : (
                    <Link
                      key={item.label}
                      to={item.to}
                      className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold text-white/60 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      {item.label}
                      <ChevronRight className="h-3.5 w-3.5 opacity-40" />
                    </Link>
                  )
                ))}
              </div>

              <div className="mt-auto flex flex-col gap-3 border-t border-white/6 pt-6">
                {auth.loggedIn ? (
                  <>
                    <Link to="/dashboard" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/70 hover:bg-white/5 hover:text-white">
                      <img src={fixPath(auth.user?.avatar || auth.user?.avatar_url)} alt="" className="h-7 w-7 rounded-full border border-primary/30" />
                      {auth.user?.username}
                    </Link>
                    <a href={auth.logoutUrl} className="rounded-xl px-3 py-2.5 text-sm font-medium text-red-400/60 hover:bg-white/5 hover:text-red-400">Logout</a>
                  </>
                ) : (
                  <a href={auth.loginUrl} className="rounded-xl border border-white/8 px-3 py-3 text-center text-sm font-semibold text-white/60 hover:bg-white/5 hover:text-white">
                    Sign in
                  </a>
                )}
                <button
                  onClick={() => { setMobileOpen(false); onDownload() }}
                  className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-black shadow-glow-sm hover:bg-primary-light"
                >
                  <Download className="h-4 w-4" />
                  Download Launcher
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
