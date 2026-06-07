"use client";

import { useState, useMemo } from "react";

import dynamic from "next/dynamic";
import {
  Boxes,
  Cpu,
  Layers,
  Download,
  Clock,
  Sparkles,
  Database,
  History,
  Settings,
  FileCode,
  ArrowRight,
  Maximize2
} from "lucide-react";

// --- Lazy Load ThreeViewer (no SSR to bypass WebGL/canvas errors on server) ---
const ThreeViewer = dynamic(() => import("@/components/ThreeViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center p-6 text-center space-y-3 font-mono text-xs text-zinc-500">
      <div className="w-8 h-8 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin" />
      <span>Initializing WebGL Canvas...</span>
    </div>
  )
});

// --- Initial Gallery/History Mock Data with CSG Recipes ---
const initialGallery = [
  {
    id: "hist-1",
    prompt: "A thin minimalist phone stand, clean geometric angles",
    name: "Minimalist Phone Stand",
    format: "STL",
    width: 70,
    height: 90,
    depth: 80,
    thickness: 2.5,
    fileSize: "8.4 MB",
    printTime: "2h 45m",
    polyCount: "148,200",
    designRecipe: {
      baseShape: "cube",
      hollow: false,
      features: [],
      scaleX: 0.6,
      scaleY: 0.75,
      scaleZ: 0.6
    },
    color: "#6366f1"
  },
  {
    id: "hist-2",
    prompt: "A wide tall hollow desk organizer with a handle",
    name: "Ergonomic Desk Organizer",
    format: "STL",
    width: 180,
    height: 50,
    depth: 120,
    thickness: 2.0,
    fileSize: "19.2 MB",
    printTime: "5h 10m",
    polyCount: "320,400",
    designRecipe: {
      baseShape: "cube",
      hollow: true,
      features: ["handle"],
      scaleX: 1.4,
      scaleY: 1.4,
      scaleZ: 1.4
    },
    color: "#6366f1"
  },
  {
    id: "hist-3",
    prompt: "Hollow succulent planter, modern honeycomb pattern",
    name: "Hexagonal Succulent Planter",
    format: "3MF",
    width: 90,
    height: 90,
    depth: 95,
    thickness: 3.0,
    fileSize: "12.7 MB",
    printTime: "3h 20m",
    polyCount: "215,800",
    designRecipe: {
      baseShape: "sphere",
      hollow: true,
      features: [],
      scaleX: 1.0,
      scaleY: 1.0,
      scaleZ: 1.0
    },
    color: "#f59e0b"
  }
];

