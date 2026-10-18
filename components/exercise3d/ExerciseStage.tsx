'use client'

import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { CatalogProp } from '@/convex/exerciseLibraryCatalog'

/**
 * The 3D scene for one exercise: the Rehabify character playing a clip, simple props, soft light,
 * a floor with a blob shadow and a watermark that lives inside the scene (so it can't be deleted
 * from the page). Loaded with next/dynamic only where an exercise is shown.
 *
 * Coordinates: clips and props were authored in Blender (Z up, character facing -Y). glTF is Y up,
 * so a Blender point (x, y, z) is (x, z, -y) here and the character faces +Z.
 */

export type ViewName = 'front' | 'side' | 'top'

let draco: DRACOLoader | null = null
const characters = new Map<string, Promise<GLTF>>()

/** Parses the decrypted character once per library version. */
export function parseCharacter(version: string, buffer: () => Promise<ArrayBuffer>) {
  let pending = characters.get(version)
  if (!pending) {
    pending = buffer().then((data) => {
      draco ??= new DRACOLoader().setDecoderPath('/vendor/draco/').setDecoderConfig({ type: 'wasm' })
      const loader = new GLTFLoader().setDRACOLoader(draco)
      return new Promise<GLTF>((resolve, reject) => loader.parse(data, '', resolve, reject))
    })
    pending.catch(() => characters.delete(version))
    characters.set(version, pending)
  }
  return pending
}

const blender = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y)
const num = (p: CatalogProp, k: string, d = 0) => (typeof p[k] === 'number' ? (p[k] as number) : d)

function Box({ size, center, color }: { size: [number, number, number]; center: THREE.Vector3; color: string }) {
  return (
    <mesh position={center} castShadow={false} receiveShadow={false}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.85} />
    </mesh>
  )
}

/** Decline board: low edge at frontY (under the toes), rising to `rise` at frontY + depth. */
function Wedge({ p }: { p: CatalogProp }) {
  const geometry = useMemo(() => {
    const x = num(p, 'x'), w = num(p, 'width', 0.5), y0 = num(p, 'frontY'), d = num(p, 'depth', 0.5), rise = num(p, 'rise', 0.2)
    const x0 = x - w / 2, x1 = x + w / 2, y1 = y0 + d
    const v = [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0], [x0, y1, rise], [x1, y1, rise]].map(([a, b, c]) => blender(a, b, c))
    // Unshared vertices per triangle, so each face gets a flat normal.
    const tris = [[0, 2, 3], [0, 1, 2], [2, 4, 3], [2, 5, 4], [0, 4, 5], [0, 5, 1], [0, 3, 4], [1, 5, 2]]
    const pos = new Float32Array(tris.length * 9)
    tris.forEach((t, i) => t.forEach((vi, j) => pos.set([v[vi].x, v[vi].y, v[vi].z], i * 9 + j * 3)))
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  }, [p])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#efeae2" roughness={0.85} side={THREE.DoubleSide} />
    </mesh>
  )
}

type StrapBones = Record<'lk' | 'lt' | 'rk' | 'rt' | 'ankle' | 'ball' | 'tip' | 'knee', THREE.Object3D>

/**
 * Where a towel held in both hands wraps under one foot: (left grip, right grip, left anchor, right
 * anchor). Same construction as scripts/exercise-3d/blender/rh_props.py strap_points.
 */
function strapPoints(b: StrapBones, atToes: boolean) {
  const w = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())
  const lg = w(b.lk).lerp(w(b.lt), 0.5)
  const rg = w(b.rk).lerp(w(b.rt), 0.5)
  const ankle = w(b.ankle), ball = w(b.ball), knee = w(b.knee)
  const along = ball.clone().sub(ankle).normalize()
  const shin = ankle.clone().sub(knee).normalize()
  const plantar = shin.clone().addScaledVector(along, -shin.dot(along)).normalize()
  const base = atToes ? ball.clone().lerp(w(b.tip), 0.55) : ball.clone()
  const center = base.addScaledVector(plantar, atToes ? 0.022 : 0.03)
  const across = new THREE.Vector3().crossVectors(along, plantar).normalize().multiplyScalar(0.035)
  const a = center.clone().add(across), c = center.clone().sub(across)
  const [la, ra] = a.x > c.x ? [a, c] : [c, a]
  return [lg, rg, la, ra] as const
}

