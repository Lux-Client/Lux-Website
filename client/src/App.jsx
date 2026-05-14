import { useState } from 'react'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Features from './components/Features'
import Footer from './components/Footer'
import DownloadModal from './components/DownloadModal'

// v2 – React/R3F/GSAP redesign
export default function App() {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="bg-background min-h-screen">
      <Navbar onDownload={() => setModalOpen(true)} />
      <Hero onDownload={() => setModalOpen(true)} />
      <Features />
      <Footer />
      <DownloadModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
