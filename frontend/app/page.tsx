"use client";

import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// =====================================================
// SILHOUETTE EXTRACTION HELPERS (pure functions)
// =====================================================

/**
 * Calculates perpendicular distance from a point to a line segment.
 * Used by the Douglas-Peucker polygon simplification algorithm.
 */
function perpendicularDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
  }
  return (
    Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) /
    Math.sqrt(lengthSq)
  );
}

/**
 * Douglas-Peucker polygon simplification.
 * Recursively removes points that deviate less than `epsilon` from the
 * straight line between their neighbors, preserving the overall shape.
 *
 * Higher epsilon = fewer points = smoother but less detailed.
 */
function simplifyContour(
  points: { x: number; y: number }[],
  epsilon: number
): { x: number; y: number }[] {
  if (points.length <= 2) return [...points];

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyContour(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyContour(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [start, end];
}

/**
 * Extracts the outer boundary contour from a binary (thresholded) image
 * using the Moore Neighborhood boundary tracing algorithm.
 *
 * How it works:
 *   1. Scans top-to-bottom, left-to-right for the first white pixel
 *   2. Walks the boundary clockwise by checking 8-connected neighbors
 *   3. Stops when the walk returns to the starting pixel
 *
 * Input : RGBA pixel data from a thresholded binary image
 * Output: Ordered array of boundary pixel coordinates (image space)
 */
function extractContour(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { x: number; y: number }[] {
  // Helper: is pixel at (x, y) part of the white object?
  const isObject = (x: number, y: number): boolean => {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;

  const r = data[(y * width + x) * 4];
  const a = data[(y * width + x) * 4 + 3];

  return a > 10 && r < 200;
};

  // Step 1: Find the first object pixel (scanning top->bottom, left->right)
  let startX = -1;
  let startY = -1;
  for (let y = 0; y < height && startX === -1; y++) {
    for (let x = 0; x < width; x++) {
      if (isObject(x, y)) {
        startX = x;
        startY = y;
        break;
      }
    }
  }
  if (startX === -1) return []; // No object pixels found

  // Step 2: Moore neighborhood directions (8-connected, clockwise)
  //   Index: 0=E  1=SE  2=S  3=SW  4=W  5=NW  6=N  7=NE
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  const contour: { x: number; y: number }[] = [];
  let cx = startX;
  let cy = startY;
  // We entered from the west (scanned left->right), so backtrack = west (index 4)
  let backDir = 4;
  const maxIterations = width * height * 2; // Safety cap
  let iterations = 0;

  // Step 3: Trace the boundary
  do {
    contour.push({ x: cx, y: cy });

    let found = false;
    // Search clockwise starting one step past the backtrack direction
    for (let i = 1; i <= 8; i++) {
      const dir = (backDir + i) % 8;
      const nx = cx + dx[dir];
      const ny = cy + dy[dir];

      if (isObject(nx, ny)) {
        backDir = (dir + 4) % 8; // Reverse = new backtrack
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }

    if (!found) break; // Isolated single pixel
    iterations++;

    // Stop when the walk returns to the starting pixel
    if (contour.length > 2 && cx === startX && cy === startY) break;
  } while (iterations < maxIterations);

  return contour;
}

/**
 * Ensures a polygon has counter-clockwise winding order.
 * THREE.Shape requires CCW for the outer boundary.
 * Uses the shoelace formula to detect current winding.
 */
function ensureCounterClockwise(
  points: { x: number; y: number }[]
): { x: number; y: number }[] {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  // Positive signed area = CCW in standard math coords
  if (area < 0) return [...points].reverse();
  return points;
}

export default function HeightmapExtruder() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState('a bottle, high contrast, clean studio backdrop');
  const [loading, setLoading] = useState(false);

  // Use refs to persist persistent Three.js core singletons across state refreshes
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    const currentMount = mountRef.current;
    if (!currentMount) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, currentMount.clientWidth / currentMount.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    
    renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    currentMount.appendChild(renderer.domElement);

    // Pulled camera further back to maintain macro view scope over extruded profiles
    camera.position.set(0, 45, 95);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
    directionalLight.position.set(20, 80, 40);
    scene.add(directionalLight);

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      if (meshRef.current) {
        meshRef.current.rotation.y += 0.003; // Slow Y-axis spin for extruded profiles
      }
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      camera.aspect = currentMount.clientWidth / currentMount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(currentMount.clientWidth, currentMount.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      currentMount.removeChild(renderer.domElement);
      renderer.dispose();
      controls.dispose();
    };
  }, []);

  // =====================================================
  // SILHOUETTE → EXTRUDED 3D MESH PIPELINE
  // =====================================================
  //
  // Pipeline overview:
  //   Binary silhouette image
  //     → Contour extraction  (Moore boundary tracing)
  //     → Simplification      (Douglas-Peucker)
  //     → THREE.Shape         (2D polygon)
  //     → ExtrudeGeometry     (solid 3D mesh)
  //     → Scene
  //
  const processSilhouette = (base64Image: string) => {
    const img = new Image();
    img.src = base64Image;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // --- Step 1: Extract boundary contour from the binary image ---
      console.log('[Silhouette] Extracting contour from binary image...');
      const rawContour = extractContour(data, canvas.width, canvas.height);
      console.log(`[Silhouette] Raw contour points: ${rawContour.length}`);

      if (rawContour.length < 3) {
        console.error('[Silhouette] Not enough contour points to form a shape.');
        setLoading(false);
        return;
      }

      // --- Step 2: Simplify contour with Douglas-Peucker ---
      // epsilon ≈ 1.0 is a good balance for 128×128 binary images:
      // keeps recognizable detail without excessive polygon count.
      const simplified = simplifyContour(rawContour, 1.0);
      console.log(`[Silhouette] Simplified contour points: ${simplified.length}`);

      if (simplified.length < 3) {
        console.error('[Silhouette] Simplified contour too sparse for extrusion.');
        setLoading(false);
        return;
      }

      // --- Step 3: Convert image-space contour → THREE.Shape ---
      // Image coords: (0,0) top-left, Y goes down
      // Three.js:     (0,0) center,   Y goes up
      const worldSize = 50; // Matches the previous PlaneGeometry scale

      const shapePoints2D = simplified.map(
        (p) =>
          new THREE.Vector2(
            (p.x / canvas.width - 0.5) * worldSize,
            (0.5 - p.y / canvas.height) * worldSize // flip Y
          )
      );

      // Ensure counter-clockwise winding (required by THREE.Shape)
      const ccw = ensureCounterClockwise(
        shapePoints2D.map((v) => ({ x: v.x, y: v.y }))
      );
      const finalPoints = ccw.map((p) => new THREE.Vector2(p.x, p.y));

      const shape = new THREE.Shape(finalPoints);

      // --- Step 4: Extrude 2D shape into a solid 3D geometry ---
      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: 8,             // Fixed extrusion depth (world units)
        bevelEnabled: true,   // Rounded edges for a polished look
        bevelThickness: 0.5,
        bevelSize: 0.3,
        bevelOffset: 0,
        bevelSegments: 3,
      };

      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geometry.computeBoundingBox();
      geometry.center(); // Center the mesh at origin

      const material = new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        metalness: 0.3,
        roughness: 0.3,
        side: THREE.DoubleSide,
      });

      // --- Step 5: Add the extruded mesh to the scene ---
      if (sceneRef.current) {
        // Dispose of the previous mesh if one exists
        if (meshRef.current) {
          sceneRef.current.remove(meshRef.current);
          meshRef.current.geometry.dispose();
          (meshRef.current.material as THREE.Material).dispose();
        }

        const extrudedMesh = new THREE.Mesh(geometry, material);
        sceneRef.current.add(extrudedMesh);
        meshRef.current = extrudedMesh;
        console.log('[Silhouette] ✅ Extruded mesh added to scene');
      }

      setLoading(false);
    };

    img.onerror = () => {
      console.error('[Silhouette] Failed to load base64 image.');
      setLoading(false);
    };
  };

  const generateAndExtrude = async () => {
    setLoading(true);
    try {
      console.log('[Frontend] Sending request to backend...');
      const response = await fetch('http://localhost:5000/api/generate-heightmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      console.log('[Frontend] Response status:', response.status);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[Frontend] Error response body:', errorBody);
        throw new Error(`Backend returned ${response.status}: ${errorBody}`);
      }
      
      const data = await response.json();
      console.log('[Frontend] Got image data, length:', data.image?.length);
      processSilhouette(data.image);
    } catch (error: any) {
      console.error('[Frontend] Full error:', error);
      alert(`Pipeline error: ${error.message}`);
      setLoading(false);
    }
  };

  return (
    <div className="w-full h-screen bg-neutral-950 flex flex-col relative overflow-hidden">
      <div ref={mountRef} className="w-full h-[75vh]" />
      <div className="w-full max-w-xl mx-auto px-6 absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-4">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe your 3D asset..."
          className="w-full bg-white/5 border border-white/10 text-white rounded-xl p-4 outline-none focus:border-blue-500 transition-colors"
        />
        <button 
          onClick={generateAndExtrude} 
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold p-4 rounded-xl disabled:bg-neutral-800 transition-all"
        >
          {loading ? 'Processing Pixels...' : 'Generate 3D Extrusion'}
        </button>
      </div>
    </div>
  );
}