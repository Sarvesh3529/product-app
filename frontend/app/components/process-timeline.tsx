'use client'

import { motion } from 'framer-motion'
import { MessageSquareText, Sparkles, Scissors, Boxes } from 'lucide-react'

const STEPS = [
  {
    n: '01',
    icon: MessageSquareText,
    title: 'Describe',
    desc: 'Type a plain-language prompt for any object. No modeling skills, no software, no setup.',
    code: '$ forge "a vintage key"',
  },
  {
    n: '02',
    icon: Sparkles,
    title: 'Generate',
    desc: 'A diffusion model renders a high-contrast silhouette, then the background is stripped to a clean binary mask.',
    code: 'flux → remove-bg → threshold',
  },
  {
    n: '03',
    icon: Scissors,
    title: 'Trace',
    desc: 'Moore-neighborhood boundary tracing extracts the outline, simplified with Douglas–Peucker into a clean polygon.',
    code: 'contour → simplify(ε=1.0)',
  },
  {
    n: '04',
    icon: Boxes,
    title: 'Extrude',
    desc: 'The 2D polygon is beveled and extruded into a water-tight solid mesh, ready to orbit and export as STL.',
    code: 'THREE.ExtrudeGeometry → .stl',
  },
]

export default function ProcessTimeline() {
  return (
    <section id="process" className="relative mx-auto max-w-6xl scroll-mt-20 px-6 py-28">
      <div className="mb-16 max-w-2xl">
        <span className="font-mono text-xs tracking-widest text-accent">THE PIPELINE</span>
        <h2 className="mt-3 text-balance text-4xl font-bold tracking-tight md:text-5xl">
          Four steps from sentence to solid
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          Every model travels the same deterministic path. Here is exactly what
          happens between your prompt and a printable mesh.
        </p>
      </div>

      <div className="relative grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* connecting line */}
        <div className="pointer-events-none absolute left-0 top-9 hidden h-px w-full bg-gradient-to-r from-transparent via-border to-transparent lg:block" />

        {STEPS.map((step, i) => (
          <motion.div
            key={step.n}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: i * 0.1 }}
            className="relative rounded-xl border border-border bg-card p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-secondary text-primary">
                <step.icon className="h-5 w-5" />
              </span>
              <span className="font-mono text-2xl font-bold text-border">{step.n}</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
            <code className="mt-4 block truncate rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] text-primary">
              {step.code}
            </code>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
