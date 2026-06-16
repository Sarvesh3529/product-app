'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildExtrudedGeometry } from '../silhouette'

export type ForgeStatus = 'idle' | 'requesting' | 'tracing' | 'extruding' | 'ready' | 'error'

export type ForgeViewerHandle = {
  generate: (prompt: string) => Promise<void>
  exportSTL: () => void
  hasMesh: () => boolean
}

type ForgeViewerProps = {
  backendUrl?: string
  onStatus?: (status: ForgeStatus, detail?: string) => void
}

const BLUE = 0x2563eb

// Build a flat default placeholder shape (a rounded blade/bottle-like profile)
// so the scene is never empty before the first generation.
function buildDefaultGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape()
  const pts: [number, number][] = [
    [-8, -18], [8, -18], [10, -10], [6, 0], [9, 10],
    [4, 18], [-4, 18], [-9, 10], [-6, 0], [-10, -10],
  ]
  shape.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1])
  shape.closePath()
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 8,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.3,
    bevelOffset: 0,
    bevelSegments: 3,
  })
  geo.center()
  return geo
}

const ForgeViewer = forwardRef<ForgeViewerHandle, ForgeViewerProps>(function ForgeViewer(
  { backendUrl = 'http://localhost:5000', onStatus },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null)
  const wireRef = useRef<THREE.LineSegments | null>(null)
  const fillLightRef = useRef<THREE.DirectionalLight | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const buildProgressRef = useRef(1) // 0..1 wireframe-to-solid reveal

  // Swap the current mesh for a new geometry, kicking off the build-in animation.
  const setGeometry = (geometry: THREE.BufferGeometry) => {
    const scene = sceneRef.current
    if (!scene) return

    if (meshRef.current) {
      scene.remove(meshRef.current)
      meshRef.current.geometry.dispose()
      ;(meshRef.current.material as THREE.Material).dispose()
      meshRef.current = null
    }
    if (wireRef.current) {
      scene.remove(wireRef.current)
      wireRef.current.geometry.dispose()
      ;(wireRef.current.material as THREE.Material).dispose()
      wireRef.current = null
    }

    const material = new THREE.MeshStandardMaterial({
      color: BLUE,
      metalness: 0.45,
      roughness: 0.25,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    })
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    meshRef.current = mesh

    const wireGeo = new THREE.WireframeGeometry(geometry)
    const wireMat = new THREE.LineBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.9,
    })
    const wire = new THREE.LineSegments(wireGeo, wireMat)
    scene.add(wire)
    wireRef.current = wire

    buildProgressRef.current = 0 // restart reveal animation
  }

  useEffect(() => {
    const currentMount = mountRef.current
    if (!currentMount) return

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x14171d, 0.0042)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(
      45,
      currentMount.clientWidth / currentMount.clientHeight,
      0.1,
      1000,
    )
    camera.position.set(0, 45, 95)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    currentMount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.enablePan = false
    controls.minDistance = 50
    controls.maxDistance = 160

    // --- Lighting ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45)
    scene.add(ambientLight)

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.3)
    keyLight.position.set(20, 80, 40)
    scene.add(keyLight)

    // Ember-tinted rim light that tracks the pointer
    const fillLight = new THREE.DirectionalLight(0xffa552, 0.9)
    fillLight.position.set(-40, 20, -30)
    scene.add(fillLight)
    fillLightRef.current = fillLight

    // --- In-scene blueprint grid + axes ---
    const grid = new THREE.GridHelper(160, 32, 0x3b82f6, 0x243042)
    ;(grid.material as THREE.Material).opacity = 0.25
    ;(grid.material as THREE.Material).transparent = true
    grid.position.y = -30
    scene.add(grid)

    const axes = new THREE.AxesHelper(22)
    axes.position.set(-70, -29, -70)
    scene.add(axes)

    // --- Default placeholder mesh ---
    setGeometry(buildDefaultGeometry())

    // --- Pointer tracking for reactive lighting ---
    const handlePointer = (e: PointerEvent) => {
      const rect = currentMount.getBoundingClientRect()
      pointerRef.current = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      }
    }
    currentMount.addEventListener('pointermove', handlePointer)

    let frameId = 0
    const clock = new THREE.Clock()
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      const dt = clock.getDelta()
      controls.update()

      // Reactive ember rim light
      if (fillLightRef.current) {
        fillLightRef.current.position.x = pointerRef.current.x * 60
        fillLightRef.current.position.y = 20 + pointerRef.current.y * 30
      }

      // Wireframe → solid reveal
      if (buildProgressRef.current < 1) {
        buildProgressRef.current = Math.min(1, buildProgressRef.current + dt * 0.8)
        const p = buildProgressRef.current
        if (meshRef.current) {
          ;(meshRef.current.material as THREE.MeshStandardMaterial).opacity = p
        }
        if (wireRef.current) {
          ;(wireRef.current.material as THREE.LineBasicMaterial).opacity = 0.9 * (1 - p)
          if (p >= 1) {
            wireRef.current.visible = false
          }
        }
      }

      if (meshRef.current) {
        meshRef.current.rotation.y += 0.003
      }
      if (wireRef.current && wireRef.current.visible) {
        wireRef.current.rotation.y = meshRef.current ? meshRef.current.rotation.y : 0
      }

      renderer.render(scene, camera)
    }
    animate()

    const handleResize = () => {
      camera.aspect = currentMount.clientWidth / currentMount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      currentMount.removeEventListener('pointermove', handlePointer)
      if (renderer.domElement.parentNode === currentMount) {
        currentMount.removeChild(renderer.domElement)
      }
      renderer.dispose()
      controls.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ===================================================
  // SILHOUETTE → MESH (unchanged pipeline, via helpers)
  // ===================================================
  const processSilhouette = (base64Image: string) =>
    new Promise<void>((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = base64Image
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'))
          return
        }
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

        onStatus?.('tracing', 'Tracing silhouette contour')
        onStatus?.('extruding', 'Extruding solid geometry')

        const geometry = buildExtrudedGeometry(data, canvas.width, canvas.height)
        if (!geometry) {
          reject(new Error('Silhouette contour too sparse to extrude'))
          return
        }
        setGeometry(geometry)
        onStatus?.('ready', 'Model ready')
        resolve()
      }
      img.onerror = () => reject(new Error('Failed to load silhouette image'))
    })

  useImperativeHandle(ref, () => ({
    async generate(prompt: string) {
      try {
        onStatus?.('requesting', 'Generating AI silhouette')
        const response = await fetch(`${backendUrl}/api/generate-heightmap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        })
        if (!response.ok) {
          const errorBody = await response.text()
          throw new Error(`Backend returned ${response.status}: ${errorBody}`)
        }
        const data = await response.json()
        await processSilhouette(data.image)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        onStatus?.('error', message)
        throw error
      }
    },
    exportSTL() {
      const mesh = meshRef.current
      if (!mesh) return
      const stl = meshToBinarySTL(mesh)
      const blob = new Blob([stl], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'forge-model.stl'
      a.click()
      URL.revokeObjectURL(url)
    },
    hasMesh() {
      return meshRef.current !== null
    },
  }))

  return <div ref={mountRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
})

export default ForgeViewer

// Minimal binary STL writer for the extruded mesh.
function meshToBinarySTL(mesh: THREE.Mesh): DataView {
  const geometry = mesh.geometry.clone()
  geometry.applyMatrix4(mesh.matrixWorld)
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute
  const index = geometry.getIndex()
  const triangleCount = index ? index.count / 3 : pos.count / 3

  const buffer = new ArrayBuffer(84 + triangleCount * 50)
  const view = new DataView(buffer)
  view.setUint32(80, triangleCount, true)

  let offset = 84
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const cb = new THREE.Vector3()
  const ab = new THREE.Vector3()

  const getVertex = (i: number) => (index ? index.getX(i) : i)

  for (let t = 0; t < triangleCount; t++) {
    const i0 = getVertex(t * 3)
    const i1 = getVertex(t * 3 + 1)
    const i2 = getVertex(t * 3 + 2)
    a.fromBufferAttribute(pos, i0)
    b.fromBufferAttribute(pos, i1)
    c.fromBufferAttribute(pos, i2)
    cb.subVectors(c, b)
    ab.subVectors(a, b)
    cb.cross(ab).normalize()

    view.setFloat32(offset, cb.x, true); offset += 4
    view.setFloat32(offset, cb.y, true); offset += 4
    view.setFloat32(offset, cb.z, true); offset += 4
    for (const v of [a, b, c]) {
      view.setFloat32(offset, v.x, true); offset += 4
      view.setFloat32(offset, v.y, true); offset += 4
      view.setFloat32(offset, v.z, true); offset += 4
    }
    view.setUint16(offset, 0, true); offset += 2
  }
  return view
}
