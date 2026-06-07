"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SUBTRACTION, ADDITION, Evaluator, Brush } from "three-bvh-csg";

// ---------------------------------------------------------------------------
// generateLatheProfile
// Converts a designProfile config object into a Vector2[] silhouette that
// THREE.LatheGeometry revolves 360° around the Y-axis to create a solid body.
//
// Defensive guarantees:
//   • Every non-centre x coordinate is clamped with Math.max(0.1, x) so
//     extreme proportions never invert the mesh.
//   • The profile always starts with (0, 0) – bottom floor centre – and
//     always ends with (0, topY) – top rim centre – so the mesh is fully
//     closed and watertight for 3D printing.
//   • The belly→neck shoulder taper is generated via a quadratic Bézier
//     curve loop (configurable resolution) for smooth, organic transitions.
//
// designProfile shape:
// {
//   totalHeight  : number   – overall height in scene units
//   baseRadius   : number   – outer radius at the base
//   bodyRadius   : number   – widest radius of the body (belly)
//   neckRadius   : number   – inner radius at the neck
//   rimRadius    : number   – outer radius at the rim lip
//   hasSipper    : boolean  – extend a vertical nozzle tube above the rim
//   sipperHeight : number   – height of the sipper tube
// }
// ---------------------------------------------------------------------------
function generateLatheProfile(designProfile) {
  const {
    totalHeight,
    baseRadius,
    bodyRadius,
    neckRadius,
    rimRadius,
    hasSipper,
    sipperHeight,
  } = designProfile;

  const H  = totalHeight;
  // Clamp all radii to a safe minimum so degenerate inputs can't collapse the mesh.
  const bR = Math.max(0.5, baseRadius);
  const mR = Math.max(0.5, bodyRadius);
  const nR = Math.max(0.5, neckRadius);
  const rR = Math.max(0.5, rimRadius);
  const sH = Math.max(0,   sipperHeight);

  // Helper: clamp any non-centre X so it never reaches 0 or below.
  const cx = (x) => Math.max(0.1, x);

  // ── 1. BOTTOM CAP: mandatory (0, 0) to seal the floor ──────────────────
  const pts = [
    new THREE.Vector2(0,         0),             // absolute centre — seals base
    new THREE.Vector2(cx(bR * 0.5), 0),          // radial step-out at floor
    new THREE.Vector2(cx(bR),    H * 0.03),      // outer base corner, slight lift
  ];

  // ── 2. LOWER BODY: straight rise from base to belly ─────────────────────
  pts.push(
    new THREE.Vector2(cx(mR * 0.92), H * 0.14),
    new THREE.Vector2(cx(mR),        H * 0.34),  // maximum girth
    new THREE.Vector2(cx(mR * 0.97), H * 0.50),
  );

  // ── 3. SHOULDER TAPER: quadratic Bézier belly → neck ────────────────────
  // P0 = start of shoulder, P1 = control point (pulled inward), P2 = neck entry.
  // Sampling BEZIER_STEPS points produces a perfectly smooth organic curve.
  const BEZIER_STEPS = 8;
  const P0 = { x: cx(mR * 0.88), y: H * 0.55 };
  const P1 = { x: cx(nR * 2.2),  y: H * 0.72 };
  const P2 = { x: cx(nR * 1.05), y: H * 0.84 };

  for (let i = 1; i <= BEZIER_STEPS; i++) {
    const t  = i / BEZIER_STEPS;
    const mt = 1 - t;
    // B(t) = mt²·P0 + 2·mt·t·P1 + t²·P2
    const bx = mt * mt * P0.x + 2 * mt * t * P1.x + t * t * P2.x;
    const by = mt * mt * P0.y + 2 * mt * t * P1.y + t * t * P2.y;
    pts.push(new THREE.Vector2(cx(bx), by));
  }

  // ── 4. NECK: straight cylindrical section ───────────────────────────────
  pts.push(
    new THREE.Vector2(cx(nR), H * 0.88),
    new THREE.Vector2(cx(nR), H * 0.93),
  );

  // ── 5. RIM FLARE: slight outward lip ────────────────────────────────────
  pts.push(
    new THREE.Vector2(cx(rR), H * 0.965),
    new THREE.Vector2(cx(rR), H * 1.0),
  );

  // ── 6. OPTIONAL SIPPER TUBE above the rim ───────────────────────────────
  const topY = hasSipper ? H + sH : H;
  if (hasSipper) {
    const sipR = cx(nR * 0.78);
    pts.push(
      new THREE.Vector2(sipR, H * 1.0),   // transition from rim to sipper
      new THREE.Vector2(sipR, H + sH),    // top of sipper tube
    );
  }

  // ── 7. TOP CAP: mandatory (0, topY) to seal the top face ────────────────
  pts.push(new THREE.Vector2(0, topY));   // absolute centre — closes the top

  return pts;
}

