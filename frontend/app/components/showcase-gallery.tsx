'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'

const ITEMS = [
  { src: '/showcase/samurai-mask.png', title: 'Samurai mask', prompt: 'a samurai menpo mask' },
  { src: '/showcase/fantasy-castle.png', title: 'Fantasy castle', prompt: 'a fantasy castle with towers' },
  { src: '/showcase/desk-organizer.png', title: 'Desk organizer', prompt: 'a minimalist desk organizer' },
  { src: '/showcase/dog-figurine.png', title: 'Dog figurine', prompt: 'a stylized sitting dog' },
  { src: '/showcase/flower-vase.png', title: 'Ridged vase', prompt: 'an elegant ridged flower vase' },
]

export default function ShowcaseGallery() {
  return (
    <section id="showcase" className="relative mx-auto max-w-6xl scroll-mt-20 px-6 py-28">
      <div className="mb-16 max-w-2xl">
        <span className="font-mono text-xs tracking-widest text-accent">SHOWCASE</span>
        <h2 className="mt-3 text-balance text-4xl font-bold tracking-tight md:text-5xl">
          Forged from a single sentence
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          A glimpse of what comes out of the pipeline. Each piece started life as
          nothing more than a short text prompt.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {ITEMS.map((item, i) => (
          <motion.figure
            key={item.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: (i % 4) * 0.08 }}
            className={`group relative overflow-hidden rounded-xl border border-border bg-card ${
              i === 0 ? 'col-span-2 row-span-2' : ''
            }`}
          >
            <div className={`relative ${i === 0 ? 'aspect-square' : 'aspect-square'}`}>
              <Image
                src={item.src || '/placeholder.svg'}
                alt={`${item.title} — a printable 3D model generated from text`}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-80" />
            </div>
            <figcaption className="absolute inset-x-0 bottom-0 p-4">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <code className="mt-1 block truncate font-mono text-[11px] text-primary">
                $ forge &quot;{item.prompt}&quot;
              </code>
            </figcaption>
            <span className="absolute right-3 top-3 rounded border border-border bg-background/70 px-2 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur">
              .stl
            </span>
          </motion.figure>
        ))}
      </div>
    </section>
  )
}
