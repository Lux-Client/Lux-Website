import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutGrid, Search, Settings2, ChevronRight } from 'lucide-react'

const TABS = [
  {
    id: 'instances',
    label: 'Instance Library',
    icon: LayoutGrid,
    desc: 'Manage all your Minecraft worlds in one clean interface. Launch, configure or delete instances in seconds.',
  },
  {
    id: 'search',
    label: 'Mod Search',
    icon: Search,
    desc: 'Browse and install mods directly from Modrinth. Filter by version, loader, category and more.',
  },
  {
    id: 'settings',
    label: 'Customization',
    icon: Settings2,
    desc: 'Customize every detail of the launcher — colors, fonts, backgrounds, animations and layout.',
  },
]

function InstancesPreview() {
  const items = [
    { name: 'Survival World', ver: '1.21.1', loader: 'Fabric', color: '#22c55e', playing: true },
    { name: 'Modded 1.20', ver: '1.20.4', loader: 'Forge', color: '#e27602' },
    { name: 'Creative Build', ver: '1.21.3', loader: 'Vanilla', color: '#3b82f6' },
    { name: 'Speedrun SMP', ver: '1.8.9', loader: 'Vanilla', color: '#a855f7' },
    { name: 'Dev Testing', ver: '1.21-pre', loader: 'Fabric', color: '#06b6d4' },
    { name: 'Old World', ver: '1.16.5', loader: 'Forge', color: '#f59e0b' },
  ]
  return (
    <div className="grid grid-cols-3 gap-2.5 p-4">
      {items.map(inst => (
        <div key={inst.name} className="group relative overflow-hidden rounded-xl border border-white/6 bg-white/3 p-3 transition-all hover:border-white/10">
          <div
            className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg border"
            style={{ backgroundColor: inst.color + '18', borderColor: inst.color + '30' }}
          >
            <div className="h-4 w-4 rounded-md" style={{ backgroundColor: inst.color + '60' }} />
          </div>
          <div className="h-1.5 w-16 rounded-full bg-white/20 mb-1.5" />
          <div className="flex items-center gap-1.5">
            <div className="h-1 w-8 rounded-full bg-white/8" />
            <span className="text-[8px] font-bold rounded-full px-1 py-px" style={{ backgroundColor: inst.color + '18', color: inst.color + 'cc' }}>
              {inst.loader}
            </span>
          </div>
          {inst.playing && (
            <div className="absolute right-2 top-2 flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function SearchPreview() {
  const results = [
    { name: 'Sodium', desc: 'Rendering optimization', downloads: '12M', color: '#3b82f6' },
    { name: 'Iris Shaders', desc: 'Shader pack loader', downloads: '8M', color: '#a855f7' },
    { name: 'Fabric API', desc: 'Core library', downloads: '50M', color: '#22c55e' },
    { name: 'Litematica', desc: 'Schematic builds', downloads: '5M', color: '#f59e0b' },
  ]
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-white/8 bg-white/4 px-3.5 py-2.5">
        <Search className="h-3.5 w-3.5 text-white/30" />
        <div className="h-2 w-32 rounded-full bg-white/20" />
        <div className="ml-auto h-5 w-12 rounded-lg bg-primary/20" />
      </div>
      <div className="flex flex-col gap-2">
        {results.map(r => (
          <div key={r.name} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3 transition-colors hover:border-white/10">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: r.color + '18' }}>
              <div className="h-4 w-4 rounded-md" style={{ backgroundColor: r.color + '50' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="h-2 w-20 rounded-full bg-white/25 mb-1.5" />
              <div className="h-1.5 w-28 rounded-full bg-white/10" />
            </div>
            <div className="text-[9px] font-bold text-white/25">{r.downloads}</div>
            <div className="h-6 w-14 rounded-lg bg-primary/15 border border-primary/15" />
          </div>
        ))}
      </div>
    </div>
  )
}

function SettingsPreview() {
  const swatches = ['#e27602', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#06b6d4']
  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Color picker row */}
      <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
        <div className="mb-2 h-1.5 w-20 rounded-full bg-white/20" />
        <div className="flex gap-2">
          {swatches.map(c => (
            <div key={c} className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110" style={{ backgroundColor: c, borderColor: c === '#e27602' ? '#fff' : 'transparent' }} />
          ))}
          <div className="ml-auto flex items-center gap-2">
            <div className="h-5 w-14 rounded-md bg-white/8" />
          </div>
        </div>
      </div>
      {/* Slider rows */}
      {['Background', 'Blur', 'Radius', 'Opacity'].map((label, i) => (
        <div key={label} className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
          <div className="h-1.5 w-16 rounded-full bg-white/20" />
          <div className="flex-1 h-1 rounded-full bg-white/8">
            <div className="h-full rounded-full bg-primary" style={{ width: `${30 + i * 18}%` }} />
          </div>
          <div className="h-1.5 w-6 rounded-full bg-white/15" />
        </div>
      ))}
      {/* Theme preview strip */}
      <div className="flex gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3">
        {['#0a0a0a', '#111', '#1c1c1c', '#222', '#141414'].map(c => (
          <div key={c} className="flex-1 h-8 rounded-lg border border-white/6" style={{ backgroundColor: c }} />
        ))}
      </div>
    </div>
  )
}

const PREVIEWS = {
  instances: <InstancesPreview />,
  search: <SearchPreview />,
  settings: <SettingsPreview />,
}

export default function Showcase() {
  const [active, setActive] = useState('instances')
  const activeTab = TABS.find(t => t.id === active)

  return (
    <section className="relative py-28 md:py-36">
      <div className="absolute inset-0 bg-[#080808]" />

      <div className="relative z-10 mx-auto max-w-7xl px-5 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-14 flex flex-col items-center gap-5 text-center"
        >
          <div className="section-label">See it in action</div>
          <h2 className="section-title">
            Built for the <span className="text-gradient-static italic">details.</span>
          </h2>
          <p className="section-subtitle">
            Every screen is crafted with care. Fast, responsive, and beautiful on any machine.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden rounded-2xl border border-white/8 bg-[#0d0d0d] shadow-[0_40px_100px_rgba(0,0,0,0.6)]"
        >
          {/* Tab bar */}
          <div className="flex items-stretch border-b border-white/6 bg-[#0a0a0a]">
            {/* Window dots */}
            <div className="flex items-center gap-1.5 px-4">
              <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
              <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
            </div>
            {/* Tabs */}
            <div className="flex flex-1 items-center gap-1 px-2 py-2">
              {TABS.map(tab => {
                const Icon = tab.icon
                const isActive = active === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActive(tab.id)}
                    className={`relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-white/8 text-white'
                        : 'text-white/35 hover:bg-white/4 hover:text-white/60'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{tab.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="tab-indicator"
                        className="absolute inset-0 rounded-lg bg-white/6"
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Preview content */}
          <div className="relative min-h-[280px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                {PREVIEWS[active]}
              </motion.div>
            </AnimatePresence>
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
              className="text-[15px] text-white/40 max-w-md"
            >
              {activeTab?.desc}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      </div>
    </section>
  )
}