export default function Home() {
  // --- Core State ---
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState("STL");
  const [width, setWidth] = useState(80);
  const [height, setHeight] = useState(120);
  const [depth, setDepth] = useState(80);
  const [thickness, setThickness] = useState(2.0);

  // --- Pipeline & Simulated Model States ---
  const [generationState, setGenerationState] = useState("idle"); // "idle" | "generating" | "success" | "error"
  const [generationStep, setGenerationStep] = useState(0);
  const [generationError, setGenerationError] = useState("");
  const [generatedModel, setGeneratedModel] = useState(null);
  const [gallery, setGallery] = useState(initialGallery);

  // --- Simulated Pipeline Stepper Messages ---
  const stepperMessages = [
    "Analyzing design geometry...",
    "Reconstructing solid CAD meshes...",
    "Compiling CSG boolean trees..."
  ];

  // ---------------------------------------------------------------------------
  // parseRecipeFromPrompt  —  Scoring-system CSG Design Recipe compiler
  //
  // How it works:
  //   1. Every keyword awards weighted votes to one of five candidate shapes.
  //      Whichever shape accumulates the highest score wins.
  //   2. Named dimension multipliers (ultra-wide, extremely thin, …) are
  //      extracted as precise numeric values and fed into the Lathe
  //      designProfile so extreme proportions render cleanly without
  //      collapsing the mesh.
  //   3. Falls back to "torus" only when no shape scores above 0.
  // ---------------------------------------------------------------------------
  const parseRecipeFromPrompt = (text) => {
    const lower = text.toLowerCase();

    // ── 1. SHAPE SCORING ────────────────────────────────────────────────────
    // Accumulate votes for each candidate shape.
    const scores = { bottle: 0, cylinder: 0, cube: 0, sphere: 0, torus: 0 };

    // Bottle / flask  (+3 = very strong signal)
    if (lower.match(/\bflask\b/)) scores.bottle += 3;
    if (lower.match(/\bbottle\b/)) scores.bottle += 3;
    if (lower.match(/\bcontainer\b/)) scores.bottle += 1;  // ambiguous — mild vote

    // Cylinder family
    if (lower.match(/\bcup\b/)) scores.cylinder += 3;
    if (lower.match(/\bcan\b/)) scores.cylinder += 3;
    if (lower.match(/\bcylind/)) scores.cylinder += 3;
    if (lower.match(/\btube\b/)) scores.cylinder += 2;
    if (lower.match(/\bsipper\b/)) scores.cylinder += 1;  // mild, often bottle too

    // Cube / box family
    if (lower.match(/\bbox\b/)) scores.cube += 3;
    if (lower.match(/\bcase\b/)) scores.cube += 3;
    if (lower.match(/\bcube\b/)) scores.cube += 3;
    if (lower.match(/\bstand\b/)) scores.cube += 2;
    if (lower.match(/\borganizer\b/)) scores.cube += 2;
    if (lower.match(/\brect/)) scores.cube += 2;

    // Sphere / ball family
    if (lower.match(/\bball\b/)) scores.sphere += 3;
    if (lower.match(/\bround\b/)) scores.sphere += 3;  // ← explicit user rule
    if (lower.match(/\bsphere\b/)) scores.sphere += 3;
    if (lower.match(/\bglobe\b/)) scores.sphere += 3;
    if (lower.match(/\bplanter\b/)) scores.sphere += 2;  // planters are spheroid

    // Torus / ring family
    if (lower.match(/\btorus\b/)) scores.torus += 3;
    if (lower.match(/\bring\b/)) scores.torus += 3;
    if (lower.match(/\bdoughnut\b/)) scores.torus += 3;
    if (lower.match(/\bdonut\b/)) scores.torus += 3;
    if (lower.match(/\bbracelet\b/)) scores.torus += 2;

    // Pick the winner — highest score wins; ties broken by priority order.
    const shapeOrder = ["bottle", "sphere", "cube", "cylinder", "torus"];
    const maxScore = Math.max(...Object.values(scores));
    const baseShape = maxScore > 0
      ? shapeOrder.find((s) => scores[s] === maxScore)
      : "torus"; // nothing matched at all → default

    // ── 2. HOLLOW TOGGLE ────────────────────────────────────────────────────
    const hollow = !!lower.match(
      /hollow|bottle|flask|cup|planter|can|container|box|organizer/
    );

    // ── 3. NAMED DIMENSION MULTIPLIERS ──────────────────────────────────────
    // Extracted as precise numeric values so extreme proportions don't break.

    // Base width multiplier (affects X/Z and bottle base radius)
    let baseWidthMultiplier = 1.0;
    if (lower.match(/ultra[\s-]?wide/)) baseWidthMultiplier = 2.5;
    else if (lower.match(/very[\s-]?wide/)) baseWidthMultiplier = 1.9;
    else if (lower.match(/wide|thick|fat|flared/)) baseWidthMultiplier = 1.4;
    else if (lower.match(/narrow|slender|thin/)) baseWidthMultiplier = 0.6;

    // Neck / body narrowness multiplier (bottle/flask only)
    let neckWidthMultiplier = 1.0;
    if (lower.match(/extremely[\s-]?thin/)) neckWidthMultiplier = 0.2;
    else if (lower.match(/very[\s-]?thin/)) neckWidthMultiplier = 0.35;
    else if (lower.match(/thin|slender|narrow/)) neckWidthMultiplier = 0.55;
    else if (lower.match(/wide[\s-]?neck/)) neckWidthMultiplier = 1.4;

    // Height multiplier
    let heightMultiplier = 1.0;
    if (lower.match(/extremely[\s-]?tall/)) heightMultiplier = 2.0;
    else if (lower.match(/very[\s-]?tall/)) heightMultiplier = 1.7;
    else if (lower.match(/tall|high|stretched/)) heightMultiplier = 1.4;
    else if (lower.match(/short|squat|low/)) heightMultiplier = 0.65;

    // Map multipliers onto legacy scale fields (used by primitive shapes)
    const scaleX = baseWidthMultiplier;
    const scaleY = heightMultiplier;
    const scaleZ = baseWidthMultiplier;

    // ── 4. FEATURE NODES ────────────────────────────────────────────────────
    const features = [];
    if (lower.match(/sipper|nozzle|cap/)) features.push("top-nozzle");
    if (lower.match(/handle|grip/)) features.push("handle");

    // ── 5. LATHE DESIGN PROFILE (bottle / flask only) ───────────────────────
    let designProfile = null;
    if (baseShape === "bottle" || baseShape === "flask") {
      // Base radius driven by scaled width and the explicit width multiplier
      const effectiveW = width * baseWidthMultiplier;
      const baseR = effectiveW / 2;

      // Wide-base flare is already captured in baseWidthMultiplier for the
      // outer base radius; body and neck use neckWidthMultiplier to slim down.
      const hasSipper = !!lower.match(/sipper|nozzle/);

      designProfile = {
        totalHeight: height * heightMultiplier,
        baseRadius: baseR,                         // full base width
        bodyRadius: baseR * neckWidthMultiplier,   // belly narrows with thin/slender
        neckRadius: Math.max(1.5, baseR * 0.22 * neckWidthMultiplier),
        rimRadius: Math.max(1.8, baseR * 0.25 * neckWidthMultiplier),
        hasSipper,
        sipperHeight: height * heightMultiplier * 0.08,
      };
    }

    return {
      baseShape,
      hollow,
      scaleX,
      scaleY,
      scaleZ,
      features,
      ...(designProfile ? { designProfile } : {}),
    };
  };

  // --- Handle Generation Trigger ---
  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setGenerationState("generating");
    setGenerationStep(0);
    setGenerationError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      }).catch((networkErr) => {
        // Intercept network-level dropouts (DNS, Firewall, No Route)
        throw new Error(`NETWORK_BLOCKER: ${networkErr.message}`);
      });

      if (!res.ok) {
        let detail = "Unknown Backend Error";
        try {
          // Robust parsing: read as text first to handle both JSON and plain string error payloads
          const text = await res.text();
          try {
            const errorInfo = JSON.parse(text);
            // Check common error fields (HF/FastAPI use 'detail', standard APIs use 'error' or 'message')
            detail = errorInfo.error || errorInfo.detail || errorInfo.message || (typeof errorInfo === 'string' ? errorInfo : detail);
          } catch (jsonErr) {
            // Fallback to raw text if the body is not a valid JSON object
            detail = text || detail;
          }
        } catch (err) {
          // Handle cases where the body is unreadable or stream is closed
          detail = `Server responded with ${res.status} status.`;
        }

        throw new Error(detail);
      }

      const { modelUrl } = await res.json();

      // Minimal fallback recipe – the viewer can still render based on dimensions
      const recipe = {
        baseShape: "cylinder",
        hollow: false,
        features: [],
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
      };

      const slug = prompt.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 24);
      const randSize = (7.5 + Math.random() * 10).toFixed(1);
      const randHours = Math.floor(1 + Math.random() * 2);
      const randMinutes = Math.floor(10 + Math.random() * 49);
      const randPolys = (80000 + Math.floor(Math.random() * 120000)).toLocaleString();

      const modelMeta = {
        id: Date.now().toString(),
        prompt: prompt.trim(),
        name: prompt.trim().split(" ").slice(0, 3).join(" ") || "Custom Prototype",
        format: "GLB",
        width: Number(width),
        height: Number(height),
        depth: Number(depth),
        thickness: Number(thickness),
        designRecipe: recipe,
        fileSize: `${randSize} MB`,
        printTime: `${randHours}h ${randMinutes}m`,
        polyCount: randPolys,
        filename: `${slug || "model"}.glb`,
        modelUrl,
      };

      setGeneratedModel(modelMeta);
      setGenerationState("success");

      // History entry (uses same recipe)
      setGallery((prev) => [
        {
          id: modelMeta.id,
          prompt: modelMeta.prompt,
          name: modelMeta.name,
          format: modelMeta.format,
          width: modelMeta.width,
          height: modelMeta.height,
          depth: modelMeta.depth,
          thickness: modelMeta.thickness,
          designRecipe: modelMeta.designRecipe,
          fileSize: modelMeta.fileSize,
          printTime: modelMeta.printTime,
          polyCount: modelMeta.polyCount,
          color:
            recipe.baseShape === "bottle" || recipe.baseShape === "flask"
              ? "#06b6d4"
              : recipe.baseShape === "cylinder"
                ? "#10b981"
                : recipe.baseShape === "cube"
                  ? "#6366f1"
                  : recipe.baseShape === "sphere"
                    ? "#f59e0b"
                    : "#8b5cf6",
        },
        ...prev,
      ]);
    } catch (e) {
      console.error("Generation Pipeline Failure:", e);

      let friendlyMessage = e.message;

      // DNS / Local Network Blocker Interception - handles capitalized variants and proxy-specific strings
      const isConnectionIssue = /fetch failed|dns|local network|blocked|econn|flux/i.test(e.message);

      if (isConnectionIssue) {
        friendlyMessage = "Network Connection Blocked: Your local DNS resolver, firewall, or VPN dropped the connection to the Hugging Face API space (black-forest-labs/FLUX.1-schnell). Please temporarily disable your ad-blocker/VPN or whitelist the endpoint domain.";
      }

      setGenerationError(friendlyMessage);
      setGenerationState("error");
    }
  };

  // --- Select Past Project from Gallery ---
  const handleLoadHistory = (item) => {
    setPrompt(item.prompt);
    setFormat(item.format);
    setWidth(item.width);
    setHeight(item.height);
    setDepth(item.depth);
    setThickness(item.thickness);

    setGeneratedModel({
      ...item,
      filename: `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.${item.format.toLowerCase()}`
    });
    setGenerationState("success");
  };

  // --- Trigger Mock STL Download ---
  const triggerDownload = () => {
    if (!generatedModel) return;
    const content = `solid ASCII CSG model\n# File name: ${generatedModel.filename}\n# Prompt: ${generatedModel.prompt}\n# Shape: ${generatedModel.designRecipe.baseShape}\n# Hollowed: ${generatedModel.designRecipe.hollow}\n# Features: ${generatedModel.designRecipe.features.join(",")}\n# Bounds: ${width}x${height}x${depth}mm\n# Shell Wall: ${thickness}mm\nfacet normal 0 0 0\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = generatedModel.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- Render custom matching dimension text depending on shape ---
  const getDimensionLabel = (model) => {
    const shape = model.designRecipe.baseShape;
    const scaleX = model.designRecipe.scaleX;
    const scaleY = model.designRecipe.scaleY;
    const scaleZ = model.designRecipe.scaleZ;

    const computedW = (width * scaleX).toFixed(0);
    const computedH = (height * scaleY).toFixed(0);
    const computedD = (depth * scaleZ).toFixed(0);

    if (shape === "cylinder") {
      return `Radius: ${(computedW / 2).toFixed(0)}mm, Height: ${computedH}mm`;
    }
    if (shape === "sphere") {
      return `Radius: ${(Math.min(computedW, computedH) / 2).toFixed(0)}mm (Sphere)`;
    }
    if (shape === "torus") {
      return `Radius: ${(computedW / 2).toFixed(0)}mm, Tube: ${(thickness * 1.5).toFixed(1)}mm`;
    }
    return `${computedW}w × ${computedH}h × ${computedD}d mm`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-indigo-500 selection:text-white pb-6">
      {/* AI Engine Status */}
      {generationState === "generating" && (
        <div className="text-xs text-indigo-300 mb-4">
          Generating model...
        </div>
      )}
      {/* Background Soft Glow Layer */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-500/5 rounded-full filter blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-violet-500/5 rounded-full filter blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-lg shadow-inner">
              <Boxes className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                PrintForge3D <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-mono font-medium">CSG Engine</span>
              </h1>
              <p className="text-[10px] text-zinc-500">Constructive Solid Geometry Compiler</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-400">
            <span className="hidden sm:inline">Build volume: <b className="text-zinc-200">220 x 220 x 250 mm</b></span>
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

        {/* Left Column: Sidebar Gallery & Prompt Form */}
        <section className="lg:col-span-7 xl:col-span-6 flex flex-col gap-6">

          {/* Main Controls Form */}
          <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-5">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
              <h2 className="text-sm font-semibold tracking-wider text-zinc-300 uppercase flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-400" />
                Prompt Generator
              </h2>
              <span className="text-[11px] text-zinc-500">Enter custom geometry concepts</span>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
                  Describe your physical product
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g., A tall hollow bottle with a sipper and a handle"
                  className="w-full h-24 px-4 py-3 bg-zinc-950 border border-zinc-900 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/80 focus:ring-1 focus:ring-indigo-500/20 transition-all resize-none"
                  required
                />
              </div>

              {/* 3D Print Optimization Sub-box */}
              <div className="bg-zinc-950/60 border border-zinc-900/60 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                    <Settings className="h-3.5 w-3.5 text-zinc-400" />
                    3D Print Optimization
                  </h3>
                  <span className="text-[10px] text-zinc-500 font-mono">Slicer Preset: PLA Standard</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Export format selection */}
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase font-mono tracking-wider mb-1.5">
                      Export Format
                    </label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-900 rounded-lg text-xs text-zinc-200 focus:outline-none cursor-pointer"
                    >
                      <option value="STL">STL (.stl - Standard)</option>
                      <option value="OBJ">OBJ (.obj - Mesh)</option>
                      <option value="3MF">3MF (.3mf - XML)</option>
                    </select>
                  </div>

                  {/* Wall thickness slider */}
                  <div>
                    <label className="block text-[10px] text-zinc-500 uppercase font-mono tracking-wider mb-1.5 flex justify-between">
                      <span>Wall Thickness</span>
                      <span className="text-indigo-400 font-bold">{thickness} mm</span>
                    </label>
                    <input
                      type="range"
                      min="0.8"
                      max="5.0"
                      step="0.4"
                      value={thickness}
                      onChange={(e) => setThickness(Number(e.target.value))}
                      className="w-full accent-indigo-500 h-1.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                </div>

                {/* Bounds Sliders */}
                <div className="space-y-3 pt-2 border-t border-zinc-900/50">
                  <span className="block text-[10px] text-zinc-500 uppercase font-mono tracking-wider">
                    Target Dimensions (Max 220mm)
                  </span>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[9px] text-zinc-500 block mb-1">X-Width: {width}mm</label>
                      <input
                        type="range"
                        min="20"
                        max="220"
                        step="5"
                        value={width}
                        onChange={(e) => setWidth(Number(e.target.value))}
                        className="w-full accent-indigo-500 h-1 bg-zinc-900 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-500 block mb-1">Y-Height: {height}mm</label>
                      <input
                        type="range"
                        min="20"
                        max="250"
                        step="5"
                        value={height}
                        onChange={(e) => setHeight(Number(e.target.value))}
                        className="w-full accent-indigo-500 h-1 bg-zinc-900 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-zinc-500 block mb-1">Z-Depth: {depth}mm</label>
                      <input
                        type="range"
                        min="20"
                        max="220"
                        step="5"
                        value={depth}
                        onChange={(e) => setDepth(Number(e.target.value))}
                        className="w-full accent-indigo-500 h-1 bg-zinc-900 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={generationState === "generating"}
                className={`w-full py-3 px-4 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all select-none ${generationState === "generating"
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-900"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-[0.99]"
                  }`}
              >
                <span>Generate 3D Prototype</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </div>

          {/* History / Gallery List */}
          <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-zinc-900 pb-2.5">
              <History className="h-4 w-4 text-zinc-400" />
              <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">
                Prototype Library
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-3 max-h-[220px] lg:max-h-none overflow-y-auto pr-1">
              {gallery.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleLoadHistory(item)}
                  className="w-full text-left p-3.5 bg-zinc-950 border border-zinc-900/60 rounded-xl hover:border-zinc-800 hover:bg-zinc-900/10 transition-all flex items-start justify-between group"
                >
                  <div className="space-y-1.5 max-w-[85%]">
                    <h4 className="font-bold text-zinc-200 text-xs truncate group-hover:text-indigo-400 transition-colors">
                      {item.name}
                    </h4>
                    <p className="text-[10px] text-zinc-500 line-clamp-1 italic">
                      "{item.prompt}"
                    </p>
                    <div className="flex items-center gap-2 text-[9px] text-zinc-500 font-mono">
                      <span>{item.width}x{item.height}x{item.depth}mm</span>
                      <span>•</span>
                      <span>{item.format} ({item.designRecipe.baseShape})</span>
                    </div>
                  </div>
                  <span
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{
                      backgroundColor:
                        item.designRecipe.baseShape === "bottle" || item.designRecipe.baseShape === "flask"
                          ? "#06b6d4"
                          : item.designRecipe.baseShape === "cylinder"
                            ? "#10b981"
                            : item.designRecipe.baseShape === "cube"
                              ? "#6366f1"
                              : item.designRecipe.baseShape === "sphere"
                                ? "#f59e0b"
                                : "#8b5cf6"
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right Column: 3D Visualizer Canvas */}
        <section className="lg:col-span-5 xl:col-span-6 bg-zinc-900/40 border border-zinc-900 rounded-3xl p-5 flex flex-col items-stretch gap-5 min-h-[500px]">

          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <h2 className="text-sm font-semibold tracking-wider text-zinc-300 uppercase flex items-center gap-2">
              <Cpu className="h-4 w-4 text-indigo-400" />
              3D Workspace Canvas
            </h2>
            <span className="text-[10px] bg-zinc-950/80 border border-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full flex items-center gap-1 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              CSG compiler active
            </span>
          </div>

          {/* 3D Canvas Box Container */}
          <div className="flex-1 bg-zinc-950/90 border border-zinc-900 rounded-2xl relative overflow-hidden flex flex-col items-stretch min-h-[380px]">

            {/* --- IDLE STATE --- */}
            {generationState === "idle" && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none z-10 space-y-4">
                <div className="relative group cursor-pointer">
                  <div className="absolute inset-0 bg-indigo-500/10 rounded-full filter blur-xl group-hover:bg-indigo-500/20 transition-all" />
                  <div className="w-16 h-16 rounded-2xl border border-zinc-800 flex items-center justify-center bg-zinc-900/50 text-zinc-400 group-hover:text-indigo-400 group-hover:border-zinc-700 transition-all transform hover:rotate-12 duration-300">
                    <Maximize2 className="h-6 w-6 animate-pulse" />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-300 text-sm">Visual Build Chamber</h3>
                  <p className="text-xs text-zinc-600 max-w-[240px] mt-1.5 leading-relaxed">
                    Virtual print-bed is empty. Enter design criteria and prompt to trigger geometric reconstruction.
                  </p>
                </div>
              </div>
            )}

            {/* --- ERROR STATE --- */}
            {generationState === "error" && (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center z-10 space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-red-500/20 rounded-full filter blur-xl" />
                  <div className="w-14 h-14 rounded-2xl border border-red-500/20 flex items-center justify-center bg-red-500/10 text-red-400">
                    <Settings className="h-6 w-6" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-zinc-200">Geometric Reconstruction Failed</h3>
                  <p className="text-[11px] text-zinc-500 max-w-[320px] leading-relaxed">
                    {generationError}
                  </p>
                </div>
                <button
                  onClick={() => setGenerationState("idle")}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-lg text-[10px] font-mono text-zinc-400 transition-colors"
                >
                  Back to Workspace
                </button>
              </div>
            )}

            {/* --- GENERATING / PIPELINE STATE --- */}
            {generationState === "generating" && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center z-10 w-full space-y-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-indigo-600/30 rounded-full filter blur-2xl animate-pulse" />
                  <div className="w-16 h-16 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 flex items-center justify-center animate-spin">
                    <div className="w-10 h-10 rounded-full border-2 border-dashed border-violet-400/40 animate-spin" style={{ animationDirection: 'reverse' }} />
                  </div>
                </div>

                <div className="space-y-3 w-full max-w-[280px]">
                  <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-300"
                      style={{ width: `${((generationStep + 1) / stepperMessages.length) * 100}%` }}
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-indigo-400 font-mono tracking-wide uppercase">
                      PROTOTYPING STEP {generationStep + 1}
                    </p>
                    <p className="text-xs text-zinc-300 font-medium h-4 truncate">
                      {stepperMessages[generationStep]}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* --- SUCCESS STATE (Three.js WebGL Viewer) --- */}
            {generationState === "success" && generatedModel && (
              <div className="flex-1 flex flex-col items-stretch h-full">
                {/* Embedded Three.js Viewer Canvas */}
                <div className="flex-1 relative min-h-[260px]">
                  <ThreeViewer
                    designRecipe={generatedModel.designRecipe}
                    width={width}
                    height={height}
                    depth={depth}
                    thickness={thickness}
                  />

                  {/* Floating shape label in viewer */}
                  <div className="absolute top-3 left-4 text-[10px] font-mono bg-zinc-950/70 border border-zinc-900 text-zinc-400 px-2 py-1 rounded select-none uppercase flex gap-2">
                    <span>Shape: {generatedModel.designRecipe.baseShape}</span>
                    {generatedModel.designRecipe.hollow && <span className="text-indigo-400">[Hollow]</span>}
                    {generatedModel.designRecipe.features.map(f => (
                      <span key={f} className="text-emerald-400">+{f}</span>
                    ))}
                  </div>
                </div>

                {/* Floating Specs details overlay */}
                <div className="bg-zinc-900/80 border-t border-zinc-900 p-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <span className="text-zinc-500 font-mono text-[9px] block">BOUNDS LIMIT</span>
                    <span className="font-semibold text-zinc-300 truncate block">
                      {getDimensionLabel(generatedModel)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-zinc-500 font-mono text-[9px] block">ESTIMATED PRINT TIME</span>
                    <span className="font-semibold text-emerald-400 flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 inline" />
                      {generatedModel.printTime}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-zinc-500 font-mono text-[9px] block">POLYGON COUNT</span>
                    <span className="font-semibold text-zinc-300 flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-violet-400" />
                      {generatedModel.polyCount} faces
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-zinc-500 font-mono text-[9px] block">ASSET EXPORT SIZE</span>
                    <span className="font-semibold text-zinc-300 flex items-center gap-1">
                      <Database className="h-3.5 w-3.5 text-zinc-500" />
                      {generatedModel.fileSize} ({generatedModel.format})
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Download and Print Section */}
          {generationState === "success" && generatedModel && (
            <div className="bg-zinc-950/60 border border-zinc-900 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                  <FileCode className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-xs text-zinc-200">
                    {generatedModel.filename}
                  </h4>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Compound solid compiled. Double-click in the canvas and drag to orbit. Sliders immediately regenerate the CSG mesh in real-time.
                  </p>
                </div>
              </div>

              <button
                onClick={triggerDownload}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
              >
                <Download className="h-4 w-4" />
                Download {generatedModel.format} for 3D Printing
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
