import { useEffect, useState } from 'react'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import StatsBar from '../components/StatsBar'
import Features from '../components/Features'
import Showcase from '../components/Showcase'
import DownloadCTA from '../components/DownloadCTA'
import Footer from '../components/Footer'
import DownloadModal from '../components/DownloadModal'

const REPO = 'Lux-Client/Lux-Client'

const FALLBACK_RELEASE = {
  version: null,
  win:      `https://github.com/${REPO}/releases/latest/download/Lux-setup.exe`,
  deb:      `https://github.com/${REPO}/releases/latest/download/Lux-setup.deb`,
  rpm:      `https://github.com/${REPO}/releases/latest/download/Lux-setup.rpm`,
  appimage: `https://github.com/${REPO}/releases/latest/download/Lux-setup.AppImage`,
  mac:      `https://github.com/${REPO}/releases/latest/download/Lux-setup.dmg`,
}

export default function LandingPage() {
  const [modalOpen,    setModalOpen]    = useState(false)
  const [releaseData,  setReleaseData]  = useState(FALLBACK_RELEASE)

  useEffect(() => {
    fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.tag_name) return
        const tag     = data.tag_name
        const version = tag.startsWith('v') ? tag : `v${tag}`
        const assets  = data.assets || []
        const getUrl  = ext =>
          assets.find(a => a.name.toLowerCase().endsWith(ext.toLowerCase()))
            ?.browser_download_url

        setReleaseData({
          version,
          win:      getUrl('.exe')      || FALLBACK_RELEASE.win,
          deb:      getUrl('.deb')      || FALLBACK_RELEASE.deb,
          rpm:      getUrl('.rpm')      || FALLBACK_RELEASE.rpm,
          appimage: getUrl('.AppImage') || getUrl('.appimage') || FALLBACK_RELEASE.appimage,
          mac:      getUrl('.dmg')      || FALLBACK_RELEASE.mac,
        })
      })
      .catch(() => {})
  }, [])

  return (
    <div className="bg-background min-h-screen">
      <Navbar onDownload={() => setModalOpen(true)} />
      <Hero onDownload={() => setModalOpen(true)} version={releaseData.version} />
      <StatsBar />
      <Features />
      <Showcase />
      <DownloadCTA onDownload={() => setModalOpen(true)} />
      <Footer />
      <DownloadModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        releaseData={releaseData}
      />
    </div>
  )
}
