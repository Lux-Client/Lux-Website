import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, Github, ArrowRight, Zap } from 'lucide-react'

const REPO = 'Lux-Client/Lux-Client'

function LauncherMockup() {
  const sidebarItems = [
    { label: 'Home', active: true },
    { label: 'Library' },
    { label: 'Search' },
    { label: 'Skins' },
    { label: 'Extensions' },
  ]

  const instances = [
    { name: 'Survival World', version: '1.21.1', loader: 'Fabric', color: '#22c55e' },
    { name: 'Modded 1.20', version: '1.20.4', loader: 'Forge', color: '#e27602' },
    { name: 'Creative Build', version: '1.21.3', loader: 'Vanilla', color: '#3b82f6' },
    { name: 'Speedrun SMP', version: '1.8.9', loader: 'Vanilla', color: '#a855f7' },
  ]

  return (
    <div className="relative w-full select-none overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e0e] shadow-[0_40px_120px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.05)]">
      {/* Title bar */}
      <div className="flex h-10 items-center justify-between border-b border-white/5 bg-[#0a0a0a] px-4">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex items-center gap-1 rounded-md bg-white/4 px-3 py-0.5 text-[10px] font-semibold text-white/30">
          <span>Launcher</span>
          <span className="opacity-40">·</span>
          <span>Server</span>
          <span className="opacity-40">·</span>
          <span>Client</span>
          <span className="opacity-40">·</span>
          <span>Tools</span>
        </div>
        <div className="w-14" />
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="flex w-11 flex-col items-center gap-1 border-r border-white/5 bg-[#0a0a0a] py-3">
          {sidebarItems.map(item => (
            <div
              key={item.label}
              className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                item.active ? 'bg-primary/15 text-primary' : 'text-white/20 hover:text-white/40'
              }`}
            >
              <div className={`h-3.5 w-3.5 rounded-sm ${item.active ? 'bg-primary/60' : 'bg-white/15'}`} />
            </div>
          ))}
          <div className="mt-auto mb-1 flex h-9 w-9 items-center justify-center rounded-xl text-white/20">
            <div className="h-3.5 w-3.5 rounded-sm bg-white/10" />
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 p-4">
          {/* Header bar */}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="h-2.5 w-24 rounded-full bg-white/10" />
              <div className="mt-1.5 h-2 w-16 rounded-full bg-white/5" />
            </div>
            <div className="h-7 w-20 rounded-lg bg-primary/20 border border-primary/20">
              <div className="flex h-full items-center justify-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                <div className="h-1.5 w-10 rounded-full bg-primary/30" />
              </div>
            </div>
          </div>

          {/* Instance grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {instances.map((inst, i) => (
              <motion.div
                key={inst.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + i * 0.08, duration: 0.4, ease: 'easeOut' }}
                className="group relative overflow-hidden rounded-xl border border-white/6 bg-white/[0.03] p-3"
              >
                {/* Icon area */}
                <div
                  className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: inst.color + '18', borderColor: inst.color + '25', border: '1px solid' }}
                >
                  <div className="h-5 w-5 rounded-md" style={{ backgroundColor: inst.color + '50' }} />
                </div>
                {/* Text */}
                <div className="h-2 w-20 rounded-full bg-white/20 mb-1.5" />
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-10 rounded-full bg-white/8" />
                  <span className="text-[9px] font-bold rounded-full px-1.5 py-0.5" style={{ backgroundColor: inst.color + '18', color: inst.color + 'cc' }}>
                    {inst.loader}
                  </span>
                </div>
                {/* Play button hover */}
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: inst.color + '22' }}>
                    <div className="ml-0.5 h-0 w-0 border-y-[4px] border-l-[7px] border-y-transparent" style={{ borderLeftColor: inst.color }} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Bottom bar */}
          <div className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500/60 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              <div className="h-1.5 w-20 rounded-full bg-white/10" />
            </div>
            <div className="h-1.5 w-12 rounded-full bg-white/6" />
          </div>
        </div>
      </div>

      {/* Glow overlay */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-transparent" />
    </div>
  )
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.2 } },
}
const item = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}

export default function Hero({ onDownload }) {
  const [version, setVersion] = useState(null)

  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.tag_name) {
          const v = data.tag_name.startsWith('v') ? data.tag_name : `v${data.tag_name}`
          setVersion(v)
        }
      })
      .catch(() => {})
  }, [])

  return (
    <section id="home" className="relative flex min-h-screen items-center overflow-hidden pt-16">
      {/* Background layers */}
      <div className="absolute inset-0 bg-[#070707]" />
      <div className="absolute inset-0 bg-grid opacity-100" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#080808]" />

      {/* Glow orbs */}
      <div className="absolute left-1/4 top-1/4 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
      <div className="absolute right-1/3 bottom-1/3 h-[300px] w-[300px] rounded-full bg-orange-900/8 blur-[100px]" />

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-20 pt-16 lg:px-10">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left – text content */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="flex flex-col"
          >
            {/* Version badge */}
            <motion.div variants={item} className="mb-8 flex items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3.5 py-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                <span className="text-xs font-bold uppercase tracking-[0.15em] text-primary">
                  {version ? `${version} is live` : 'Now available'}
                </span>
              </div>
              {version && (
                <a
                  href={`https://github.com/${REPO}/releases/latest`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-1 text-xs font-medium text-white/30 transition-colors hover:text-white/60"
                >
                  See what's new
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                </a>
              )}
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={item}
              className="mb-6 text-[clamp(2.8rem,5.5vw,5.5rem)] font-black leading-[0.95] tracking-tight"
            >
              <span className="block text-white">The Minecraft</span>
              <span className="block text-gradient-static">Launcher You</span>
              <span className="block text-white">Deserve.</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p variants={item} className="mb-10 max-w-md text-lg leading-relaxed text-white/45 font-light">
              High-performance, premium UI, seamless instance management —
              built for enthusiasts who care about every detail.
            </motion.p>

            {/* CTAs */}
            <motion.div variants={item} className="mb-10 flex flex-wrap items-center gap-3">
              <button
                onClick={onDownload}
                className="shine group relative flex items-center gap-2.5 overflow-hidden rounded-xl bg-primary px-7 py-3.5 text-sm font-bold text-black shadow-glow-sm transition-all hover:bg-primary-light hover:shadow-glow active:scale-[0.97]"
              >
                <Download className="h-4 w-4" />
                Download Free
              </button>

              <a
                href={`https://github.com/${REPO}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/4 px-7 py-3.5 text-sm font-semibold text-white/70 transition-all hover:bg-white/8 hover:text-white hover:border-white/14 active:scale-[0.97]"
              >
                <Github className="h-4 w-4" />
                View on GitHub
              </a>
            </motion.div>

            {/* Platform + quick stats */}
            <motion.div variants={item} className="flex flex-col gap-4">
              <div className="flex items-center gap-6">
                {[
                  { label: 'Windows' },
                  { label: 'Linux' },
                  { label: 'macOS' },
                ].map(({ label }) => (
                  <div key={label} className="flex items-center gap-1.5 text-white/25">
                    <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
                    <span className="text-xs font-semibold uppercase tracking-[0.1em]">{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-5 text-xs text-white/20">
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-primary/50" />
                  Free &amp; open source
                </span>
                <span>·</span>
                <span>Modrinth integration</span>
                <span>·</span>
                <span>Plugin ecosystem</span>
              </div>
            </motion.div>
          </motion.div>

          {/* Right – launcher mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="hidden lg:block"
          >
            <div className="relative">
              {/* Ambient glow behind mockup */}
              <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-transparent blur-2xl" />
              <LauncherMockup />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 opacity-20">
        <div className="h-10 w-px bg-gradient-to-b from-primary/80 to-transparent" />
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Scroll</span>
      </div>
    </section>
  )
}
