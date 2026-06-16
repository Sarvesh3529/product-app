import SiteNav from './components/site-nav'
import ForgeHero from './components/forge-hero'
import ProcessTimeline from './components/process-timeline'
import Features from './components/features'
import ShowcaseGallery from './components/showcase-gallery'
import FinalCta from './components/final-cta'

export default function Page() {
  return (
    <main id="top" className="relative min-h-screen bg-background">
      <SiteNav />
      <ForgeHero />
      <ProcessTimeline />
      <Features />
      <ShowcaseGallery />
      <FinalCta />
    </main>
  )
}
