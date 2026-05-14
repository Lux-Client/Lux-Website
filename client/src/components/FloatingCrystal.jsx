import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function StarField() {
  const ref = useRef()
  const count = 400
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 30
      arr[i * 3 + 1] = (Math.random() - 0.5) * 30
      arr[i * 3 + 2] = (Math.random() - 0.5) * 30
    }
    return arr
  }, [])

  useFrame((state) => {
    ref.current.rotation.y = state.clock.elapsedTime * 0.01
    ref.current.rotation.x = state.clock.elapsedTime * 0.005
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#ffffff" transparent opacity={0.5} sizeAttenuation />
    </points>
  )
}

function OrbitingParticles() {
  const ref = useRef()
  const count = 80
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      const radius = 2.2 + (Math.random() - 0.5) * 0.6
      const height = (Math.random() - 0.5) * 0.8
      arr[i * 3] = Math.cos(angle) * radius
      arr[i * 3 + 1] = height
      arr[i * 3 + 2] = Math.sin(angle) * radius
    }
    return arr
  }, [])

  useFrame((state) => {
    ref.current.rotation.y = state.clock.elapsedTime * 0.4
    ref.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.15
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={count} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#e27602" transparent opacity={0.8} sizeAttenuation />
    </points>
  )
}

export default function FloatingCrystal() {
  const crystalRef = useRef()
  const wireRef = useRef()
  const glowRef = useRef()

  useFrame((state) => {
    const t = state.clock.elapsedTime
    crystalRef.current.rotation.y = t * 0.3
    crystalRef.current.rotation.z = Math.sin(t * 0.4) * 0.12
    crystalRef.current.position.y = Math.sin(t * 0.7) * 0.18

    wireRef.current.rotation.y = -t * 0.18
    wireRef.current.rotation.x = t * 0.1
    wireRef.current.position.y = crystalRef.current.position.y

    if (glowRef.current) {
      glowRef.current.position.y = crystalRef.current.position.y
    }
  })

  return (
    <group>
      <StarField />
      <OrbitingParticles />

      <mesh ref={crystalRef}>
        <octahedronGeometry args={[1.4, 0]} />
        <meshPhysicalMaterial
          color="#e27602"
          emissive="#e27602"
          emissiveIntensity={0.25}
          metalness={0.7}
          roughness={0.05}
          transparent
          opacity={0.9}
        />
      </mesh>

      <mesh ref={wireRef} scale={1.08}>
        <octahedronGeometry args={[1.4, 0]} />
        <meshBasicMaterial color="#e27602" wireframe transparent opacity={0.15} />
      </mesh>

      <mesh ref={glowRef} scale={2.0}>
        <sphereGeometry args={[1.4, 32, 32]} />
        <meshBasicMaterial color="#e27602" transparent opacity={0.025} side={THREE.BackSide} />
      </mesh>

      <mesh scale={0.4}>
        <octahedronGeometry args={[1.4, 0]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.08} />
      </mesh>

      <pointLight color="#e27602" intensity={4} distance={8} position={[0, 0, 0]} />
      <pointLight color="#ff9500" intensity={2} distance={5} position={[3, 2, 2]} />
      <pointLight color="#7c3aed" intensity={1.5} distance={5} position={[-3, -2, -2]} />
      <ambientLight intensity={0.5} color="#1a0a00" />
    </group>
  )
}
