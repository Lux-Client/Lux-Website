import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'

export default function Navbar({ onDownload }) {
  const navRef = useRef()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState(null)

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

    fetch('/api/user?_cb=' + Date.now())
      .then(r => r.ok ? r.json() : { loggedIn: false })
      .then(data => { if (data.loggedIn) setUser(data.user) })
      .catch(() => {})

    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const currentPath = encodeURIComponent(window.location.pathname + window.location.search)

  return (
    <nav
      ref={navRef}
      className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-500 ${
        scrolled
          ? 'bg-background/90 backdrop-blur-2xl border-b border-white/10 shadow-2xl shadow-black/50'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        <div className="flex items-center justify-between h-20 gap-4">
          <a href="/" className="flex items-center gap-3 group shrink-0">
            <div className="relative">
              <img
                src="/resources/lux_icon.png?v=3"
                alt="Lux Client"
                className="w-9 h-9 object-contain group-hover:scale-110 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-primary/20 blur-md rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <span className="text-2xl font-extrabold tracking-tight text-white hidden sm:inline">
              Lux <span className="text-primary">Client</span>
            </span>
          </a>

          <div className="hidden md:flex items-center gap-8 text-sm font-semibold tracking-wide uppercase text-gray-400">
            {[
              { href: '#features', label: 'Features' },
              { href: 'https://pluginhub.de/discord.html', label: 'Support' },
              { href: '/html/docs/index.html', label: 'Docs' },
              { href: '/html/extensions.html', label: 'Extensions' },
              { href: '/html/modpack.html', label: 'Modpack' },
              { href: 'https://github.com/Lux-Client/Lux-Client', label: 'GitHub', external: true },
            ].map(({ href, label, external }) => (
              <a
                key={label}
                href={href}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                className="relative hover:text-primary transition-colors duration-200 group"
              >
                {label}
                <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-primary group-hover:w-full transition-all duration-300" />
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3 pl-4 border-l border-white/10">
                <a
                  href="/html/dashboard.html"
                  className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white transition-colors"
                >
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full ring-2 ring-primary/40" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                      {(user.username || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <span>{user.username}</span>
                </a>
                <a
                  href={`/auth/logout?returnTo=${currentPath}`}
                  className="text-xs text-gray-500 hover:text-red-400 transition-colors font-medium"
                >
                  Logout
                </a>
              </div>
            ) : (
              <a
                href={`/auth/google?returnTo=${currentPath}`}
                className="text-sm font-semibold text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
              >
                Login
              </a>
            )}
            <button
              onClick={onDownload}
              className="relative overflow-hidden bg-primary hover:bg-primary-dark text-black px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-primary-glow hover:shadow-primary-glow-lg hover:scale-105 active:scale-95 whitespace-nowrap group"
            >
              <span className="relative z-10">Download</span>
              <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
            </button>
          </div>

          <button
            className="md:hidden text-gray-300 hover:text-primary p-2 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <div className="w-6 h-5 flex flex-col justify-between">
              <span className={`h-0.5 bg-current transition-all duration-300 ${mobileOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`h-0.5 bg-current transition-all duration-300 ${mobileOpen ? 'opacity-0' : ''}`} />
              <span className={`h-0.5 bg-current transition-all duration-300 ${mobileOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </div>
          </button>
        </div>
      </div>

      <div
        className={`md:hidden overflow-hidden transition-all duration-300 bg-surface/95 backdrop-blur-xl border-b border-white/5 ${
          mobileOpen ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-6 py-6 space-y-3 flex flex-col items-center text-center font-semibold text-gray-300 uppercase tracking-wide">
          {[
            { href: '#features', label: 'Features' },
            { href: 'https://pluginhub.de/discord.html', label: 'Support' },
            { href: '/html/docs/index.html', label: 'Docs' },
            { href: '/html/extensions.html', label: 'Extensions' },
            { href: '/html/modpack.html', label: 'Modpack' },
            { href: 'https://github.com/Lux-Client/Lux-Client', label: 'GitHub' },
          ].map(({ href, label }) => (
            <a
              key={label}
              href={href}
              className="block w-full py-2.5 hover:text-primary hover:bg-white/5 rounded-xl transition-all"
              onClick={() => setMobileOpen(false)}
            >
              {label}
            </a>
          ))}
          <button
            onClick={() => { setMobileOpen(false); onDownload() }}
            className="block w-full bg-primary text-black py-4 rounded-2xl font-black mt-4 shadow-primary-glow active:scale-95 transition-all hover:bg-primary-dark"
          >
            Download Now
          </button>
        </div>
      </div>
    </nav>
  )
}
