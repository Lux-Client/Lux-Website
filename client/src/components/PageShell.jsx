import { useState } from 'react'
import Navbar from './Navbar'
import Footer from './Footer'
import DownloadModal from './DownloadModal'

export default function PageShell({ children, showFooter = true }) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background text-gray-200">
      <Navbar onDownload={() => setModalOpen(true)} />
      {children}
      {showFooter && <Footer />}
      <DownloadModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
