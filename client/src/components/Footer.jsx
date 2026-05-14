import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
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

  return (
    <footer ref={footerRef} className="relative border-t border-white/5 py-20">
      <div className="absolute inset-0 bg-[#060608]" />
      <div className="footer-content relative z-10 mx-auto max-w-7xl px-6 lg:px-12">
        <div className="mb-12 flex flex-col items-start justify-between gap-12 md:flex-row">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <img src="/resources/lux_icon.png?v=3" alt="Lux Client" className="h-8 w-8" />
              <span className="text-xl font-black text-white">
                Lux <span className="text-primary">Client</span>
              </span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-gray-500">
              Designed for the community. Windows, Linux, and macOS versions available. Not an official Minecraft product.
            </p>
          </div>

          <nav className="flex flex-wrap gap-6 text-sm font-bold uppercase tracking-widest text-gray-400 md:gap-10">
            <Link to="/privacy" className="transition-colors duration-200 hover:text-primary">Privacy</Link>
            <Link to="/imprint" className="transition-colors duration-200 hover:text-primary">Imprint</Link>
            <Link to="/opt-out" className="transition-colors duration-200 hover:text-primary">Opt-Out</Link>
            <Link to="/docs" className="transition-colors duration-200 hover:text-primary">Docs</Link>
            <a href="https://pluginhub.de/discord.html" target="_blank" rel="noopener noreferrer" className="transition-colors duration-200 hover:text-primary">Discord</a>
            <a href="https://github.com/Lux-Client/Lux-Client" target="_blank" rel="noopener noreferrer" className="transition-colors duration-200 hover:text-primary">GitHub</a>
          </nav>

          <div className="text-right text-sm font-medium text-gray-600">
            &copy; 2026 Lux-Client<br />
            <span className="text-gray-500">Fernsehheft, Mobilestars</span>
          </div>
        </div>

        <div className="h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        <p className="mt-8 text-center text-xs uppercase tracking-widest text-gray-600">Built with ❤️ for the Minecraft community</p>
      </div>
    </footer>
  )
}
