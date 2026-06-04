import { useState } from 'react'
import Navbar from '../components/Navbar'
import Hero from '../components/Hero'
import StatsBar from '../components/StatsBar'
import Features from '../components/Features'
import Showcase from '../components/Showcase'
import DownloadCTA from '../components/DownloadCTA'
import Footer from '../components/Footer'
import DownloadModal from '../components/DownloadModal'

export default function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="bg-background min-h-screen">
      <Navbar onDownload={() => setModalOpen(true)} />
      <Hero onDownload={() => setModalOpen(true)} />
      <StatsBar />
      <Features />
      <Showcase />
      <DownloadCTA onDownload={() => setModalOpen(true)} />
      <Footer />
      <DownloadModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
