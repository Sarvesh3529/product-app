'use client'

import { useEffect, useState } from 'react'
import { Hexagon } from 'lucide-react'

const LINKS = [
  { label: 'Process', href: '#process' },
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'Showcase', href: '#showcase' },
]

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'border-b border-border bg-background/80 backdrop-blur-xl' : 'border-b border-transparent'
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2">
          <Hexagon className="h-5 w-5 text-primary" fill="currentColor" />
          <span className="font-mono text-sm font-bold tracking-widest text-foreground">FORGE</span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </div>

        <a
          href="#top"
          className="rounded-md border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary"
        >
          Start forging
        </a>
      </nav>
    </header>
  )
}
