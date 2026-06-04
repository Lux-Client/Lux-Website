import { motion } from 'framer-motion'
import { Download, Github, ArrowRight } from 'lucide-react'

const PLATFORMS = [
  {
    name: 'Windows',
    badge: '.exe installer',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path d="M0 3.449L9.75 2.1V11.7H0V3.449zm0 9.151h9.75v9.6L0 20.551V12.6zm10.55 0h13.45v10.8L10.55 21.3v-8.7zm0-10.5L24 0v11.7H10.55V2.1z" />
      </svg>
    ),
    color: '#0078d4',
  },
  {
    name: 'Linux',
    badge: '.deb / .rpm / .AppImage',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path d="M12.504 0c-.155 0-.315.008-.48.021C7.576.336 3.746 3.956 3.132 8.741c-.024.191-.035.383-.035.576 0 3.288 2.027 6.215 5.154 7.554.082.034.165.068.248.1-.005.063-.01.126-.01.19 0 1.015.804 1.845 1.794 1.845.992 0 1.795-.83 1.795-1.845 0-.064-.005-.127-.01-.19l.028-.012c3.127-1.34 5.154-4.267 5.154-7.555 0-.19-.011-.382-.035-.573-.614-4.785-4.444-8.405-9.712-8.72A8.28 8.28 0 0012.504 0zm-3.19 17.77c0-.65.526-1.176 1.176-1.176.649 0 1.176.526 1.176 1.176 0 .65-.527 1.176-1.176 1.176-.65 0-1.176-.526-1.176-1.176zM8.24 11.47c-.67 0-1.212-.544-1.212-1.215s.542-1.215 1.212-1.215c.671 0 1.213.544 1.213 1.215s-.542 1.215-1.213 1.215zm7.52 0c-.67 0-1.212-.544-1.212-1.215s.542-1.215 1.212-1.215c.671 0 1.213.544 1.213 1.215s-.542 1.215-1.213 1.215z"/>
      </svg>
    ),
    color: '#f59e0b',
  },
  {
    name: 'macOS',
    badge: 'via install script',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z"/>
      </svg>
    ),
    color: '#e8e8e8',
  },
]

export default function DownloadCTA({ onDownload }) {
  return (
    <section className="relative overflow-hidden py-28 md:py-36">
      <div className="absolute inset-0 bg-[#090909]" />

      {/* Background accent */}
      <div className="absolute inset-0 bg-gradient-radial from-primary/6 via-transparent to-transparent" style={{ backgroundPosition: '50% 100%', backgroundSize: '80% 60%' }} />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <div className="relative z-10 mx-auto max-w-5xl px-5 lg:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mb-14 flex flex-col items-center gap-5 text-center"
        >
          <div className="section-label">Get started</div>
          <h2 className="section-title">
            Ready to <span className="text-gradient-static italic">launch?</span>
          </h2>
          <p className="section-subtitle">
            Free forever. No account required to download. Works on Windows, Linux and macOS.
          </p>
        </motion.div>

        {/* Platform cards */}
        <div className="mb-10 grid gap-4 sm:grid-cols-3">
          {PLATFORMS.map((plat, i) => (
            <motion.button
              key={plat.name}
              onClick={onDownload}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -3, transition: { duration: 0.15 } }}
              whileTap={{ scale: 0.97 }}
              className="group flex flex-col items-center gap-4 rounded-2xl border border-white/6 bg-[#0f0f0f] p-8 text-left transition-all hover:border-white/10 hover:bg-[#111] hover:shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
            >
              <div
                className="flex h-14 w-14 items-center justify-center rounded-xl transition-all duration-300 group-hover:scale-110"
                style={{ backgroundColor: plat.color + '14', color: plat.color }}
              >
                {plat.icon}
              </div>
              <div>
                <div className="text-center text-base font-bold text-white">{plat.name}</div>
                <div className="text-center text-xs text-white/30 mt-1">{plat.badge}</div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white/30 transition-colors group-hover:text-primary">
                <Download className="h-3 w-3" />
                Download
                <ArrowRight className="h-3 w-3 translate-x-0 transition-transform group-hover:translate-x-0.5" />
              </div>
            </motion.button>
          ))}
        </div>

        {/* Main download button */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center gap-4"
        >
          <button
            onClick={onDownload}
            className="shine group relative flex items-center gap-3 overflow-hidden rounded-xl bg-primary px-10 py-4 text-base font-bold text-black shadow-glow transition-all hover:bg-primary-light hover:shadow-glow-lg active:scale-[0.97]"
          >
            <Download className="h-5 w-5" />
            Download Lux Client
          </button>
          <div className="flex items-center gap-3 text-xs text-white/20">
            <a
              href="https://github.com/Lux-Client/Lux-Client"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 transition-colors hover:text-white/50"
            >
              <Github className="h-3 w-3" />
              View source on GitHub
            </a>
            <span>·</span>
            <span>Always free &amp; open source</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
