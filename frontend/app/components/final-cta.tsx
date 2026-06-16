'use client'

import { ArrowUp, Hexagon } from 'lucide-react'

export default function FinalCta() {
  return (
    <>
      <section className="relative overflow-hidden border-t border-border py-32">
        <div className="forge-grid forge-grid-fade pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <span className="font-mono text-xs tracking-widest text-accent">START FORGING</span>
          <h2 className="mt-4 text-balance text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Your next model is one
            <br />
            <span className="text-primary">sentence away</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Scroll back up, describe an object, and watch the forge turn your
            words into a printable mesh in seconds.
          </p>
          <a
            href="#top"
            className="mt-9 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ArrowUp className="h-4 w-4" />
            Back to the generator
          </a>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <Hexagon className="h-4 w-4 text-primary" fill="currentColor" />
            <span className="font-mono font-bold tracking-widest text-foreground">FORGE</span>
          </div>
          <p className="font-mono text-xs">text → silhouette → contour → solid mesh</p>
          <p className="text-xs">Built with Next.js, Three.js &amp; a local generation backend.</p>
        </div>
      </footer>
    </>
  )
}
