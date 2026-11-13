import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { Barter } from './sections/Barter'
import { Build } from './sections/Build'
import { Close, Faq } from './sections/Close'
import { Features } from './sections/Features'
import { Hero } from './sections/Hero'
import { Intro, Numbers } from './sections/Intro'
import { Nav } from './sections/Nav'
import { Showcase } from './sections/Showcase'
import { Story } from './sections/Story'
// Geist and Geist Mono, self-hosted (SIL OFL 1.1), for the landing only; landing.css points the --ds-font-* tokens the canvas engines read at them.
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import './landing.css'

// v5 landing (owner direction 2026-11-12): the structure of x.ai/bot (fixed bar with hover menus and a split pill, a centred claim over a macOS window, two-column
// statements, a card grid, an FAQ, a closing call) and DeepBook's split sticky panel for the epoch story. Geist and Geist Mono, on the landing only.
// It has no wallet and no read-API query: it loads on its own, and the dashboard stays at /app and /stats. The canvas engines are the v4 ones (src/landing/v4/).

gsap.registerPlugin(ScrollTrigger, SplitText)

/** One motion language for the whole page, so the sections hand over to each other: every section heading is lit word by word as it scrolls up (grey to white,
 * after HOT Labs), every card rises in, unblurring, in the order it comes into view, and the closing is pinned like Build while its pill grows out of the horizon
 * (after Genie). Motion allowed only; the other pinned sections (Showcase, Intro, Story, Build) run their own timelines. */
function usePageMotion() {
  useEffect(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const splits = gsap.utils.toArray<HTMLElement>('.lp .reveal-words').map((h) => {
        const split = SplitText.create(h, { type: 'words' })
        gsap.fromTo(split.words, { opacity: 0.16 }, { opacity: 1, stagger: 0.08, ease: 'none', scrollTrigger: { trigger: h, start: 'top 88%', end: 'top 45%', scrub: true } })
        return split
      })
      gsap.set('.lp .reveal', { y: 48, opacity: 0, filter: 'blur(8px)' })
      ScrollTrigger.batch('.lp .reveal', {
        start: 'top 90%',
        once: true,
        onEnter: (els) => gsap.to(els, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 1.1, ease: 'expo.out', stagger: 0.09, overwrite: true }),
      })
      // the pinned sections change the page's height once they measure; settle every trigger after the fonts are in
      void document.fonts?.ready.then(() => ScrollTrigger.refresh())
      return () => splits.forEach((s) => s.revert())
    })
    // the closing, like Build: pinned full screen, the pill grows out of the horizon as the arc widens
    mm.add('(min-width: 961px) and (prefers-reduced-motion: no-preference)', () => {
      const stage = document.querySelector<HTMLElement>('.lp .closing-stage')
      if (!stage) return
      gsap
        .timeline({ scrollTrigger: { trigger: stage, start: 'top top', end: '+=80%', pin: true, scrub: 0.8 } })
        .fromTo(stage.querySelector('.closing-pill'), { scale: 0.3, y: 180, opacity: 0 }, { scale: 1, y: 0, opacity: 1, ease: 'power3.out', duration: 1 })
        .fromTo(stage.querySelector('.closing-arc'), { scale: 0.82, opacity: 0.5 }, { scale: 1, opacity: 1, ease: 'none', duration: 1 }, 0)
        .to({}, { duration: 0.3 })
    })
    return () => mm.revert()
  }, [])
}

export default function Landing() {
  usePageMotion()
  useEffect(() => {
    const before = document.title
    document.title = 'x207 · Agents barter, x207 clears the net'
    document.documentElement.classList.add('is-landing')
    return () => {
      document.title = before
      document.documentElement.classList.remove('is-landing')
    }
  }, [])
  return (
    <div className="lp" id="top">
      <a className="skip" href="#main">Skip to the content</a>
      <Nav />
      <main id="main" tabIndex={-1}>
        <Hero />
        <Showcase />
        <Intro />
        <Numbers />
        <Story />
        <Barter />
        <Features />
        <Build />
        <Faq />
        <Close />
      </main>
    </div>
  )
}
