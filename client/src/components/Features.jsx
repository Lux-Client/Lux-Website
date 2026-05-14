import { useEffect, useRef } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import BackgroundGradient from './ui/BackgroundGradient'

gsap.registerPlugin(ScrollTrigger)

const features = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    title: 'Blazing Fast',
    desc: 'Optimized networking and lightweight core ensures lightning-fast launch times with minimal resource usage.',
    accent: '#e27602',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    title: 'Integrated Mods',
    desc: 'Direct support for Fabric, Forge, NeoForge, and Quilt with one-click imports and smart compatibility checks.',
    accent: '#7c3aed',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    title: 'Pro Visuals',
    desc: 'Premium 3D skin viewer with high-resolution previews, cape support, and real-time animation playback.',
    accent: '#3b82f6',
  },
]

export default function Features() {
  const sectionRef = useRef()

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.features-heading', {
        scrollTrigger: {
          trigger: '#features',
          start: 'top 80%',
          toggleActions: 'play none none reverse',
        },
        opacity: 0,
        y: 60,
        duration: 0.9,
        ease: 'power3.out',
      })

      gsap.from('.feature-card', {
        scrollTrigger: {
          trigger: '#features',
          start: 'top 70%',
          toggleActions: 'play none none reverse',
        },
        opacity: 0,
        y: 80,
        scale: 0.95,
        stagger: 0.15,
        duration: 0.9,
        ease: 'power3.out',
      })

      gsap.from('.features-divider', {
        scrollTrigger: {
          trigger: '#features',
          start: 'top 85%',
        },
        scaleX: 0,
        duration: 1.2,
        ease: 'power3.out',
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} id="features" className="py-32 relative">
      <div className="absolute inset-0 bg-[#09090b]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_100%_40%_at_50%_0%,rgba(226,118,2,0.04),transparent)]" />

      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: 'linear-gradient(rgba(226,118,2,1) 1px, transparent 1px), linear-gradient(90deg, rgba(226,118,2,1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
        <div className="features-divider h-[1px] bg-gradient-to-r from-transparent via-primary/30 to-transparent mb-20 origin-left" />

        <div className="features-heading text-center mb-20">
          <p className="text-primary font-bold uppercase tracking-[0.3em] text-sm mb-4">What's inside</p>
          <h2 className="text-5xl md:text-6xl font-black text-white mb-6 tracking-tight">
            Everything you <span className="text-gradient italic">need.</span>
          </h2>
          <p className="text-gray-400 max-w-xl mx-auto text-lg leading-relaxed">
            Lux Client packs powerful tools into a beautiful, lightweight interface that stays out of your way.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <BackgroundGradient key={i} accent={feature.accent} className="feature-card">
              <div className="p-10 h-full flex flex-col">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8 transition-all duration-300 group-hover/bg-grad:scale-110"
                  style={{ background: `${feature.accent}18`, color: feature.accent }}
                >
                  {feature.icon}
                </div>
                <h3 className="text-2xl font-bold text-white mb-4">{feature.title}</h3>
                <p className="text-gray-400 leading-relaxed flex-1">{feature.desc}</p>
                <div
                  className="mt-8 h-[2px] rounded-full w-12 transition-all duration-500 group-hover/bg-grad:w-full"
                  style={{ background: `linear-gradient(to right, ${feature.accent}, transparent)` }}
                />
              </div>
            </BackgroundGradient>
          ))}
        </div>
      </div>
    </section>
  )
}