/** Props from the catalog, rebuilt from their dimensions (they cost nothing to download). */
function Props({ props }: { props: CatalogProp[] }) {
  return (
    <group>
      {props.map((p, i) => {
        if (p.type === 'chair') {
          const top = num(p, 'seatTop'), front = num(p, 'frontY'), x = num(p, 'x'), w = num(p, 'width', 0.46), d = num(p, 'depth', 0.42)
          const t = 0.04, leg = 0.035
          const legs = [[-1, 0], [1, 0], [-1, 1], [1, 1]].map(([dx, dy], j) => (
            <Box key={j} size={[leg, top - t, leg]} center={blender(x + dx * (w / 2 - leg / 2), front + leg / 2 + dy * (d - leg), (top - t) / 2)} color="#d9b48f" />
          ))
          return (
            <group key={i}>
              <Box size={[w, t, d]} center={blender(x, front + d / 2, top - t / 2)} color="#d9b48f" />
              {legs}
              <Box size={[w, 0.42, 0.03]} center={blender(x, front + d - 0.015, top + 0.21)} color="#cfa57d" />
            </group>
          )
        }
        if (p.type === 'mat') {
          const along = p.along === 'x'
          const len = num(p, 'length', 1.8), wid = num(p, 'width', 0.62)
          return <Box key={i} size={along ? [len, 0.008, wid] : [wid, 0.008, len]} center={blender(0, num(p, 'centerY'), 0.004)} color="#bfeedd" />
        }
        if (p.type === 'wall') {
          const w = num(p, 'width', 2.4), h = num(p, 'height', 2.4)
          const behind = p.at === 'back'
          return <Box key={i} size={[w, h, 0.1]} center={blender(num(p, 'x'), num(p, 'faceY') + (behind ? 0.05 : -0.05), h / 2)} color="#f7f5ef" />
        }
        if (p.type === 'wedge') return <Wedge key={i} p={p} />
        if (p.type === 'roll') {
          const r = num(p, 'radius', 0.035)
          return (
            <mesh key={i} position={blender(num(p, 'x'), num(p, 'y'), num(p, 'z') + r)} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[r, r, num(p, 'length', 0.32), 24]} />
              <meshStandardMaterial color="#b8dbd8" roughness={0.9} />
            </mesh>
          )
        }
        if (p.type === 'line') {
          return <Box key={i} size={[num(p, 'width', 0.05), 0.002, num(p, 'length', 8)]} center={blender(num(p, 'x'), 0, 0.001)} color="#005b57" />
        }
        if (p.type === 'pillow') {
          const top = num(p, 'top', 0.2), h = Math.max(top - 0.008, 0.02)
          return <Box key={i} size={[num(p, 'length', 0.5), h, num(p, 'depth', 0.34)]} center={blender(num(p, 'x'), num(p, 'y'), 0.008 + h / 2)} color="#e6f0ef" />
        }
        if (p.type === 'step') {
          const h = num(p, 'height', 0.15), d = num(p, 'depth', 0.32)
          return <Box key={i} size={[num(p, 'width', 0.7), h, d]} center={blender(0, num(p, 'frontY') + d / 2, h / 2)} color="#efeae2" />
        }
        return null
      })}
    </group>
  )
}

function radialTexture(inner: string, outer: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, inner)
  grad.addColorStop(1, outer)
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function watermarkTexture(text: string) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 96
  const g = c.getContext('2d')!
  g.font = '600 44px system-ui, -apple-system, Segoe UI, sans-serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#002e2c'
  g.fillText(text, 512, 48)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

type StageProps = {
  gltf: GLTF
  clip: THREE.AnimationClip
  props: CatalogProp[]
  playing: boolean
  speed: number
  view: ViewName
  viewNonce: number
  watermark: string
  onRep?: () => void
  onFrame?: (progress: number) => void
}

