import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Eye } from 'lucide-react'

/* Vorschau eines Shop-Artikels im Admin-Panel, so wie er im Spiel aussieht:
   cosmetic:<id> und emote:<id> als 3D-Modell (Geometrie direkt aus dem Mod exportiert),
   name:/line: als Namensschild mit denselben Farb- und Animationsformeln wie NameStyle.java. */

const MinecraftViewer = lazy(() => import('../../lux/MinecraftViewer'))

// ---------------------------------------------------------------- Namens-Styles (wie NameStyle.java)

const C1 = 0xffaa00, C2 = 0xff55ff
const frac = x => x - Math.floor(x)
const lerp = (a, b, t) => {
  t = Math.max(0, Math.min(1, t))
  const ch = s => (a >> s & 255) + ((b >> s & 255) - (a >> s & 255)) * t
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}
const hsv = (h, s, v) => {
  h = frac(h)
  const i = Math.floor(h * 6), f = h * 6 - i
  const p = v * (1 - s), q = v * (1 - f * s), u = v * (1 - (1 - f) * s)
  const [r, g, b] = [[v, u, p], [q, v, p], [p, v, u], [p, q, v], [u, p, v], [v, p, q]][i % 6]
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255)
}
const noise = (i, t) => 0.5 + 0.5 * (Math.sin(t + i * 1.7) * 0.5 + Math.sin(t * 1.9 + i * 0.6) * 0.3 + Math.sin(t * 3.7 + i * 2.3) * 0.2)
const sparkle = (i, t) => {
  const phase = ((Math.imul(i, 0x9e3779b9) >>> 16) & 0xffff) / 65535
  return frac(t * 0.9 + phase * 7) < 0.12
}

function charColor(mode, i, len, t) {
  const pos = len <= 1 ? 0 : i / (len - 1)
  switch (mode) {
    case 1: return C1
    case 2: { const f = frac(pos * 0.8 - t * 0.5); return lerp(C1, C2, f < 0.5 ? f * 2 : 2 - f * 2) }
    case 3: return hsv(t * 0.4 - pos * 0.7, 0.75, 1)
    case 4: return lerp(C1, C2, 0.5 + 0.5 * Math.sin(t * 3))
    case 5: return sparkle(i, t) ? lerp(C1, 0xffffff, 0.75) : C1
    case 6: return lerp(0xff2a00, 0xffd200, noise(i, t * 6))
    case 7: return lerp(0x2a7fff, 0xe8ffff, noise(i, t * 3))
    default: return 0xffffff
  }
}

function charDy(anim, i, t) {
  switch (anim) {
    case 1: return Math.sin(t * 6 - i * 0.7) * 1.5
    case 2: return -Math.abs(Math.sin(t * 4)) * 2.5
    case 3: return Math.sin(t * 2) * 1.2
    case 4: return (noise(i, t * 25) - 0.5) * 1.4
    default: return 0
  }
}

/** Ein Text wie im Spiel über dem Kopf, Zeichen für Zeichen eingefärbt und bewegt. */
function StyledText({ text, mode = 0, anim = 0, bold = false, size = 26, dim = false }) {
  const refs = useRef([])
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = () => {
      const t = (performance.now() - start) / 1000
      refs.current.forEach((el, i) => {
        if (!el) return
        el.style.color = `#${charColor(mode, i, text.length, t).toString(16).padStart(6, '0')}`
        el.style.transform = `translateY(${charDy(anim, i, t) * size / 8}px)`
      })
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [mode, anim, text, size])
  return (
    <span
      className="inline-flex"
      style={{ fontSize: size, fontWeight: bold ? 900 : 600, fontFamily: '"Minecraft", "Press Start 2P", ui-monospace, monospace', textShadow: `${size / 8}px ${size / 8}px 0 rgba(0,0,0,.55)`, opacity: dim ? 0.55 : 1 }}
    >
      {[...text].map((ch, i) => (
        <span key={i} ref={el => { refs.current[i] = el }} className="inline-block whitespace-pre will-change-transform">{ch}</span>
      ))}
    </span>
  )
}

function NamePreview({ item }) {
  const [kind, what, n] = item.split(':')
  const v = Number(n) || 0
  const line = kind === 'line'
  const name = {
    mode: !line && what === 'color' ? v : 0,
    anim: !line && what === 'anim' ? v : 0,
    bold: !line && what === 'bold',
  }
  const second = {
    show: line || what === 'line',
    mode: line && what === 'color' ? v : 0,
    anim: line && what === 'anim' ? v : 0,
    bold: line && what === 'bold',
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 bg-[radial-gradient(circle_at_50%_40%,#2c3a4a,#11141a_75%)]">
      <div className="flex flex-col items-center gap-1 rounded-md bg-black/35 px-4 py-2">
        {second.show && <StyledText text="Lux Client Fan" mode={second.mode} anim={second.anim} bold={second.bold} size={18} />}
        <StyledText text="Steve" mode={name.mode} anim={name.anim} bold={name.bold} />
      </div>
      <p className="mt-3 text-[11px] text-white/30">
        {what === 'line' ? 'Own second line above the name' : 'Example with the default colours (players pick their own)'}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- Vorschau-Panel

export default function LuxItemPreview({ item }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [item?.item])
  if (!item) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-white/30">
        <div className="flex flex-col items-center gap-2"><Eye className="h-6 w-6" /> Click an item to see how it looks in game.</div>
      </div>
    )
  }
  const [kind, id] = item.item.split(':')
  if (kind === 'name' || kind === 'line') return <NamePreview item={item.item} />
  if (failed) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-sm text-white/40">
        No 3D model for this item yet — run tools/export-cosmetics.sh in the Lux Client repo after adding new cosmetics.
      </div>
    )
  }
  return (
    <Suspense fallback={<div className="h-full animate-pulse bg-white/4" />}>
      <div className="h-full bg-[radial-gradient(circle_at_50%_35%,#2c2c38,#0d0d10_70%)]">
        <MinecraftViewer
          key={item.item}
          cosmetic={kind === 'cosmetic' ? id : null}
          emote={kind === 'emote' ? id : null}
          onState={s => s === 'error' && setFailed(true)}
        />
      </div>
    </Suspense>
  )
}
