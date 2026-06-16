'use client'

import { motion } from 'framer-motion'
import { Gauge, ScanLine, Layers, Download, Orbit, BrainCircuit } from 'lucide-react'

const FEATURES = [
  {
    icon: BrainCircuit,
    title: 'AI silhouette synthesis',
    desc: 'A diffusion model turns text into a high-contrast image, isolated to a clean binary mask on the backend.',
  },
  {
    icon: ScanLine,
    title: 'Deterministic contour tracing',
    desc: 'Moore-neighborhood boundary walking plus Douglas–Peucker simplification yields a tidy, predictable outline.',
  },
  {
    icon: Layers,
    title: 'Beveled solid extrusion',
    desc: 'Outlines become water-tight 3D meshes with rounded bevels for a polished, production-ready surface.',
  },
  {
    icon: Orbit,
    title: 'Real-time WebGL viewer',
    desc: 'Orbit, inspect, and watch each model build up from wireframe to solid — all rendered live with Three.js.',
  },
  {
    icon: Download,
    title: 'One-click STL export',
    desc: 'Download a binary STL of any generated mesh and send it straight to your slicer and 3D printer.',
  },
  {
    icon: Gauge,
    title: 'Runs in the browser',
    desc: 'The entire trace-and-extrude pipeline executes client-side. No accounts, no installs, no waiting in a queue.',
  },
]

export default function Features() {
  return (
    <section id="capabilities" className="relative scroll-mt-20 border-y border-border bg-card/30 py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-16 max-w-2xl">
          <span className="font-mono text-xs tracking-widest text-accent">CAPABILITIES</span>
          <h2 className="mt-3 text-balance text-4xl font-bold tracking-tight md:text-5xl">
            A complete forge, end to end
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Generation, tracing, extrusion, and export — every stage is built in
            and tuned to work together.
          </p>
        </div>

        <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
              className="group bg-card p-8 transition-colors hover:bg-secondary"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-secondary text-primary transition-colors group-hover:border-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
