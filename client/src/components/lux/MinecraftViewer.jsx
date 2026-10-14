import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/* 3D-Vorschau eines Minecraft-Spielers wie im Spiel: Skin (klassisch oder schmal), Cape und
   Lux-Cosmetics bzw. ein laufendes Emote. Das Modell ist genau wie Minecrafts PlayerModel aufgebaut
   (gleiche Gelenke, gleiche Skin-Bereiche, Pixel als Einheit, y nach unten), die Cosmetics kommen als
   fertige Flächen aus dem Mod-Code (tools/export-cosmetics.sh im Lux-Client-Repo). */

const PARTS = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']

// ---------------------------------------------------------------- Daten der Cosmetics

const cache = new Map()

async function gunzipJson(url) {
  if (cache.has(url)) return cache.get(url)
  const p = (async () => {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    // Manche Server entpacken .gz schon selbst - dann ist es direkt JSON
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))
      return JSON.parse(await new Response(stream).text())
    }
    return JSON.parse(new TextDecoder().decode(buf))
  })()
  cache.set(url, p)
  p.catch(() => cache.delete(url))
  return p
}

export function loadCosmeticIndex() {
  if (!cache.has('index')) {
    const p = fetch('/lux-cosmetics/index.json').then(r => (r.ok ? r.json() : { cosmetics: {}, emotes: {} }))
    cache.set('index', p)
  }
  return cache.get('index')
}

const loadCosmetic = id => gunzipJson(`/lux-cosmetics/c/${id}.json.gz`)
const loadEmote = id => gunzipJson(`/lux-cosmetics/e/${id}.json.gz`)

// ---------------------------------------------------------------- Geometrie

