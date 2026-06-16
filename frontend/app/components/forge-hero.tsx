'use client'

import { useCallback, useRef, useState } from 'react'
import { ArrowRight, Box, Cpu, Download, Loader2 } from 'lucide-react'
import ForgeViewer, { type ForgeStatus, type ForgeViewerHandle } from './forge-viewer'

const STATUS_LABELS: Record<ForgeStatus, string> = {
  idle: 'Idle — describe an object to begin',
  requesting: 'Generating AI silhouette…',
  tracing: 'Tracing silhouette contour…',
  extruding: 'Extruding solid geometry…',
  ready: 'Model forged successfully',
  error: 'Pipeline error',
}

const SUGGESTIONS = ['a bottle', 'a vintage key', 'a maple leaf', 'a chess pawn']

export default function ForgeHero() {
  const viewerRef = useRef<ForgeViewerHandle>(null)
  const [prompt, setPrompt] = useState('a bottle, high contrast, clean studio backdrop')
  const [status, setStatus] = useState<ForgeStatus>('idle')
  const [detail, setDetail] = useState('')
  const loading = status === 'requesting' || status === 'tracing' || status === 'extruding'

  const handleStatus = useCallback((next: ForgeStatus, d?: string) => {
    setStatus(next)
    if (d) setDetail(d)
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || loading) return
    try {
      await viewerRef.current?.generate(prompt)
    } catch {
      /* status already reported via onStatus */
    }
  }, [prompt, loading])

  return (
    <section className="relative min-h-screen w-full overflow-hidden">
      {/* 3D viewer fills the section */}
      <ForgeViewer ref={viewerRef} onStatus={handleStatus} />

      {/* blueprint grid + vignette overlays */}
      <div className="forge-grid forge-grid-fade pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,var(--background)_92%)]" />

      {/* hero copy */}
      <div className="pointer-events-none relative z-10 mx-auto flex max-w-6xl flex-col items-center px-6 pt-32 text-center md:pt-36">
        <div className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-accent animate-ember" />
          AI SILHOUETTE → REAL-TIME EXTRUSION
        </div>

        <h1 className="mt-6 text-balance text-5xl font-bold leading-[0.95] tracking-tight md:text-7xl">
          Forge ideas into
          <br />
          <span className="text-primary">printable 3D models</span>
        </h1>

        <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
          Describe any object in plain language. Watch it generated as an AI
          silhouette, traced into a contour, and extruded into a solid mesh —
          live in your browser.
        </p>
      </div>

      {/* command terminal */}
      <div className="absolute inset-x-0 bottom-8 z-20 mx-auto w-full max-w-2xl px-6">
        <div className="pointer-events-auto overflow-hidden rounded-xl border border-border bg-card/80 shadow-2xl backdrop-blur-xl">
          {/* terminal title bar */}
          <div className="flex items-center justify-between border-b border-border px-4 py-2">
            <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <Cpu className="h-3.5 w-3.5 text-primary" />
              forge://generator
            </div>
            <div className="flex items-center gap-2 font-mono text-[11px]">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  status === 'error'
                    ? 'bg-destructive'
                    : status === 'ready'
                      ? 'bg-emerald-400'
                      : loading
                        ? 'bg-accent animate-ember'
                        : 'bg-muted-foreground'
                }`}
              />
              <span className={status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
                {loading ? detail || STATUS_LABELS[status] : STATUS_LABELS[status]}
              </span>
            </div>
          </div>

          {/* prompt input */}
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="select-none font-mono text-sm text-primary">$</span>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleGenerate()
              }}
              placeholder="describe your 3D asset…"
              spellCheck={false}
              className="flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {loading ? 'Forging' : 'Forge'}
            </button>
          </div>

          {/* suggestions + export */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] text-muted-foreground">try:</span>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrompt(s)}
                  className="rounded border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-secondary-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => viewerRef.current?.exportSTL()}
              className="inline-flex items-center gap-1.5 rounded font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              export .stl
            </button>
          </div>
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-center font-mono text-[11px] text-muted-foreground">
          <Box className="h-3 w-3" />
          requires the local backend running on :5000 — drag to orbit the model
        </p>
      </div>
    </section>
  )
}
