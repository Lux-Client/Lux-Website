import { useEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { gsap } from 'gsap'
import FloatingCrystal from './FloatingCrystal'
import Spotlight from './ui/Spotlight'

export default function Hero({ onDownload }) {
  const containerRef = useRef()
  const [version, setVersion] = useState('loading...')

  useEffect(() => {
    fetch('https://api.github.com/repos/Lux-Client/Lux-Client/releases/latest')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.tag_name) {
          const v = data.tag_name.startsWith('v') ? data.tag_name : `v${data.tag_name}`
          setVersion(v)
        } else {
          setVersion('v1.3.3')
        }
      })
      .catch(() => setVersion('v1.3.3'))
  }, [])

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.6 })

      tl.from('.hero-badge', {
        opacity: 0, y: -40, scale: 0.8,
        duration: 0.7, ease: 'back.out(1.7)',
      })
      .from('.hero-title-word', {
        opacity: 0, y: 80, rotateX: 45,
        stagger: 0.08, duration: 0.8,
        ease: 'power3.out',
      }, '-=0.2')
      .from('.hero-desc', {
        opacity: 0, y: 40,
        duration: 0.7, ease: 'power3.out',
      }, '-=0.3')
      .from('.hero-btn', {
        opacity: 0, y: 30, scale: 0.9,
        stagger: 0.12, duration: 0.6,
        ease: 'back.out(1.7)',
      }, '-=0.3')
      .from('.hero-platform', {
        opacity: 0, x: -20,
        stagger: 0.1, duration: 0.5,
        ease: 'power2.out',
      }, '-=0.3')
    }, containerRef)

    return () => ctx.revert()
  }, [])

  return (
    <section
      ref={containerRef}
      id="home"
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #060608 0%, #0a0608 50%, #060608 100%)' }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(226,118,2,0.08),transparent)]" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/4 rounded-full blur-[120px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-900/8 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />

      <Spotlight />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 w-full grid lg:grid-cols-[1fr_1fr] gap-8 items-center pt-24 pb-16 min-h-screen">
        <div className="flex flex-col items-start">
          <div className="hero-badge inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/5 border border-primary/30 text-primary text-xs font-bold uppercase tracking-widest mb-10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
            {version} is live
          </div>

          <h1 className="text-[clamp(3rem,7vw,7rem)] font-black uppercase leading-none tracking-tight mb-8" style={{ perspective: '1000px' }}>
            {['USER-FRIENDLY'].map((word, i) => (
              <span key={i} className="hero-title-word block text-white drop-shadow-2xl">
                {word}
              </span>
            ))}
            {['NOW MORE', 'THAN EVER', 'BEFORE'].map((word, i) => (
              <span
                key={i}
                className="hero-title-word block text-gradient italic"
                style={{ textShadow: '0 0 60px rgba(226,118,2,0.3)' }}
              >
                {word}
              </span>
            ))}
          </h1>

          <p className="hero-desc text-gray-400 text-lg md:text-xl max-w-md mb-12 leading-relaxed font-light">
            Experience Minecraft like never before. High performance, premium UI, and seamless instance management built for enthusiasts.
          </p>

          <div className="flex flex-wrap gap-4 mb-14">
            <div className="hero-btn relative group">
              <div className="absolute -inset-[1.5px] rounded-2xl overflow-hidden">
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'conic-gradient(from 0deg, transparent 50%, #e27602 100%)',
                    animation: 'spin 3s linear infinite',
                  }}
                />
              </div>
              <button
                onClick={onDownload}
                className="relative bg-primary hover:bg-primary-dark text-black px-10 py-4 rounded-2xl font-black text-base transition-all shadow-primary-glow group-hover:shadow-primary-glow-lg active:scale-95 flex items-center gap-3"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Launcher
              </button>
            </div>

            <a
              href="https://github.com/Lux-Client/Lux-Client"
              target="_blank"
              rel="noopener noreferrer"
              className="hero-btn relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white px-10 py-4 rounded-2xl font-bold text-base transition-all backdrop-blur-sm flex items-center gap-3 group"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              View Source
            </a>
          </div>

          <div className="flex flex-wrap gap-6 opacity-40">
            {[
              { icon: 'windows', label: 'Windows' },
              { icon: 'linux', label: 'Linux' },
              { icon: 'apple', label: 'macOS' },
            ].map(({ icon, label }) => (
              <div key={label} className="hero-platform flex items-center gap-2">
                {icon === 'windows' && (
                  <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M0 3.449L9.75 2.1V11.7H0V3.449zm0 9.151h9.75v9.6L0 20.551V12.6zm10.55 0h13.45v10.8L10.55 21.3v-8.7zm0-10.5L24 0v11.7H10.55V2.1z" />
                  </svg>
                )}
                {icon === 'linux' && (
                  <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.504 0c-.155 0-.315.008-.48.021C7.576.336 3.746 3.956 3.132 8.741c-.024.191-.035.383-.035.576 0 3.288 2.027 6.215 5.154 7.554.082.034.165.068.248.1-.005.063-.01.126-.01.19 0 1.015.804 1.845 1.794 1.845.992 0 1.795-.83 1.795-1.845 0-.064-.005-.127-.01-.19l.028-.012c3.127-1.34 5.154-4.267 5.154-7.555 0-.19-.011-.382-.035-.573-.614-4.785-4.444-8.405-9.712-8.72A8.28 8.28 0 0012.504 0zm-3.19 17.77c0-.65.526-1.176 1.176-1.176.649 0 1.176.526 1.176 1.176 0 .65-.527 1.176-1.176 1.176-.65 0-1.176-.526-1.176-1.176zM8.24 11.47c-.67 0-1.212-.544-1.212-1.215s.542-1.215 1.212-1.215c.671 0 1.213.544 1.213 1.215s-.542 1.215-1.213 1.215zm7.52 0c-.67 0-1.212-.544-1.212-1.215s.542-1.215 1.212-1.215c.671 0 1.213.544 1.213 1.215s-.542 1.215-1.213 1.215z"/>
                  </svg>
                )}
                {icon === 'apple' && (
                  <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z"/>
                  </svg>
                )}
                <span className="font-bold text-sm uppercase tracking-widest text-white">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative h-[400px] lg:h-[600px] hidden lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(226,118,2,0.08),transparent)]" />
          <Canvas
            camera={{ position: [0, 0, 5.5], fov: 50 }}
            style={{ background: 'transparent' }}
            gl={{ alpha: true, antialias: true }}
          >
            <FloatingCrystal />
          </Canvas>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30">
        <span className="text-xs uppercase tracking-widest text-gray-400 font-semibold">Scroll</span>
        <div className="w-[1px] h-12 bg-gradient-to-b from-primary to-transparent" />
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  )
}