/** Quader wie Minecrafts ModelPart.Cube: gleiche Ecken, gleiche Textur-Bereiche. */
function cube(x, y, z, w, h, d, u, v, grow, texW, texH) {
  const x0 = x - grow, y0 = y - grow, z0 = z - grow
  const x1 = x + w + grow, y1 = y + h + grow, z1 = z + d + grow
  const V = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ]
  const f7 = u, f8 = u + d, f9 = u + d + w, f10 = u + d + w + w, f11 = u + d + w + d, f12 = u + d + w + d + w
  const f13 = v, f14 = v + d, f15 = v + d + h
  // [Ecken, u1, v1, u2, v2] - wie Minecraft: Ecke 0 = (u2,v1), 1 = (u1,v1), 2 = (u1,v2), 3 = (u2,v2)
  const faces = [
    [[5, 4, 0, 1], f8, f13, f9, f14],
    [[2, 3, 7, 6], f9, f14, f10, f13],
    [[0, 4, 7, 3], f7, f14, f8, f15],
    [[1, 0, 3, 2], f8, f14, f9, f15],
    [[5, 1, 2, 6], f9, f14, f11, f15],
    [[4, 5, 6, 7], f11, f14, f12, f15],
  ]
  const pos = [], uv = [], idx = []
  for (const [c, u1, v1, u2, v2] of faces) {
    const base = pos.length / 3
    // ein Hauch nach innen, damit an den Kanten keine Nachbar-Pixel durchblitzen
    const e = 0.02, du = u2 > u1 ? e : -e, dv = v2 > v1 ? e : -e
    const a1 = u1 + du, a2 = u2 - du, b1 = v1 + dv, b2 = v2 - dv
    const uvs = [[a2, b1], [a1, b1], [a1, b2], [a2, b2]]
    for (let i = 0; i < 4; i++) {
      pos.push(...V[c[i]])
      uv.push(uvs[i][0] / texW, 1 - uvs[i][1] / texH)
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// HD-Texturen aus dem Export: Atlas-Seiten (tex >= 0) und zur Laufzeit gemalte Bilder (tex < 0)
const texCache = new Map()
function hdTexture(tex) {
  const url = tex >= 0 ? `/lux-cosmetics/atlas${tex}.png` : `/lux-cosmetics/d/${-1 - tex}.png`
  if (!texCache.has(url)) {
    const t = new THREE.TextureLoader().load(url)
    t.flipY = false
    t.colorSpace = THREE.SRGBColorSpace
    t.magFilter = THREE.LinearFilter
    texCache.set(url, t)
  }
  return texCache.get(url)
}

const unpack = argb => {
  argb >>>= 0
  return [((argb >> 16) & 255) / 255, ((argb >> 8) & 255) / 255, (argb & 255) / 255, ((argb >>> 24) & 255) / 255]
}

function texMaterial(tex, glow) {
  const opts = { map: hdTexture(tex), vertexColors: true, side: THREE.DoubleSide, transparent: true }
  return glow
    ? new THREE.MeshBasicMaterial({ ...opts, depthWrite: false, blending: THREE.AdditiveBlending })
    : new THREE.MeshLambertMaterial({ ...opts, alphaTest: 0.08 })
}

/**
 * Flächen aus dem Export als Meshes. Drei Arten (an der Länge erkannt):
 * 14 = einfarbig [Ecken x12, argb, leuchtet], 23 = mit Textur [Ecken x12, uv x8, argb, art, tex],
 * 16 = Bild zur Kamera [Mitte x3, halbe Größe, Drehung, uv x8, argb, art, tex].
 */
function quadsToMeshes(quads) {
  const groups = { solid: [], clear: [], glow: [] }
  const textured = new Map()
  const sprites = new Map()
  for (const q of quads) {
    if (q.length === 23) {
      const k = `${q[22]}:${q[21]}`
      if (!textured.has(k)) textured.set(k, [])
      textured.get(k).push(q)
      continue
    }
    if (q.length === 16) {
      const k = `${q[15]}:${q[14]}`
      if (!sprites.has(k)) sprites.set(k, [])
      sprites.get(k).push(q)
      continue
    }
    const argb = q[12] >>> 0
    const a = (argb >>> 24) & 255
    const key = q[13] ? 'glow' : a < 250 ? 'clear' : 'solid'
    groups[key].push(q)
  }
  const out = []
  for (const [key, list] of Object.entries(groups)) {
    if (!list.length) continue
    const pos = new Float32Array(list.length * 18)
    const col = new Float32Array(list.length * 24)
    let p = 0, c = 0
    for (const q of list) {
      const [r, gg, b, a] = unpack(q[12])
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos[p++] = q[i * 3]; pos[p++] = q[i * 3 + 1]; pos[p++] = q[i * 3 + 2]
      }
      for (let i = 0; i < 6; i++) {
        col[c++] = r; col[c++] = gg; col[c++] = b; col[c++] = a
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 4))
    g.computeVertexNormals()
    const opts = { vertexColors: true, side: THREE.DoubleSide, transparent: key !== 'solid', depthWrite: key === 'solid' }
    const mat = key === 'glow' ? new THREE.MeshBasicMaterial(opts) : new THREE.MeshLambertMaterial(opts)
    out.push(new THREE.Mesh(g, mat))
  }
  for (const [key, list] of textured) {
    const [tex, mode] = key.split(':').map(Number)
    const pos = new Float32Array(list.length * 18)
    const uv = new Float32Array(list.length * 12)
    const col = new Float32Array(list.length * 24)
    let p = 0, u = 0, c = 0
    for (const q of list) {
      const [r, gg, b, a] = unpack(q[20])
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos[p++] = q[i * 3]; pos[p++] = q[i * 3 + 1]; pos[p++] = q[i * 3 + 2]
        uv[u++] = q[12 + i * 2]; uv[u++] = q[13 + i * 2]
        col[c++] = r; col[c++] = gg; col[c++] = b; col[c++] = a
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setAttribute('color', new THREE.BufferAttribute(col, 4))
    g.computeVertexNormals()
    const mesh = new THREE.Mesh(g, texMaterial(tex, mode === 1))
    if (mode === 1) mesh.renderOrder = 2
    out.push(mesh)
  }
  for (const [key, list] of sprites) {
    const [tex, mode] = key.split(':').map(Number)
    const pos = new Float32Array(list.length * 18)
    const uv = new Float32Array(list.length * 12)
    const col = new Float32Array(list.length * 24)
    let u = 0, c = 0
    for (const q of list) {
      const [r, gg, b, a] = unpack(q[13])
      for (const i of [0, 1, 2, 0, 2, 3]) {
        uv[u++] = q[5 + i * 2]; uv[u++] = q[6 + i * 2]
        col[c++] = r; col[c++] = gg; col[c++] = b; col[c++] = a
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setAttribute('color', new THREE.BufferAttribute(col, 4))
    const mesh = new THREE.Mesh(g, texMaterial(tex, mode === 1))
    mesh.frustumCulled = false
    mesh.renderOrder = 3
    const inv = new THREE.Matrix4(), right = new THREE.Vector3(), up = new THREE.Vector3()
    const sx = [-1, 1, 1, -1], sy = [1, 1, -1, -1]
    // jedes Bild vor dem Zeichnen zur Kamera drehen (im Raum des Körperteils)
    mesh.onBeforeRender = (r, sc, camera) => {
      inv.copy(mesh.matrixWorld).invert()
      right.set(1, 0, 0).applyQuaternion(camera.quaternion).transformDirection(inv)
      up.set(0, 1, 0).applyQuaternion(camera.quaternion).transformDirection(inv)
      let p = 0
      for (const q of list) {
        const h = q[3], rad = q[4] * Math.PI / 180
        const cs = Math.cos(rad) * h, sn = Math.sin(rad) * h
        const ax = right.x * cs + up.x * sn, ay = right.y * cs + up.y * sn, az = right.z * cs + up.z * sn
        const bx = up.x * cs - right.x * sn, by = up.y * cs - right.y * sn, bz = up.z * cs - right.z * sn
        for (const i of [0, 1, 2, 0, 2, 3]) {
          pos[p++] = q[0] + ax * sx[i] + bx * sy[i]
          pos[p++] = q[1] + ay * sx[i] + by * sy[i]
          pos[p++] = q[2] + az * sx[i] + bz * sy[i]
        }
      }
      g.attributes.position.needsUpdate = true
    }
    out.push(mesh)
  }
  return out
}

/**
 * Skin wie Minecraft ihn verarbeitet: alte 64x32-Skins auf 64x64 bringen (linker Arm/Bein gespiegelt),
 * die Grundschicht deckend machen und bei alten Skins eine ganz deckende Hut-Ebene ausblenden.
 */
function skinCanvas(img) {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = false
  const legacy = img.naturalHeight * 2 === img.naturalWidth
  if (legacy) {
    ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, 64, 32)
    const copy = (sx, sy, w, h, dx, dy) => {
      ctx.save()
      ctx.translate(dx + w, dy)
      ctx.scale(-1, 1)
      ctx.drawImage(c, sx, sy, w, h, 0, 0, w, h)
      ctx.restore()
    }
    for (const [sx, dx] of [[0, 16], [40, 32]]) {
      copy(sx + 4, 16, 4, 4, dx + 4, 48); copy(sx + 8, 16, 4, 4, dx + 8, 48)
      copy(sx, 20, 4, 12, dx + 8, 52); copy(sx + 4, 20, 4, 12, dx + 4, 52)
      copy(sx + 8, 20, 4, 12, dx, 52); copy(sx + 12, 20, 4, 12, dx + 12, 52)
    }
  } else {
    ctx.drawImage(img, 0, 0, 64, 64)
  }
  const data = ctx.getImageData(0, 0, 64, 64)
  const px = data.data
  const each = (x0, y0, x1, y1, fn) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) fn((y * 64 + x) * 4)
  }
  if (legacy) {
    let seeThrough = false
    each(32, 0, 64, 16, i => { if (px[i + 3] < 128) seeThrough = true })
    if (!seeThrough) each(32, 0, 64, 16, i => { px[i + 3] = 0 })
  }
  for (const r of [[0, 0, 32, 16], [0, 16, 64, 32], [16, 48, 48, 64]]) each(...r, i => { px[i + 3] = 255 })
  ctx.putImageData(data, 0, 0)
  return c
}

/**
 * Cape-Textur im Minecraft-Format (64x32). Echte Cape-Texturen (64x32, 22x17 und Vielfache) bleiben
 * wie sie sind; jedes andere Bild wird wie im Mod auf die Außenseite gelegt (auf 10:16 zugeschnitten).
 */
export function capeCanvas(img) {
  const w = img.naturalWidth, h = img.naturalHeight
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  if (w === h * 2 && w >= 64) {
    c.width = w; c.height = h
    ctx.drawImage(img, 0, 0)
    return { canvas: c, smooth: w > 256 }
  }
  if (w * 17 === h * 22) {
    const k = w / 22
    c.width = 64 * k; c.height = 32 * k
    ctx.drawImage(img, 0, 0)
    return { canvas: c, smooth: false }
  }
  const k = Math.max(1, Math.min(48, Math.round(Math.min(w / 10, h / 16))))
  c.width = 64 * k; c.height = 32 * k
  ctx.imageSmoothingEnabled = true
  ctx.fillStyle = '#1c1c22'
  ctx.fillRect(0, 0, c.width, c.height)
  const scale = Math.max(10 / w, 16 / h)
  const sw = 10 / scale, sh = 16 / scale
  const sx = (w - sw) / 2, sy = (h - sh) / 2
  ctx.drawImage(img, sx, sy, sw, sh, k, k, 10 * k, 16 * k)
  // Innenseite und Ränder etwas dunkler aus demselben Bild
  ctx.globalAlpha = 0.55
  ctx.drawImage(img, sx, sy, sw, sh, 12 * k, k, 10 * k, 16 * k)
  ctx.drawImage(img, sx, sy, sw, sh, 0, k, k, 16 * k)
  ctx.drawImage(img, sx, sy, sw, sh, 11 * k, k, k, 16 * k)
  ctx.drawImage(img, sx, sy, sw, sh, k, 0, 10 * k, k)
  ctx.drawImage(img, sx, sy, sw, sh, 11 * k, 0, 10 * k, k)
  ctx.globalAlpha = 1
  return { canvas: c, smooth: k > 4 }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// ---------------------------------------------------------------- Komponente

/**
 * skin: Bild-URL (Standard: Steve über die Lux-API), slim: schmale Arme, cape: Bild-URL,
 * cosmetic: Cosmetic-ID, emote: Emote-ID, autoRotate: dreht sich langsam.
 */
export default function MinecraftViewer({ skin = '/api/lux/skin/MHF_Steve', slim = false, cape = null, cosmetic = null,
  emote = null, autoRotate = true, className = '', onState }) {
  const mount = useRef(null)
  const api = useRef(null)

  // Szene einmal aufbauen
  useEffect(() => {
    const el = mount.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffffff, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(-20, 40, -30)
    scene.add(sun)
    const back = new THREE.DirectionalLight(0xffffff, 0.5)
    back.position.set(20, 10, 40)
    scene.add(back)

    const camera = new THREE.PerspectiveCamera(38, 1, 1, 1000)
    camera.position.set(-26, 30, -76)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 19, 0)
    controls.enablePan = false
    controls.minDistance = 25
    controls.maxDistance = 140
    controls.autoRotate = autoRotate
    controls.autoRotateSpeed = 1.6
    controls.enableDamping = true
    controls.update()

    // Gruppen wie im Spiel: Emote-Drehung um 1 Block über den Füßen, dann Minecrafts Spiegelung
    const rootPose = new THREE.Group()
    const offset = new THREE.Group()
    offset.position.y = -16
    const flip = new THREE.Group()
    flip.scale.set(-1, -1, 1)
    const model = new THREE.Group()
    model.position.y = -24.016
    rootPose.add(offset); offset.add(flip); flip.add(model)
    scene.add(rootPose)

    const parts = {}
    for (const name of PARTS) {
      parts[name] = new THREE.Group()
      parts[name].rotation.order = 'ZYX'
      model.add(parts[name])
    }

    const skinTex = new THREE.Texture()
    skinTex.magFilter = THREE.NearestFilter
    skinTex.minFilter = THREE.NearestFilter
    skinTex.colorSpace = THREE.SRGBColorSpace
    const base = new THREE.MeshLambertMaterial({ map: skinTex, side: THREE.FrontSide, alphaTest: 0.05 })
    const layer = new THREE.MeshLambertMaterial({ map: skinTex, side: THREE.DoubleSide, transparent: true, alphaTest: 0.05 })
    const capeTex = new THREE.Texture()
    capeTex.colorSpace = THREE.SRGBColorSpace
    const capeMat = new THREE.MeshLambertMaterial({ map: capeTex, side: THREE.DoubleSide, alphaTest: 0.05 })
    const capeGroup = new THREE.Group()
    capeGroup.rotation.order = 'XYZ' // wie Minecraft: erst um 180° drehen, dann nach hinten kippen
    capeGroup.position.set(0, 0, 2)
    capeGroup.rotation.set(0.12, Math.PI, 0)
    const capeMesh = new THREE.Mesh(cube(-5, 0, -1, 10, 16, 1, 0, 0, 0, 64, 32), capeMat)
    capeGroup.add(capeMesh)
    capeGroup.visible = false
    parts.body.add(capeGroup)

    const pivots = {}
    const buildBody = isSlim => {
      for (const name of PARTS) {
        for (const child of [...parts[name].children]) {
          if (child.userData.skin) parts[name].remove(child)
        }
      }
      const arm = isSlim ? 3 : 4
      const def = {
        head: { p: [0, 0, 0], c: [-4, -8, -4, 8, 8, 8], u: [0, 0], o: [32, 0], g: 0.5 },
        body: { p: [0, 0, 0], c: [-4, 0, -2, 8, 12, 4], u: [16, 16], o: [16, 32], g: 0.25 },
        rightArm: { p: [-5, isSlim ? 2.5 : 2, 0], c: [isSlim ? -2 : -3, -2, -2, arm, 12, 4], u: [40, 16], o: [40, 32], g: 0.25 },
        leftArm: { p: [5, isSlim ? 2.5 : 2, 0], c: [-1, -2, -2, arm, 12, 4], u: [32, 48], o: [48, 48], g: 0.25 },
        rightLeg: { p: [-1.9, 12, 0], c: [-2, 0, -2, 4, 12, 4], u: [0, 16], o: [0, 32], g: 0.25 },
        leftLeg: { p: [1.9, 12, 0], c: [-2, 0, -2, 4, 12, 4], u: [16, 48], o: [0, 48], g: 0.25 },
      }
      for (const [name, d] of Object.entries(def)) {
        const [x, y, z, w, h, dd] = d.c
        const inner = new THREE.Mesh(cube(x, y, z, w, h, dd, d.u[0], d.u[1], 0, 64, 64), base)
        const outer = new THREE.Mesh(cube(x, y, z, w, h, dd, d.o[0], d.o[1], d.g, 64, 64), layer)
        inner.userData.skin = outer.userData.skin = true
        parts[name].add(inner, outer)
        pivots[name] = d.p
        parts[name].position.set(...d.p)
      }
    }
    buildBody(false)

    const state = { cosmetic: null, frames: [], seconds: 2, emote: null, props: [], start: performance.now() }

    const resize = () => {
      const w = el.clientWidth || 300
      const h = el.clientHeight || 400
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const t = (performance.now() - state.start) / 1000
      // Pose zurücksetzen
      for (const name of PARTS) {
        parts[name].rotation.set(0, 0, 0)
        parts[name].position.set(...pivots[name])
      }
      rootPose.position.set(0, 16, 0)
      rootPose.rotation.set(0, 0, 0)
      if (state.emote) {
        const e = state.emote
        const n = e.frames.length
        let i = Math.floor(t * e.fps)
        i = e.loops ? i % n : Math.min(n - 1, i % (n + e.fps)) // Einmal-Emotes: kurz am Ende stehen, dann von vorn
        const f = e.frames[i]
        PARTS.forEach((name, k) => {
          const o = k * 6
          parts[name].rotation.set(f[o], f[o + 1], f[o + 2])
          parts[name].position.set(pivots[name][0] + f[o + 3], pivots[name][1] + f[o + 4], pivots[name][2] + f[o + 5])
        })
        const r = f.slice(36, 42)
        rootPose.rotation.order = 'YXZ'
        rootPose.rotation.set(r[0], r[1], r[2])
        rootPose.position.set(r[3] * 16, (r[4] + 1) * 16, r[5] * 16)
      } else {
        // leichtes Atmen der Arme wie in Minecraft
        parts.rightArm.rotation.z = Math.cos(t * 1.8) * 0.05 + 0.05
        parts.leftArm.rotation.z = -(Math.cos(t * 1.8) * 0.05 + 0.05)
        parts.rightArm.rotation.x = Math.sin(t * 1.34) * 0.05
        parts.leftArm.rotation.x = -Math.sin(t * 1.34) * 0.05
      }
      if (state.frames.length > 1) {
        const i = Math.floor((t % state.seconds) / state.seconds * state.frames.length)
        state.frames.forEach((g, k) => { g.visible = k === i })
      }
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    const clearGroup = g => {
      g.traverse(o => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) o.material.dispose()
      })
      g.parent?.remove(g)
    }

    api.current = {
      async setSkin(url, isSlim) {
        buildBody(!!isSlim)
        try {
          const img = await loadImage(url)
          skinTex.image = skinCanvas(img)
          skinTex.needsUpdate = true
        } catch {
          // kein Skin: Modell bleibt ohne Textur
        }
      },
      async setCape(url) {
        if (!url) {
          capeGroup.visible = false
          return
        }
        try {
          const { canvas, smooth } = capeCanvas(await loadImage(url))
          capeTex.image = canvas
          capeTex.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter
          capeTex.minFilter = smooth ? THREE.LinearMipmapLinearFilter : THREE.NearestFilter
          capeTex.needsUpdate = true
          capeGroup.visible = true
        } catch {
          capeGroup.visible = false
        }
      },
      async setCosmetic(id) {
        for (const g of state.frames) clearGroup(g)
        state.frames = []
        if (!id) return
        const [index, data] = await Promise.all([loadCosmeticIndex(), loadCosmetic(id)])
        const info = index.cosmetics[id]
        if (!info) return
        // Flügel, Rucksäcke & Co. sieht man von hinten besser
        if (['wings', 'back', 'tail'].includes(info.slot)) {
          camera.position.set(-30, 30, 74)
          controls.update()
        }
        const holder = info.part === 'HEAD' ? parts.head : info.part === 'BODY' ? parts.body : model
        state.seconds = data.seconds || 2
        state.frames = data.frames.map(quads => {
          const g = new THREE.Group()
          if (info.part === 'COMPANION') g.position.set(15, 24, -3)
          if (info.part === 'ITEM') {
            g.position.set(-15, 15, -2)
            g.scale.setScalar(0.75)
          }
          for (const m of quadsToMeshes(quads)) g.add(m)
          holder.add(g)
          return g
        })
        state.frames.forEach((g, k) => { g.visible = k === 0 })
      },
      async setEmote(id) {
        for (const g of state.props) clearGroup(g)
        state.props = []
        state.emote = null
        if (!id) return
        const data = await loadEmote(id)
        const at = { HEAD: parts.head, BODY: parts.body, RIGHT_ARM: parts.rightArm, LEFT_ARM: parts.leftArm, ROOT: model }
        for (const prop of data.props || []) {
          const g = new THREE.Group()
          for (const m of quadsToMeshes(prop.quads)) g.add(m)
          ;(at[prop.attach] || model).add(g)
          state.props.push(g)
        }
        state.emote = data
        state.start = performance.now()
      },
      setAutoRotate(v) { controls.autoRotate = v },
    }
    onState?.('ready')

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose()
        if (o.material) o.material.dispose()
      })
      skinTex.dispose()
      capeTex.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      api.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { api.current?.setSkin(skin, slim) }, [skin, slim])
  useEffect(() => { api.current?.setCape(cape) }, [cape])
  useEffect(() => { api.current?.setCosmetic(cosmetic).catch(() => onState?.('error')) }, [cosmetic])
  useEffect(() => { api.current?.setEmote(emote).catch(() => onState?.('error')) }, [emote])
  useEffect(() => { api.current?.setAutoRotate(autoRotate) }, [autoRotate])

  return <div ref={mount} className={`relative h-full w-full cursor-grab active:cursor-grabbing ${className}`} />
}
