import { useEffect, useState, useRef } from 'react'
import { gsap } from 'gsap'

const REPO = 'Lux-Client/Lux-Client'
const fallback = {
  version: 'v1.3.3',
  win: `https://github.com/${REPO}/releases/latest/download/Lux-setup.exe`,
  deb: `https://github.com/${REPO}/releases/latest/download/Lux-setup.deb`,
  rpm: `https://github.com/${REPO}/releases/latest/download/Lux-setup.rpm`,
  appimage: `https://github.com/${REPO}/releases/latest/download/Lux-setup.AppImage`,
  mac: `https://github.com/${REPO}/releases/latest/download/Lux-setup.dmg`,
}

export default function DownloadModal({ isOpen, onClose }) {
  const [links, setLinks] = useState(fallback)
  const [copied, setCopied] = useState(null)
  const [macModal, setMacModal] = useState(false)
  const overlayRef = useRef()
  const cardRef = useRef()

  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return
        const assets = data.assets || []
        const getAsset = ext => assets.find(a => a.name.toLowerCase().endsWith(ext))?.browser_download_url
        setLinks({
          version: data.tag_name?.startsWith('v') ? data.tag_name : `v${data.tag_name}`,
          win: getAsset('.exe') || fallback.win,
          deb: getAsset('.deb') || fallback.deb,
          rpm: getAsset('.rpm') || fallback.rpm,
          appimage: getAsset('.appimage') || fallback.appimage,
          mac: getAsset('.dmg') || fallback.mac,
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3 })
      gsap.fromTo(cardRef.current, { opacity: 0, y: 40, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.7)' })
    } else {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    } catch {}
  }

  if (!isOpen) return null

  const platforms = [
    { href: links.win, label: 'Windows (.exe)', badge: null, icon: '⊞', onClick: null },
    { href: links.deb, label: 'Linux (.deb)', badge: 'Debian / Ubuntu', icon: '🐧', onClick: null },
    { href: links.rpm, label: 'Linux (.rpm)', badge: 'Fedora / RedHat', icon: '🐧', onClick: null },
    { href: links.appimage, label: 'Linux (.AppImage)', badge: 'Universal', icon: '🐧', onClick: null },
    { href: '#', label: 'macOS Support', badge: '.dmg', icon: '', onClick: (e) => { e.preventDefault(); setMacModal(true) } },
  ]

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/80 backdrop-blur-lg"
        onClick={onClose}
      />

      <div
        ref={cardRef}
        className="relative bg-[#111114] border border-white/10 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-3xl font-black text-white uppercase tracking-tight">Choose Platform</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-gray-400 mb-8">Select your operating system to download Lux Client.</p>

        <div className="space-y-3">
          {platforms.map(({ href, label, badge, icon, onClick }) => (
            <a
              key={label}
              href={href}
              onClick={onClick}
              target={href !== '#' && !onClick ? '_blank' : undefined}
              rel="noopener noreferrer"
              className="flex items-center justify-between bg-white/5 hover:bg-primary hover:text-black p-4 rounded-2xl transition-all group font-bold"
            >
              <span className="flex items-center gap-3">
                <span className="text-xl">{icon}</span>
                {label}
              </span>
              {badge && <span className="text-xs uppercase font-black opacity-50 tracking-widest group-hover:opacity-70">{badge}</span>}
            </a>
          ))}
        </div>

        <div className="mt-8 pt-8 border-t border-white/5 space-y-4">
          <h4 className="text-sm font-black text-white uppercase tracking-[0.2em]">Quick Install (CLI)</h4>
          {[
            { id: 'linux', label: 'Linux & macOS', cmd: 'curl -sSL https://lux.pluginhub.de/install.sh | bash' },
            { id: 'win', label: 'Windows (PowerShell)', cmd: 'iwr https://lux.pluginhub.de/install.ps1 | iex' },
          ].map(({ id, label, cmd }) => (
            <div key={id} className="bg-black/40 border border-white/5 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</span>
                <button
                  onClick={() => copyToClipboard(cmd, id)}
                  className="text-gray-500 hover:text-primary transition-colors p-1"
                >
                  {copied === id
                    ? <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  }
                </button>
              </div>
              <code className="text-primary text-xs font-mono break-all leading-relaxed">{cmd}</code>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-6 text-gray-500 hover:text-white transition-colors w-full text-sm font-bold uppercase tracking-widest py-2"
        >
          Close
        </button>
      </div>

      {macModal && (
        <div className="absolute inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMacModal(false)} />
          <div className="relative bg-[#111114] border border-white/10 w-full max-w-sm rounded-[2rem] p-8 shadow-2xl">
            <h3 className="text-2xl font-black text-white mb-2 uppercase">macOS Support</h3>
            <p className="text-gray-400 mb-6 text-sm">No native .dmg package, but macOS is supported via the install script.</p>
            <div className="space-y-3 mb-6">
              <div className="bg-black/40 border border-white/10 rounded-2xl p-4 text-sm text-gray-300">
                <p className="font-bold text-white mb-1">Recommended</p>
                <p>macOS 12+ — run in Terminal</p>
              </div>
              <div className="bg-black/40 border border-white/10 rounded-2xl p-4 text-sm">
                <code className="text-primary text-xs font-mono break-all">curl -sSL https://lux.pluginhub.de/install.sh | bash</code>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <a href="https://pluginhub.de/discord.html" target="_blank" rel="noopener noreferrer" className="text-center bg-white/5 hover:bg-white/10 border border-white/10 text-white py-3 rounded-xl font-bold transition-all text-sm">Get Help</a>
              <button onClick={() => setMacModal(false)} className="bg-primary hover:bg-primary-dark text-black py-3 rounded-xl font-black transition-all text-sm">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
