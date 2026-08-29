import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, Search, Palette, Server } from 'lucide-react'
import LauncherShot from './LauncherShot'

const TABS = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    shot: 'launcher-home',
    alt: 'Lux Client home screen showing the last played instance, mod of the day and featured modpacks',
    desc: 'Jump straight back into your last instance, discover the mod of the day and browse featured modpacks.',
  },
  {
    id: 'browse',
    label: 'Browse Content',
    icon: Search,
    shot: 'launcher-browse',
    alt: 'Lux Client content browser listing mods from Modrinth with one-click install buttons',
    desc: 'Install mods, resource packs, modpacks and shaders from Modrinth and CurseForge without leaving the launcher.',
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    shot: 'launcher-appearance',
    alt: 'Lux Client appearance editor with colour pickers, theme presets and a live preview',
    desc: 'Recolour every surface, import themes and watch the live preview update while you edit.',
  },
  {
    id: 'server',
    label: 'Servers',
    icon: Server,
    shot: 'launcher-server',
    alt: 'Lux Client server dashboard with live console output, player count, CPU and memory usage',
    desc: 'Run your own servers from the launcher: live console, player list, properties and config files included.',
  },
]

export default function Showcase() {
  const [active, setActive] = useState('home')
  const activeTab = TABS.find(t => t.id === active) ?? TABS[0]

  return (
    <section className="relative py-28 md:py-36">
      <div className="absolute inset-0 bg-[#080808]" />

      <div className="relative z-10 mx-auto max-w-7xl px-5 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 flex flex-col items-center gap-5 text-center"
        >
          <div className="section-label">See it in action</div>
          <h2 className="section-title">
            Built for the <span className="text-gradient-static italic">details.</span>
          </h2>
          <p className="section-subtitle">
            Real screenshots, straight from the launcher. No concept art, no renders.
          </p>
        </motion.div>

        {/* Tab switcher */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mb-8 flex justify-center"
        >
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-2xl border border-white/8 bg-[#0d0d0d] p-1.5">
            {TABS.map(tab => {
              const Icon = tab.icon
              const isActive = active === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActive(tab.id)}
                  aria-pressed={isActive}
                  className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                    isActive ? 'text-white' : 'text-white/35 hover:text-white/70'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="showcase-tab-indicator"
                      className="absolute inset-0 rounded-xl border border-white/10 bg-white/8"
                      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    />
                  )}
                  <Icon className="relative h-4 w-4" />
                  <span className="relative">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </motion.div>

        {/* Screenshot */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-primary/8 via-transparent to-transparent blur-2xl" />

          <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#0d0d0d] shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
            {/* Keeps the box at 16:9 so switching tabs never shifts the page */}
            <div className="relative aspect-[16/9] w-full">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, scale: 1.01 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.995 }}
                  transition={{ duration: 0.28, ease: 'easeInOut' }}
                  className="absolute inset-0"
                >
                  <LauncherShot name={activeTab.shot} alt={activeTab.alt} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Description */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8 flex flex-col items-center gap-3 text-center"
        >
          <AnimatePresence mode="wait">
            <motion.p
              key={active}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="max-w-md text-[15px] text-white/40"
            >
              {activeTab.desc}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  )
}
