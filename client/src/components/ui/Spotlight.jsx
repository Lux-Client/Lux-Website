import { useRef, useState, useEffect } from 'react'

export default function Spotlight() {
  const containerRef = useRef()
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [opacity, setOpacity] = useState(0)

  useEffect(() => {
    const handleMouseMove = (e) => {
      setPos({ x: e.clientX, y: e.clientY })
    }
    const handleMouseEnter = () => setOpacity(1)
    const handleMouseLeave = () => setOpacity(0)

    window.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseenter', handleMouseEnter)
    document.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseenter', handleMouseEnter)
      document.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed inset-0 z-30 transition-opacity duration-500"
      style={{ opacity }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(700px circle at ${pos.x}px ${pos.y}px, rgba(226,118,2,0.07), transparent 40%)`,
        }}
      />
    </div>
  )
}
