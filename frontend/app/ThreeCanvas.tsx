"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { traceContours } from "./silhouette";

// ─── Types ────────────────────────────────────────────────────────────────────

type ScenePipeline = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  object: THREE.Object3D | null;
};

// ─── Point in Polygon (Ray-casting) & Winding Helpers ─────────────────────────

function isPointInPolygon(p: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    const intersect = ((yi > p.y) !== (yj > p.y))
        && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function signedArea(pts: { x: number; y: number }[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return area / 2;
}

function forceWinding(pts: THREE.Vector2[], ccw: boolean): THREE.Vector2[] {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  const isCCW = area > 0;
  if (isCCW !== ccw) {
    return pts.slice().reverse();
  }
  return pts;
}

// ─── Ramer-Douglas-Peucker Simplification ─────────────────────────────────────

function rdp(pts: { x: number; y: number }[], epsilon: number): { x: number; y: number }[] {
  if (pts.length <= 2) return pts;

  let maxDist = 0;
  let maxIdx = 0;
  const start = pts[0];
  const end = pts[pts.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);

  for (let i = 1; i < pts.length - 1; i++) {
    let dist: number;
    if (len === 0) {
      dist = Math.hypot(pts[i].x - start.x, pts[i].y - start.y);
    } else {
      dist = Math.abs(dy * pts[i].x - dx * pts[i].y + end.x * start.y - end.y * start.x) / len;
    }
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdp(pts.slice(0, maxIdx + 1), epsilon);
    const right = rdp(pts.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [start, end];
}

// ─── Contour to THREE.Shape Conversion ────────────────────────────────────────

const SAMPLE_SIZE = 128;
const LUMA_THRESHOLD = 0.42;

async function buildBinaryGrid(dataUrl: string): Promise<boolean[][]> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Generated image could not be decoded by the browser."));
    img.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create a canvas 2D context.");

  ctx.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  ctx.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  const { data: pixels } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  let darkCount = 0;
  let lightCount = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3] / 255;
    const l = (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
    if (a * (1 - l) > LUMA_THRESHOLD) darkCount++;
    if (a * l > LUMA_THRESHOLD) lightCount++;
  }
  const useLightPixels = lightCount >= darkCount;

  const grid: boolean[][] = Array.from({ length: SAMPLE_SIZE }, () => Array(SAMPLE_SIZE).fill(false));

  for (let y = 0; y < SAMPLE_SIZE; y++) {
    for (let x = 0; x < SAMPLE_SIZE; x++) {
      const i = (y * SAMPLE_SIZE + x) * 4;
      const a = pixels[i + 3] / 255;
      const l = (pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722) / 255;
      const score = useLightPixels ? a * l : a * (1 - l);
      grid[y][x] = score > LUMA_THRESHOLD;
    }
  }

  return grid;
}

function gridToShapes(grid: boolean[][]): THREE.Shape[] {
  const loops = traceContours(grid);
  if (loops.length === 0) return [];

  // Simplify paths to keep vertex count clean and production-ready
  const epsilon = 0.6;
  const simplified = loops
    .map((loop) => rdp(loop, epsilon))
    .filter((loop) => loop.length >= 4);

  if (simplified.length === 0) return [];

  // Bounding box calculations
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const loop of simplified) {
    for (const p of loop) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = 10 / Math.max(rangeX, rangeY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const toVec2 = (p: { x: number; y: number }): THREE.Vector2 =>
    new THREE.Vector2((p.x - cx) * scale, -(p.y - cy) * scale);

  type Contour = {
    points: { x: number; y: number }[];
    vecs: THREE.Vector2[];
    area: number;
  };

  const contours: Contour[] = simplified.map((loop) => {
    const vecs = loop.map(toVec2);
    return {
      points: loop,
      vecs,
      area: Math.abs(signedArea(loop)),
    };
  });

  // Sort by area descending (largest shape is the outer shell)
  contours.sort((a, b) => b.area - a.area);

  const outerShapes: { shape: THREE.Shape; points: { x: number; y: number }[] }[] = [];

  for (const contour of contours) {
    let parentIndex = -1;
    for (let i = 0; i < outerShapes.length; i++) {
      if (isPointInPolygon(contour.points[0], outerShapes[i].points)) {
        parentIndex = i;
        break;
      }
    }

    if (parentIndex !== -1) {
      // Winding order must be CW for holes
      const holeVecs = forceWinding(contour.vecs, false);
      const path = new THREE.Path(holeVecs);
      outerShapes[parentIndex].shape.holes.push(path);
    } else {
      // Winding order must be CCW for outer shapes
      const outerVecs = forceWinding(contour.vecs, true);
      const shape = new THREE.Shape(outerVecs);
      outerShapes.push({ shape, points: contour.points });
    }
  }

  return outerShapes.map((os) => os.shape);
}

// ─── Main Geometry Builder ────────────────────────────────────────────────────

const EXTRUDE_SETTINGS: THREE.ExtrudeGeometryOptions = {
  depth: 4,
  bevelEnabled: true,
  bevelThickness: 0.5,
  bevelSize: 0.3,
  bevelSegments: 3,
};

async function imageToExtrudedObject(dataUrl: string): Promise<THREE.Object3D> {
  const grid = await buildBinaryGrid(dataUrl);
  const shapes = gridToShapes(grid);

  if (shapes.length === 0) {
    throw new Error("Contour tracing produced no usable shapes from the silhouette.");
  }

  const geometry = new THREE.ExtrudeGeometry(shapes, EXTRUDE_SETTINGS);
  geometry.computeVertexNormals();
  geometry.center();

  const material = new THREE.MeshStandardMaterial({
    color: 0xd8dde2,
    roughness: 0.32,
    metalness: 0.3,
    emissive: 0x071014,
    emissiveIntensity: 0.18,
    flatShading: false,
    side: THREE.DoubleSide, // Ensure back-face / side visibility is solid
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -0.18;

  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

// ─── React Component ──────────────────────────────────────────────────────────

export default function ThreeCanvas() {
  const mountRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<ScenePipeline | null>(null);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mountRef.current) return;

    const currentMount = mountRef.current;
    const width = currentMount.clientWidth || 800;
    const height = currentMount.clientHeight || 550;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x09090b);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 1000);
    camera.position.set(0, -17, 11);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    currentMount.innerHTML = "";
    currentMount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0, 0);
    controls.update();

    scene.add(new THREE.HemisphereLight(0xe8fbff, 0x141414, 1.8));

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(6, -8, 12);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x5ee7ff, 1.1);
    fillLight.position.set(-8, 5, 6);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffa040, 0.6);
    rimLight.position.set(0, 10, -10);
    scene.add(rimLight);

    const grid = new THREE.GridHelper(18, 18, 0x155666, 0x12313a);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -1.1;
    scene.add(grid);

    pipelineRef.current = { scene, renderer, camera, controls, object: null };

    let animationFrameId = 0;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const object = pipelineRef.current?.object;
      if (object) object.rotation.z += 0.004;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current) return;
      const nextWidth = mountRef.current.clientWidth || 1;
      const nextHeight = mountRef.current.clientHeight || 1;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      controls.dispose();
      renderer.dispose();
      currentMount.innerHTML = "";
      pipelineRef.current = null;
    };
  }, []);

  const generateAndExtrude = async () => {
    setLoading(true);
    setError(null);

    try {
      const cleanPrompt = prompt.trim();
      if (!cleanPrompt) throw new Error("Enter a prompt first.");

      const nodeApiUrl = process.env.NEXT_PUBLIC_NODE_API_URL || "http://localhost:5000";
      const response = await fetch(`${nodeApiUrl.replace(/\/$/, "")}/api/generate-heightmap`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cleanPrompt, requestId: crypto.randomUUID() }),
      });

      if (!response.ok) {
        let errorMsg = `Server returned HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          if (errBody?.details) {
            errorMsg = `${errBody.details}`;
          } else if (errBody?.error) {
            errorMsg = `${errBody.error}`;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }
      const data = await response.json();
      if (!data?.image) throw new Error("Backend did not return an image payload.");

      const pipe = pipelineRef.current;
      if (!pipe) throw new Error("3D scene is not ready yet.");

      // Build the extruded shape object
      const object = await imageToExtrudedObject(data.image);

      if (pipe.object) {
        pipe.scene.remove(pipe.object);
        pipe.object.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else if (material) material.dispose();
        });
      }

      pipe.object = object;
      pipe.scene.add(object);
      pipe.camera.position.set(0, -17, 11);
      pipe.controls.target.set(0, 0, 0);
      pipe.controls.update();
      pipe.renderer.render(pipe.scene, pipe.camera);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pipeline processing failed.";
      setError(message);
      console.error("[3D PIPELINE ERROR]", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#09090b] text-white font-sans">
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="absolute top-10 left-1/2 -translate-x-1/2 z-20 text-center w-full max-w-xl px-4">
        <p className="text-cyan-400 text-xs font-mono uppercase tracking-[0.32em]">TEXT TO 3D FORGE</p>
        <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-white uppercase">3D Asset Generation Engine</h1>
      </div>

      <div className="w-full h-full flex items-center justify-center px-4 pt-24 pb-36">
        <div
          ref={mountRef}
          data-testid="three-canvas-mount"
          className="w-full max-w-5xl h-[480px] md:h-[550px] rounded-[24px] border border-white/10 bg-[#09090b] overflow-hidden shadow-2xl"
        />
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-xl">
        <div className="rounded-[20px] border border-white/10 bg-zinc-900/95 p-4 shadow-xl">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-cyan-400 font-mono text-base">{">"}</span>
            <input
              type="text"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe your 3D asset..."
              className="flex-1 bg-transparent text-white outline-none placeholder:text-zinc-600 text-sm"
            />
          </div>

          {error ? <p className="mb-3 text-xs text-red-300">{error}</p> : null}

          <button
            onClick={generateAndExtrude}
            disabled={loading}
            className="w-full rounded-xl bg-cyan-500 py-3 text-black font-bold text-sm transition active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Forging Object..." : "Generate 3D Model"}
          </button>
        </div>
      </div>
    </div>
  );
}
