import { motion } from 'framer-motion'
import {
  Zap, Package, Palette, Puzzle, Copy, Cloud,
} from 'lucide-react'

const FEATURES = [
  {
    icon: Zap,
    title: 'Blazing Fast',
    desc: 'Optimized networking and lightweight core ensures lightning-fast launch times and minimal resource usage.',
    color: '#e27602',
  },
  {
    icon: Package,
    title: 'Mod Integration',
    desc: 'Native support for Fabric, Forge, NeoForge and Quilt. One-click installs with smart compatibility checks.',
    color: '#7c3aed',
  },
  {
    icon: Palette,
    title: 'Premium UI',
    desc: 'Fully themeable interface with 230+ CSS variables, live color pickers, backgrounds and font customization.',
    color: '#3b82f6',
  },
  {
    icon: Puzzle,
    title: 'Extension System',
    desc: 'Install community-built extensions that add new tabs, automations and integrations to your launcher.',
    color: '#22c55e',
  },
  {
    icon: Copy,
    title: 'Multi-Instance',
    desc: 'Manage unlimited instances side by side. Import from CurseForge, Modrinth and modpack codes instantly.',
    color: '#06b6d4',
  },
  {
    icon: Cloud,
    title: 'Cloud Backup',
    desc: 'Automatic world and instance backups. Restore from any point with full version history.',
    color: '#ec4899',
  },
]

export default function Features() {
  return (
    <section id="features" className="relative py-28 md:py-36">
      {/* Background */}
      <div className="absolute inset-0 bg-[#090909]" />
      <div className="absolute inset-0 bg-gradient-radial from-primary/3 via-transparent to-transparent" style={{ backgroundPosition: '50% 0%' }} />

      <div className="relative z-10 mx-auto max-w-7xl px-5 lg:px-10">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-16 flex flex-col items-center gap-5 text-center"
        >
          <div className="section-label">What's inside</div>
          <h2 className="section-title">
            Everything you <span className="text-gradient-static italic">need.</span>
          </h2>
          <p className="section-subtitle">
            Lux Client packs powerful tools into a beautiful, lightweight interface that stays out of your way.
          </p>
        </motion.div>

        {/* Feature grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feat, i) => {
            const Icon = feat.icon
            return (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.55, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -3, transition: { duration: 0.2 } }}
                className="group relative overflow-hidden rounded-2xl border border-white/6 bg-[#0f0f0f] p-7 transition-shadow hover:border-white/10 hover:shadow-[0_0_40px_rgba(0,0,0,0.5)]"
              >
                {/* Top accent line on hover */}
                <div
                  className="absolute inset-x-0 top-0 h-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{ background: `linear-gradient(90deg, transparent, ${feat.color}60, transparent)` }}
                />

                {/* Icon */}
                <div
                  className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110"
                  style={{ backgroundColor: feat.color + '15', color: feat.color }}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>

                <h3 className="mb-3 text-lg font-bold text-white">{feat.title}</h3>
                <p className="text-[15px] leading-relaxed text-white/40">{feat.desc}</p>

                {/* Bottom accent bar */}
                <div
                  className="mt-8 h-px w-10 rounded-full transition-all duration-500 group-hover:w-full"
                  style={{ background: `linear-gradient(to right, ${feat.color}80, transparent)` }}
                />
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
