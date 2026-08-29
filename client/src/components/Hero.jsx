import { motion } from 'framer-motion'
import { Download, Github, ArrowRight, Zap } from 'lucide-react'
import LauncherShot from './LauncherShot'

const REPO = 'Lux-Client/Lux-Client'

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.2 } },
}
const item = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
}

export default function Hero({ onDownload, version = null }) {

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

          {/* Right – real launcher screenshot */}
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="hidden lg:block"
          >
            <div className="relative">
              {/* Ambient glow behind the screenshot */}
              <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-primary/10 via-transparent to-transparent blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e0e] shadow-[0_40px_120px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.05)]">
                <LauncherShot
                  name="launcher-home"
                  alt="The Lux Client home screen with recently played instances, mod of the day and featured modpacks"
                  priority
                />
              </div>
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
