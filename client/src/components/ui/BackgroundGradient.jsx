import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import { cn } from '../../lib/utils'

export default function BackgroundGradient({ children, className, containerClassName, accent = '#e27602' }) {
  const borderRef = useRef()

  useEffect(() => {
    const proxy = { angle: 0 }
    const anim = gsap.to(proxy, {
      angle: 360,
      duration: 5,
      repeat: -1,
      ease: 'none',
      paused: true,
      onUpdate: () => {
        if (borderRef.current) {
          borderRef.current.style.background = `conic-gradient(from ${proxy.angle}deg at 50% 50%, transparent 0deg, ${accent}80 90deg, transparent 180deg, ${accent}40 270deg, transparent 360deg)`
        }
      },
    })

    const el = borderRef.current?.parentElement
    const play = () => anim.play()
    const pause = () => anim.pause()

    el?.addEventListener('mouseenter', play)
    el?.addEventListener('mouseleave', pause)

    return () => {
      el?.removeEventListener('mouseenter', play)
      el?.removeEventListener('mouseleave', pause)
      anim.kill()
    }
  }, [accent])

  return (
    <div className={cn('relative group/bg-grad rounded-3xl p-[1px] overflow-hidden transition-all duration-300 hover:-translate-y-1', containerClassName)}>
      <div className="absolute inset-0 rounded-3xl border border-white/5" />
      <div
        ref={borderRef}
        className="absolute inset-0 rounded-3xl opacity-0 group-hover/bg-grad:opacity-100 transition-opacity duration-300"
        style={{ background: `conic-gradient(from 0deg at 50% 50%, transparent, ${accent}60, transparent)` }}
      />
      <div className={cn('relative bg-[#0d0d0e] rounded-[calc(1.5rem-1px)] h-full', className)}>
        {children}
      </div>
    </div>
  )
}
