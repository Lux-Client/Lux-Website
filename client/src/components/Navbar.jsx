import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { gsap } from 'gsap'
import useAuth, { fixPath } from '../hooks/useAuth'

const links = [
  { to: '/#features', label: 'Features' },
  { href: 'https://pluginhub.de/discord.html', label: 'Support', external: true },
  { to: '/docs', label: 'Docs' },
  { to: '/extensions', label: 'Extensions' },
  { to: '/modpack', label: 'Modpack' },
  { href: 'https://github.com/Lux-Client/Lux-Client', label: 'GitHub', external: true },
]

export default function Navbar({ onDownload }) {
  const navRef = useRef()
  const location = useLocation()
  const auth = useAuth()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    gsap.from(navRef.current, {
      y: -100,
      opacity: 0,
      duration: 1,
      ease: 'power3.out',
      delay: 0.1,
    })

    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname, location.search, location.hash])

  const renderLink = (item, mobile = false) => {
    const classes = mobile
      ? 'block w-full rounded-xl py-2.5 transition-all hover:bg-white/5 hover:text-primary'
      : 'group relative transition-colors duration-200 hover:text-primary'

    if (item.external) {
      return (
        <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" className={classes}>
          {item.label}
          {!mobile && <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-primary transition-all duration-300 group-hover:w-full" />}
        </a>
      )
    }

    return (
      <Link key={item.label} to={item.to} className={classes}>
        {item.label}
        {!mobile && <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-primary transition-all duration-300 group-hover:w-full" />}
      </Link>
    )
  }

  return (
    <nav
      ref={navRef}
      className={`fixed left-0 right-0 top-0 z-[100] transition-all duration-500 ${
        scrolled
          ? 'border-b border-white/10 bg-background/90 shadow-2xl shadow-black/50 backdrop-blur-2xl'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="flex h-20 items-center justify-between gap-4">
          <Link to="/" className="group flex shrink-0 items-center gap-3">
            <div className="relative">
              <img src="/resources/lux_icon.png?v=3" alt="Lux Client" className="h-9 w-9 object-contain transition-transform duration-300 group-hover:scale-110" />
              <div className="absolute inset-0 rounded-full bg-primary/20 opacity-0 blur-md transition-opacity group-hover:opacity-100" />
            </div>
            <span className="hidden text-2xl font-extrabold tracking-tight text-white sm:inline">
              Lux <span className="text-primary">Client</span>
            </span>
          </Link>

          <div className="hidden items-center gap-8 text-sm font-semibold uppercase tracking-wide text-gray-400 md:flex">
            {links.map((item) => renderLink(item))}
          </div>

          <div className="hidden items-center gap-3 md:flex">
            {auth.loggedIn ? (
              <div className="flex items-center gap-3 border-l border-white/10 pl-4">
                <Link to="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-gray-300 transition-colors hover:text-white">
                  <img src={fixPath(auth.user?.avatar || auth.user?.avatar_url)} alt="" className="h-8 w-8 rounded-full border border-primary/30 object-cover" />
                  <span>{auth.user?.username}</span>
                </Link>
                <Link to="/profile" className="rounded-lg px-3 py-1.5 text-xs font-bold text-gray-400 transition-colors hover:bg-white/5 hover:text-white">
                  Profile
                </Link>
                <a href={auth.logoutUrl} className="text-xs font-medium text-gray-500 transition-colors hover:text-red-400">
                  Logout
                </a>
              </div>
            ) : (
              <a href={auth.loginUrl} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-gray-400 transition-colors hover:bg-white/5 hover:text-white">
                Login
              </a>
            )}
            <button
              onClick={onDownload}
              className="group relative overflow-hidden whitespace-nowrap rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-black shadow-primary-glow transition-all hover:scale-105 hover:bg-primary-dark hover:shadow-primary-glow-lg active:scale-95"
            >
              <span className="relative z-10">Download</span>
              <div className="absolute inset-0 -translate-x-[100%] skew-x-12 bg-white/20 transition-transform duration-500 group-hover:translate-x-[100%]" />
            </button>
          </div>

          <button className="p-2 text-gray-300 transition-colors hover:text-primary md:hidden" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle menu">
            <div className="flex h-5 w-6 flex-col justify-between">
              <span className={`h-0.5 bg-current transition-all duration-300 ${mobileOpen ? 'translate-y-2 rotate-45' : ''}`} />
              <span className={`h-0.5 bg-current transition-all duration-300 ${mobileOpen ? 'opacity-0' : ''}`} />
              <span className={`h-0.5 bg-current transition-all duration-300 ${mobileOpen ? '-translate-y-2 -rotate-45' : ''}`} />
            </div>
          </button>
        </div>
      </div>

      <div className={`overflow-hidden border-b border-white/5 bg-surface/95 backdrop-blur-xl transition-all duration-300 md:hidden ${mobileOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'}`}>
        <div className="flex flex-col items-center space-y-3 px-6 py-6 text-center font-semibold uppercase tracking-wide text-gray-300">
          {links.map((item) => renderLink(item, true))}
          {auth.loggedIn ? (
            <>
              <Link to="/dashboard" className="block w-full rounded-xl py-2.5 transition-all hover:bg-white/5 hover:text-primary">Dashboard</Link>
              <Link to="/profile" className="block w-full rounded-xl py-2.5 transition-all hover:bg-white/5 hover:text-primary">Profile</Link>
              <a href={auth.logoutUrl} className="block w-full rounded-xl py-2.5 transition-all hover:bg-white/5 hover:text-primary">Logout</a>
            </>
          ) : (
            <a href={auth.loginUrl} className="block w-full rounded-xl py-2.5 transition-all hover:bg-white/5 hover:text-primary">Sign in</a>
          )}
          <button onClick={onDownload} className="mt-4 block w-full rounded-2xl bg-primary py-4 font-black text-black shadow-primary-glow transition-all hover:bg-primary-dark active:scale-95">
            Download Now
          </button>
        </div>
      </div>
    </nav>
  )
}
