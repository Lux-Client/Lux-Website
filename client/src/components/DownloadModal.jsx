import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Download, Copy, Check, Terminal } from 'lucide-react'

const REPO = 'Lux-Client/Lux-Client'
const fallback = {
  version: 'v1.3.3',
  win:      `https://github.com/${REPO}/releases/latest/download/Lux-setup.exe`,
  deb:      `https://github.com/${REPO}/releases/latest/download/Lux-setup.deb`,
  rpm:      `https://github.com/${REPO}/releases/latest/download/Lux-setup.rpm`,
  appimage: `https://github.com/${REPO}/releases/latest/download/Lux-setup.AppImage`,
  mac:      `https://github.com/${REPO}/releases/latest/download/Lux-setup.dmg`,
}

const PLATFORMS = (links) => [
  {
    href: links.win,
    label: 'Windows',
    sub: '.exe installer',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M0 3.449L9.75 2.1V11.7H0V3.449zm0 9.151h9.75v9.6L0 20.551V12.6zm10.55 0h13.45v10.8L10.55 21.3v-8.7zm0-10.5L24 0v11.7H10.55V2.1z" />
      </svg>
    ),
    color: '#0078d4',
  },
  {
    href: links.deb,
    label: 'Linux (Debian)',
    sub: '.deb — Ubuntu / Debian',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12.504 0c-.155 0-.315.008-.48.021C7.576.336 3.746 3.956 3.132 8.741c-.024.191-.035.383-.035.576 0 3.288 2.027 6.215 5.154 7.554.082.034.165.068.248.1-.005.063-.01.126-.01.19 0 1.015.804 1.845 1.794 1.845.992 0 1.795-.83 1.795-1.845 0-.064-.005-.127-.01-.19l.028-.012c3.127-1.34 5.154-4.267 5.154-7.555 0-.19-.011-.382-.035-.573-.614-4.785-4.444-8.405-9.712-8.72A8.28 8.28 0 0012.504 0zm-3.19 17.77c0-.65.526-1.176 1.176-1.176.649 0 1.176.526 1.176 1.176 0 .65-.527 1.176-1.176 1.176-.65 0-1.176-.526-1.176-1.176z"/>
      </svg>
    ),
    color: '#f59e0b',
  },
  {
    href: links.rpm,
    label: 'Linux (RPM)',
    sub: '.rpm — Fedora / RedHat',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12.504 0c-.155 0-.315.008-.48.021C7.576.336 3.746 3.956 3.132 8.741c-.024.191-.035.383-.035.576 0 3.288 2.027 6.215 5.154 7.554.082.034.165.068.248.1-.005.063-.01.126-.01.19 0 1.015.804 1.845 1.794 1.845.992 0 1.795-.83 1.795-1.845 0-.064-.005-.127-.01-.19l.028-.012c3.127-1.34 5.154-4.267 5.154-7.555 0-.19-.011-.382-.035-.573-.614-4.785-4.444-8.405-9.712-8.72A8.28 8.28 0 0012.504 0z"/>
      </svg>
    ),
    color: '#ef4444',
  },
  {
    href: links.appimage,
    label: 'Linux (AppImage)',
    sub: 'Universal Linux',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12.504 0c-.155 0-.315.008-.48.021C7.576.336 3.746 3.956 3.132 8.741c-.024.191-.035.383-.035.576 0 3.288 2.027 6.215 5.154 7.554.082.034.165.068.248.1-.005.063-.01.126-.01.19 0 1.015.804 1.845 1.794 1.845.992 0 1.795-.83 1.795-1.845 0-.064-.005-.127-.01-.19l.028-.012c3.127-1.34 5.154-4.267 5.154-7.555 0-.19-.011-.382-.035-.573-.614-4.785-4.444-8.405-9.712-8.72A8.28 8.28 0 0012.504 0z"/>
      </svg>
    ),
    color: '#f59e0b',
  },
  {
    href: '#mac',
    label: 'macOS',
    sub: 'via install script',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701z"/>
      </svg>
    ),
    color: '#d1d5db',
    isMac: true,
  },
]

const CLI_CMDS = [
  { id: 'linux', label: 'Linux & macOS', cmd: 'curl -sSL https://lux.pluginhub.de/install.sh | bash' },
  { id: 'win',   label: 'Windows (PowerShell)', cmd: 'iwr https://lux.pluginhub.de/install.ps1 | iex' },
]