export default function ThreeViewer({ designRecipe, width, height, depth, thickness }) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const meshGroupRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- 1. Setup Scene, Camera, Renderer ---
    const widthPx = containerRef.current.clientWidth || 400;
    const heightPx = containerRef.current.clientHeight || 350;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x09090b); // Tailwind zinc-950
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, widthPx / heightPx, 1, 1000);
    camera.position.set(130, 140, 180);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(widthPx, heightPx);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- 2. Setup Controls ---
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // Prevent going below print floor
    controls.minDistance = 50;
    controls.maxDistance = 400;
    controls.target.set(0, 30, 0);
    controlsRef.current = controls;

    // --- 3. Lights ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight1.position.set(100, 200, 100);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x6366f1, 0.5); // Indigo fill
    dirLight2.position.set(-100, 50, -100);
    scene.add(dirLight2);

    const pointLight = new THREE.PointLight(0xa78bfa, 0.6, 150); // Violet focal glow
    pointLight.position.set(0, 80, 0);
    scene.add(pointLight);

    // --- 4. Floor Grid (Print Bed Helper) ---
    const gridHelper = new THREE.GridHelper(220, 22, 0x4f46e5, 0x1e1b4b);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Bounding Box print volume
    const volumeGeo = new THREE.BoxGeometry(220, 250, 220);
    const volumeMat = new THREE.MeshBasicMaterial({
      color: 0x27272a,
      wireframe: true,
      transparent: true,
      opacity: 0.12
    });
    const volumeBox = new THREE.Mesh(volumeGeo, volumeMat);
    volumeBox.position.y = 125;
    scene.add(volumeBox);

    // --- 5. Mesh Group ---
    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // --- 6. Resize Handling ---
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width: newWidth, height: newHeight } = entries[0].contentRect;
      if (rendererRef.current && cameraRef.current) {
        cameraRef.current.aspect = newWidth / newHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(newWidth, newHeight);
      }
    });
    resizeObserver.observe(containerRef.current);

    // --- 7. Animation Loop ---
    let animationFrameId;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      if (controlsRef.current) controlsRef.current.update();
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      if (controlsRef.current) controlsRef.current.dispose();
      if (rendererRef.current) rendererRef.current.dispose();
    };
  }, []);

  // --- CSG Mesh Builder on Prop Changes ---
  useEffect(() => {
    const scene = sceneRef.current;
    const meshGroup = meshGroupRef.current;
    if (!scene || !meshGroup) return;

    // Remove existing meshes inside group and dispose resources
    while (meshGroup.children.length > 0) {
      const obj = meshGroup.children[0];
      if (obj.geometry) obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else if (obj.material) {
        obj.material.dispose();
      }
      meshGroup.remove(obj);
    }

    // --- Retrieve and Normalize Design Settings ---
    const recipe = designRecipe || { baseShape: "torus", hollow: false, features: [] };
    const baseShape = recipe.baseShape || "torus";
    const hollow = recipe.hollow || false;
    const features = recipe.features || [];

    // Scale modifiers (defaults to 1.0)
    const scaleX = recipe.scaleX || 1.0;
    const scaleY = recipe.scaleY || 1.0;
    const scaleZ = recipe.scaleZ || 1.0;

    // Base dimensions adjusted by scale modifiers
    const w = width * scaleX;
    const h = height * scaleY;
    const d = depth * scaleZ;
    const t = Math.max(thickness, 1.2); // Minimum printing wall thickness

    let yOffset = 0;
    let baseGeometry;

    // --- Create Base Shape Geometry ---
    switch (baseShape) {
      case "bottle":
      case "flask": {
        // Build profile from designProfile config (or sensible defaults)
        const dp = recipe.designProfile || {};
        const profile = generateLatheProfile({
          totalHeight  : dp.totalHeight   ?? h,
          baseRadius   : dp.baseRadius    ?? (w / 2),
          bodyRadius   : dp.bodyRadius    ?? (w / 2),
          neckRadius   : dp.neckRadius    ?? (w * 0.22),
          rimRadius    : dp.rimRadius     ?? (w * 0.25),
          hasSipper    : dp.hasSipper     ?? false,
          sipperHeight : dp.sipperHeight  ?? (h * 0.06),
        });

        // LatheGeometry revolves the profile 360° with 64 segments for smooth curves
        baseGeometry = new THREE.LatheGeometry(profile, 64);

        // The profile starts at y=0 and ends at y=h (or h+sipperHeight),
        // so yOffset stays 0 — the model already sits on the build plate.
        yOffset = 0;
        break;
      }
      case "cylinder":
        baseGeometry = new THREE.CylinderGeometry(w / 2, w / 2, h, 36);
        yOffset = h / 2;
        break;
      case "cube":
        baseGeometry = new THREE.BoxGeometry(w, h, d);
        yOffset = h / 2;
        break;
      case "sphere": {
        const radius = Math.min(w, h) / 2;
        baseGeometry = new THREE.SphereGeometry(radius, 32, 32);
        yOffset = radius;
        break;
      }
      case "torus":
      default: {
        const tubeRadius = Math.max(t * 1.5, 4);
        const mainRadius = Math.max((w / 2) - tubeRadius, 10);
        baseGeometry = new THREE.TorusGeometry(mainRadius, tubeRadius, 16, 64);
        baseGeometry.rotateX(Math.PI / 2);
        yOffset = tubeRadius;
        break;
      }
    }

    // --- Matte 3D Printed Plastic Material ---
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x4f46e5,       // Indigo matte plastic
      roughness: 0.85,       // High roughness for matte finish
      metalness: 0.1,        // Low metalness
      side: THREE.DoubleSide
    });

    const evaluator = new Evaluator();

    // Create primary brush
    let mainBrush = new Brush(baseGeometry, bodyMaterial);
    mainBrush.position.y = yOffset;
    mainBrush.updateMatrixWorld();

    const garbageGeometries = [baseGeometry];

    // --- CSG Subtract: Hollowing for Containers (Cylinder, Cube, Sphere) ---
    // LatheGeometry bottle/flask shapes are naturally hollow-ready via their
    // profile, so we skip the CSG subtraction step for those shapes.
    if (hollow && (baseShape === "cylinder" || baseShape === "cube" || baseShape === "sphere")) {
      let subtractGeometry;
      let subY = yOffset;

      if (baseShape === "cylinder") {
        // Inner cylinder is thinner, offset upward by t to leave solid bottom floor
        const innerRad = Math.max(w / 2 - t, 2);
        subtractGeometry = new THREE.CylinderGeometry(innerRad, innerRad, h, 36);
        subY = yOffset + t;
      } else if (baseShape === "cube") {
        // Inner box is smaller, offset upward by t to cut open top
        const innerW = Math.max(w - t * 2, 2);
        const innerD = Math.max(d - t * 2, 2);
        subtractGeometry = new THREE.BoxGeometry(innerW, h, innerD);
        subY = yOffset + t;
      } else if (baseShape === "sphere") {
        // Sphere hollow: Subtract smaller sphere and a top cutter box to slice flat top
        const innerRad = Math.max((Math.min(w, h) / 2) - t, 2);
        subtractGeometry = new THREE.SphereGeometry(innerRad, 32, 32);
        subY = yOffset + t / 2;

        // Cut open top of the sphere planter
        const cutGeo = new THREE.BoxGeometry(w * 1.5, h, d * 1.5);
        const cutBrush = new Brush(cutGeo, bodyMaterial);
        cutBrush.position.set(0, yOffset + (Math.min(w, h) / 2) * 0.7, 0); // Cut top 30%
        cutBrush.updateMatrixWorld();
        
        mainBrush = evaluator.evaluate(mainBrush, cutBrush, SUBTRACTION);
        mainBrush.updateMatrixWorld();
        
        garbageGeometries.push(cutGeo);
      }

      if (subtractGeometry) {
        const subtractBrush = new Brush(subtractGeometry, bodyMaterial);
        subtractBrush.position.set(0, subY, 0);
        subtractBrush.updateMatrixWorld();

        const result = evaluator.evaluate(mainBrush, subtractBrush, SUBTRACTION);
        mainBrush = result;
        mainBrush.updateMatrixWorld();

        garbageGeometries.push(subtractGeometry);
      }
    }

    // --- CSG Addition: Features (Top Nozzle / Sipper) ---
    // For bottle/flask shapes the sipper is already baked into the Lathe
    // profile via hasSipper, so we only add a CSG nozzle for primitive shapes.
    if (features.includes("top-nozzle") && baseShape !== "bottle" && baseShape !== "flask") {
      const nozzleRad = Math.max(w * 0.15, 6);
      const nozzleH = Math.max(h * 0.18, 12);
      const nozzleGeometry = new THREE.CylinderGeometry(nozzleRad, nozzleRad, nozzleH, 24);
      
      // Sit on top of the container
      const nozzleBrush = new Brush(nozzleGeometry, bodyMaterial);
      let topY = yOffset + h / 2 + nozzleH / 2;
      if (baseShape === "sphere") {
        topY = yOffset + (Math.min(w, h) / 2) * 0.7 + nozzleH / 2; // Flat top of planter
      } else if (baseShape === "torus") {
        topY = yOffset + nozzleH / 2;
      }

      nozzleBrush.position.set(0, topY, 0);
      nozzleBrush.updateMatrixWorld();

      const result = evaluator.evaluate(mainBrush, nozzleBrush, ADDITION);
      mainBrush = result;
      mainBrush.updateMatrixWorld();

      garbageGeometries.push(nozzleGeometry);
    }

    // --- CSG Addition: Features (Side Handle) ---
    if (features.includes("handle")) {
      const handleSize = Math.max(h * 0.22, 12);
      const handleThickness = Math.max(t * 1.2, 3);
      // Half-donut handle
      const handleGeometry = new THREE.TorusGeometry(handleSize, handleThickness, 12, 24, Math.PI);
      handleGeometry.rotateZ(-Math.PI / 2); // Stand vertically

      const handleBrush = new Brush(handleGeometry, bodyMaterial);
      
      // Position on the side of cylinder/cube/sphere
      let sideX = w / 2;
      let sideY = yOffset;
      if (baseShape === "sphere") {
        sideX = (Math.min(w, h) / 2) * 0.9;
      }
      
      handleBrush.position.set(-sideX, sideY, 0);
      handleBrush.updateMatrixWorld();

      const result = evaluator.evaluate(mainBrush, handleBrush, ADDITION);
      mainBrush = result;
      mainBrush.updateMatrixWorld();

      garbageGeometries.push(handleGeometry);
    }

    // --- Add Completed Mesh to Scene ---
    mainBrush.castShadow = true;
    mainBrush.receiveShadow = true;
    meshGroup.add(mainBrush);

    // Glowing Wireframe Outline Overlay (CAD style)
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0x818cf8, // Indigo-400
      wireframe: true,
      transparent: true,
      opacity: 0.12
    });
    // Recreate wireframe geometry directly from final CSG mesh
    const wireframeMesh = new THREE.Mesh(mainBrush.geometry, wireframeMaterial);
    meshGroup.add(wireframeMesh);

    // Cleanup intermediate geometries
    garbageGeometries.forEach((g) => g.dispose());

    // Update camera target to center
    if (controlsRef.current) {
      controlsRef.current.target.set(0, yOffset, 0);
    }
  }, [designRecipe, width, height, depth, thickness]);

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full min-h-[350px] relative overflow-hidden bg-zinc-950 rounded-2xl cursor-grab active:cursor-grabbing" 
    />
  );
}
