import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function Footer() {
  const footerRef = useRef()

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.footer-content', {
        scrollTrigger: {
          trigger: footerRef.current,
          start: 'top 90%',
        },
        opacity: 0,
        y: 40,
        duration: 0.8,
        ease: 'power3.out',
      })
    }, footerRef)
    return () => ctx.revert()
  }, [])

  const links = [
    { href: 'https://pluginhub.de/discord.html', label: 'Discord' },
    { href: '/html/privacy-policy.html', label: 'Imprint & Privacy' },
    { href: '/html/analytics-opt-out.html', label: 'Opt-Out' },
    { href: 'https://github.com/Lux-Client/Lux-Client', label: 'GitHub' },
  ]

  return (
    <footer ref={footerRef} className="py-20 border-t border-white/5 relative">
      <div className="absolute inset-0 bg-[#060608]" />
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 footer-content">
        <div className="flex flex-col md:flex-row justify-between items-start gap-12 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-5">
              <img src="/resources/lux_icon.png?v=3" alt="Lux Client" className="w-8 h-8" />
              <span className="text-xl font-black text-white">
                Lux <span className="text-primary">Client</span>
              </span>
            </div>
            <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
              Designed for the community. Windows, Linux, and macOS versions available.
              Not an official Minecraft product.
            </p>
          </div>

          <nav className="flex flex-wrap gap-6 md:gap-10 text-sm text-gray-400 font-bold uppercase tracking-widest">
            {links.map(({ href, label }) => (
              <a key={label} href={href} className="hover:text-primary transition-colors duration-200">
                {label}
              </a>
            ))}
          </nav>

          <div className="text-gray-600 text-sm text-right font-medium">
            &copy; 2026 Lux-Client<br />
            <span className="text-gray-500">Fernsehheft, Mobilestars</span>
          </div>
        </div>

        <div className="h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        <p className="text-center text-gray-600 text-xs mt-8 uppercase tracking-widest">
          Built with ❤️ for the Minecraft community
        </p>
      </div>
    </footer>
  )
}