export default function DownloadModal({ isOpen, onClose }) {
  const [links, setLinks] = useState(fallback)
  const [copied, setCopied] = useState(null)
  const [macExpanded, setMacExpanded] = useState(false)

  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const assets = data.assets || []
        const getAsset = ext => assets.find(a => a.name.toLowerCase().endsWith(ext))?.browser_download_url
        setLinks({
          version:  data.tag_name?.startsWith('v') ? data.tag_name : `v${data.tag_name}`,
          win:      getAsset('.exe') || fallback.win,
          deb:      getAsset('.deb') || fallback.deb,
          rpm:      getAsset('.rpm') || fallback.rpm,
          appimage: getAsset('.appimage') || fallback.appimage,
          mac:      getAsset('.dmg') || fallback.mac,
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else { document.body.style.overflow = ''; setMacExpanded(false) }
  }, [isOpen])

  const copy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    } catch {}
  }

  const platforms = PLATFORMS(links)

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal card */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative z-10 w-full max-w-[440px] overflow-y-auto max-h-[90vh] rounded-2xl border border-white/8 bg-[#0f0f0f] shadow-[0_40px_120px_rgba(0,0,0,0.8)]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/6 px-6 py-5">
              <div>
                <h3 className="text-lg font-bold text-white">Download Lux Client</h3>
                {links.version && (
                  <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white/30">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
                    Latest: {links.version}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/30 transition-colors hover:bg-white/6 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Platform list */}
            <div className="flex flex-col gap-1.5 p-4">
              {platforms.map(plat => {
                if (plat.isMac) {
                  return (
                    <div key={plat.label}>
                      <button
                        onClick={() => setMacExpanded(v => !v)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] p-3.5 transition-all hover:border-white/10 hover:bg-white/4"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0" style={{ backgroundColor: plat.color + '14', color: plat.color }}>
                          {plat.icon}
                        </div>
                        <div className="flex-1 text-left">
                          <div className="text-sm font-semibold text-white">{plat.label}</div>
                          <div className="text-xs text-white/30">{plat.sub}</div>
                        </div>
                        <motion.div animate={{ rotate: macExpanded ? 90 : 0 }} className="text-white/20">
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </motion.div>
                      </button>
                      <AnimatePresence>
                        {macExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="mt-1.5 rounded-xl border border-white/6 bg-white/[0.02] p-4 text-sm">
                              <p className="mb-3 text-white/40">No native .dmg, but macOS 12+ is fully supported via the install script:</p>
                              <div className="flex items-center gap-2 rounded-lg bg-black/40 border border-white/6 p-3 font-mono text-xs text-primary">
                                <code className="flex-1 break-all">curl -sSL https://lux.pluginhub.de/install.sh | bash</code>
                                <button
                                  onClick={() => copy('curl -sSL https://lux.pluginhub.de/install.sh | bash', 'mac-cmd')}
                                  className="flex-shrink-0 text-white/30 transition-colors hover:text-white"
                                >
                                  {copied === 'mac-cmd' ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                }
                return (
                  <a
                    key={plat.label}
                    href={plat.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-xl border border-white/6 bg-white/[0.02] p-3.5 transition-all hover:border-white/10 hover:bg-white/4"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0 transition-all group-hover:scale-105" style={{ backgroundColor: plat.color + '14', color: plat.color }}>
                      {plat.icon}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-white">{plat.label}</div>
                      <div className="text-xs text-white/30">{plat.sub}</div>
                    </div>
                    <Download className="h-3.5 w-3.5 text-white/20 transition-colors group-hover:text-white/50" />
                  </a>
                )
              })}
            </div>

            {/* CLI section */}
            <div className="border-t border-white/6 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-white/25">
                <Terminal className="h-3.5 w-3.5" />
                Quick Install (CLI)
              </div>
              <div className="flex flex-col gap-2">
                {CLI_CMDS.map(({ id, label, cmd }) => (
                  <div key={id} className="rounded-xl border border-white/5 bg-black/30 p-3">
                    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/25">{label}</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 break-all font-mono text-xs text-primary leading-relaxed">{cmd}</code>
                      <button
                        onClick={() => copy(cmd, id)}
                        className="flex-shrink-0 rounded-md p-1.5 text-white/25 transition-colors hover:bg-white/5 hover:text-white"
                      >
                        {copied === id ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