function Scene({ gltf, clip, props, playing, speed, view, viewNonce, watermark, onRep, onFrame }: StageProps) {
  const { camera, gl } = useThree()
  const model = useMemo(() => cloneSkinned(gltf.scene), [gltf])
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model])
  const hips = useMemo(() => model.getObjectByName('Hips') ?? null, [model])
  const shadow = useRef<THREE.Mesh>(null)
  const mark = useRef<THREE.Sprite>(null)
  const controls = useRef<OrbitControls | null>(null)
  const bounds = useRef(new THREE.Box3())
  // Walking clips move forward over a loop; the model is slid back by the same amount so the
  // walker stays in view and the loop joins up.
  const travel = useRef(new THREE.Vector3())
  const onRepRef = useRef(onRep)
  onRepRef.current = onRep

  // A towel held in both hands and looped under one foot follows the bones every frame.
  const strap = useMemo(() => props.find((p) => p.type === 'strap') ?? null, [props])
  const strapBones = useMemo(() => {
    if (!strap) return null
    const foot = strap.foot === 'Right' ? 'Right' : 'Left'
    const names = {
      lk: 'LeftHandMiddle1', lt: 'LeftHandMiddle3', rk: 'RightHandMiddle1', rt: 'RightHandMiddle3',
      ankle: `${foot}Foot`, ball: `${foot}ToeBase`, tip: `${foot}Toe_End`, knee: `${foot}Leg`,
    }
    const found = Object.fromEntries(Object.entries(names).map(([k, n]) => [k, model.getObjectByName(n)]))
    return Object.values(found).every(Boolean) ? (found as StrapBones) : null
  }, [model, strap])
  const strapSegs = useRef<(THREE.Mesh | null)[]>([])

  const floorTex = useMemo(() => radialTexture('rgba(230,240,239,1)', 'rgba(247,245,239,0)'), [])
  const shadowTex = useMemo(() => radialTexture('rgba(0,46,44,0.32)', 'rgba(0,46,44,0)'), [])
  const markTex = useMemo(() => watermarkTexture(`rehabify  ·  ${watermark}`), [watermark])

  useEffect(() => {
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.frustumCulled = false // skinned meshes move outside their bind-pose bounds
    })
    const action = mixer.clipAction(clip)
    action.setLoop(THREE.LoopRepeat, Infinity)
    action.play()

    // How far the hips travel over one loop (walking). Other clips start and end in the same place.
    model.position.set(0, 0, 0)
    travel.current.set(0, 0, 0)
    if (hips && clip.duration > 0) {
      const hipsAt = (t: number) => {
        mixer.setTime(t)
        model.updateMatrixWorld(true)
        return hips.getWorldPosition(new THREE.Vector3())
      }
      const moved = hipsAt(clip.duration - 1e-3).sub(hipsAt(0)).setY(0)
      if (moved.lengthSq() > 0.04) travel.current.copy(moved)
    }

    // Frame the whole movement: sample the clip and union the skinned bounds with the props.
    const box = new THREE.Box3()
    for (const f of [0, 0.25, 0.5, 0.75]) {
      mixer.setTime(clip.duration * f)
      model.position.copy(travel.current).multiplyScalar(-f)
      model.updateMatrixWorld(true)
      model.traverse((o) => {
        const skinned = o as THREE.SkinnedMesh
        if (skinned.isSkinnedMesh) {
          skinned.computeBoundingBox()
          if (skinned.boundingBox) box.union(skinned.boundingBox.clone().applyMatrix4(skinned.matrixWorld))
        }
      })
    }
    mixer.setTime(0)
    model.position.set(0, 0, 0)
    for (const p of props) {
      if (p.type === 'chair') box.expandByPoint(blender(0, num(p, 'frontY') + num(p, 'depth', 0.42), num(p, 'seatTop') + 0.4))
      if (p.type === 'pillow') box.expandByPoint(blender(num(p, 'x'), num(p, 'y'), num(p, 'top')))
    }
    box.expandByPoint(new THREE.Vector3(box.min.x, 0, box.min.z))
    bounds.current.copy(box)

    const onLoop = () => onRepRef.current?.()
    mixer.addEventListener('loop', onLoop)
    return () => {
      mixer.removeEventListener('loop', onLoop)
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
    }
  }, [clip, hips, mixer, model, props])

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.enableDamping = true
    c.dampingFactor = 0.08
    c.enablePan = false
    c.minDistance = 1.2
    c.maxDistance = 7
    c.maxPolarAngle = Math.PI / 2 - 0.04 // never below the floor
    controls.current = c
    return () => c.dispose()
  }, [camera, gl])

  // Camera presets: front (the way the character faces), side, top.
  useEffect(() => {
    const box = bounds.current
    if (box.isEmpty()) return
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    const radius = Math.max(size.x, size.y, size.z) * 0.62
    const persp = camera as THREE.PerspectiveCamera
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(persp.fov / 2)) * 1.02
    const dir =
      view === 'side' ? new THREE.Vector3(1, 0.22, 0.12) : view === 'top' ? new THREE.Vector3(0.05, 1, 0.35) : new THREE.Vector3(0.38, 0.24, 1)
    camera.position.copy(center).addScaledVector(dir.normalize(), dist)
    camera.lookAt(center)
    controls.current?.target.copy(center)
    controls.current?.update()
  }, [camera, view, viewNonce, clip])

  useFrame((_, delta) => {
    mixer.update(playing ? Math.min(delta, 0.1) * speed : 0)
    if (travel.current.lengthSq() > 0 && clip.duration > 0) {
      const action = mixer.existingAction(clip)
      if (action) model.position.copy(travel.current).multiplyScalar(-(action.time % clip.duration) / clip.duration)
    }
    if (strapBones) {
      model.updateMatrixWorld(true)
      const [lg, rg, la, ra] = strapPoints(strapBones, strap?.at === 'toes')
      const up = new THREE.Vector3(0, 1, 0)
      ;[[lg, la], [rg, ra], [la, ra]].forEach(([a, b], i) => {
        const seg = strapSegs.current[i]
        if (!seg) return
        const d = b.clone().sub(a)
        seg.position.copy(a).add(b).multiplyScalar(0.5)
        seg.quaternion.setFromUnitVectors(up, d.clone().normalize())
        seg.scale.set(1, Math.max(d.length(), 1e-4), 1)
      })
    }
    controls.current?.update()
    if (hips && shadow.current) {
      const p = hips.getWorldPosition(new THREE.Vector3())
      shadow.current.position.set(p.x, 0.003, p.z)
    }
    if (mark.current) {
      // Watermark drifts slowly across the lower part of the view.
      const t = performance.now() / 1000
      const fwd = camera.getWorldDirection(new THREE.Vector3())
      const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize()
      const up = new THREE.Vector3().crossVectors(right, fwd).normalize()
      mark.current.position
        .copy(camera.position)
        .addScaledVector(fwd, 1.5)
        .addScaledVector(right, Math.sin(t * 0.11) * 0.18)
        .addScaledVector(up, -0.28 + Math.sin(t * 0.07) * 0.05)
    }
    if (onFrame && clip.duration > 0) {
      const action = mixer.existingAction(clip)
      if (action) onFrame((action.time % clip.duration) / clip.duration)
    }
  })

  return (
    <>
      <hemisphereLight args={['#ffffff', '#c9d4d2', 1.15]} />
      <directionalLight position={[-2.2, 4, 3.2]} intensity={2.1} />
      <directionalLight position={[3, 2, 1.2]} intensity={0.65} color="#eef7ff" />
      <directionalLight position={[0, 2.6, -3.5]} intensity={0.55} />
      {/* Geometry and textures are shared with the cached character, so React must not dispose them. */}
      <primitive object={model} dispose={null} />
      <Props props={props} />
      {strapBones &&
        [0, 1, 2].map((i) => (
          <mesh key={i} ref={(el) => { strapSegs.current[i] = el }}>
            <cylinderGeometry args={[0.014, 0.014, 1, 12]} />
            <meshStandardMaterial color="#b8dbd8" roughness={0.9} />
          </mesh>
        ))}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <circleGeometry args={[3.2, 48]} />
        <meshBasicMaterial map={floorTex} transparent depthWrite={false} />
      </mesh>
      <mesh ref={shadow} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.1, 1.1]} />
        <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
      </mesh>
      <sprite ref={mark} scale={[0.62, 0.058, 1]} renderOrder={10}>
        <spriteMaterial map={markTex} transparent opacity={0.22} depthTest={false} depthWrite={false} />
      </sprite>
    </>
  )
}

export default function ExerciseStage(props: StageProps & { className?: string; onContextLost?: () => void }) {
  return (
    <Canvas
      className={props.className}
      dpr={[1, 1.5]}
      camera={{ fov: 32, near: 0.05, far: 50, position: [0.8, 1.2, 3.4] }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.NeutralToneMapping
        gl.toneMappingExposure = 1.0
        gl.domElement.addEventListener('contextmenu', (e) => e.preventDefault())
        gl.domElement.addEventListener('webglcontextlost', () => props.onContextLost?.())
      }}
    >
      <Scene {...props} />
    </Canvas>
  )
}
