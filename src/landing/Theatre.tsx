import {
  AnimatePresence,
  animate,
  m,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  type MotionValue,
} from 'motion/react'
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { BARTER, BARTER_TOTAL, EPOCH8, LIVE } from './facts'
import { BrainStage } from './BrainStage'
import { Icon, type IconName } from './icons'
import { Ring } from './Ring'
import { EASE_OUT, SPRING, STORY } from './tokens'

// FE-048: the scroll theatre, the first screen and the story of one epoch in one sticky stage. The hologram brain stays on stage the whole way; each chapter is
// one line and one number, and the brain plays it as the page scrolls (tokens.ts STORY). Numbers: facts.ts (testnet epoch 8 on x207-v013, docs/barter-evidence.md).

const REFUSED = BARTER.find((r) => r.key === 'refused')?.count ?? 0
const ON_TESTNET = BARTER.find((r) => r.key === 'testnet')?.count ?? 0

/** What an agent can pay with, cycled in the headline. Each is a kind of the barter catalog; screen readers hear "anything". */
const WORDS = ['GPU hours', 'datasets', 'API keys', 'NEAR accounts', 'NFTs', 'model weights', 'anything']
/** FE-051: the object of each word, in the pill under the buttons; "anything" lights them all. */
const WORD_ICONS: IconName[] = ['chip', 'dataset', 'key', 'account', 'frame', 'weights']

// The headline word and the pill read one index, so the timer lives in one place and the theatre does not re-render with it.
let wordAt = WORDS.length - 1
const wordSubs = new Set<() => void>()
const subscribeWord = (fn: () => void) => {
  wordSubs.add(fn)
  return () => {
    wordSubs.delete(fn)
  }
}
const readWord = () => wordAt
const setWord = (i: number) => {
  wordAt = i
  wordSubs.forEach((fn) => fn())
}

type Chapter = {
  key: 'kinds' | 'vouchers' | 'loops' | 'net'
  n: string
  kicker: string
  title: string
  from: number
  to: number
  format(v: number): string
  unit: string
  note: string
}

const CHAPTERS: Chapter[] = [
  {
    key: 'kinds',
    n: '01',
    kicker: 'Barter',
    title: 'Anything with value can pay.',
    from: 0,
    to: BARTER_TOTAL - REFUSED,
    format: (v) => String(Math.round(v)),
    unit: 'asset kinds in the catalog',
    note: `${ON_TESTNET} already ran on NEAR testnet.`,
  },
  {
    key: 'vouchers',
    n: '02',
    kicker: 'Vouchers',
    title: 'Sign now, settle later.',
    from: 0,
    to: EPOCH8.vouchers,
    format: (v) => String(Math.round(v)),
    unit: 'vouchers signed in one epoch',
    note: `${EPOCH8.gross} credit owed. Nothing moved yet.`,
  },
  {
    key: 'loops',
    n: '03',
    kicker: 'Clearing',
    title: 'Loops cancel out.',
    from: 0,
    to: EPOCH8.clearedShare,
    format: (v) => `${v.toFixed(1)}%`,
    unit: 'of the credit cleared in loops',
    note: `${EPOCH8.cleared} of ${EPOCH8.gross} credit cancels in loops and never moves.`,
  },
  {
    key: 'net',
    n: '04',
    kicker: 'Settlement',
    title: 'Only the net moves.',
    from: EPOCH8.gross,
    to: EPOCH8.moved,
    format: (v) => `${EPOCH8.gross} → ${v.toFixed(2)}`,
    unit: 'credit in, USDT moved',
    note: `The other ${EPOCH8.netted} nets per member: ${EPOCH8.movements} transfers move ${EPOCH8.moved} USDT.`,
  },
]

function WordPill({ reduced }: { reduced: boolean }) {
  const index = useSyncExternalStore(subscribeWord, readWord, readWord)
  const all = reduced || index === WORDS.length - 1
  return (
    <m.ul className="hero-pill" aria-hidden="true" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.75 }}>
      {WORD_ICONS.map((name, i) => (
        <li key={name} className={all || i === index ? 'is-lit' : undefined} title={WORDS[i]}>
          <Icon name={name} />
        </li>
      ))}
    </m.ul>
  )
}

function MorphWord({ reduced }: { reduced: boolean }) {
  const index = useSyncExternalStore(subscribeWord, readWord, readWord)
  useEffect(() => {
    if (reduced) return
    const t = setTimeout(() => setWord((index + 1) % WORDS.length), index === WORDS.length - 1 ? 2600 : 1150)
    return () => clearTimeout(t)
  }, [index, reduced])
  const word = reduced ? 'anything' : WORDS[index]
  return (
    <span className="line morph">
      <span className="sr-only">anything.</span>
      <span className="morph-slot" aria-hidden="true">
        <AnimatePresence initial={false}>
          <m.span
            key={word}
            className="morph-word"
            initial={{ y: '1.05em' }}
            animate={{ y: 0 }}
            exit={{ y: '-1.05em' }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            {word}.
          </m.span>
        </AnimatePresence>
      </span>
    </span>
  )
}

function Caption({ chapter, story, reduced, skew }: { chapter: Chapter; story: MotionValue<number>; reduced: boolean; skew: MotionValue<number> }) {
  const [a, b] = STORY[chapter.key]
  const opacity = useTransform(story, [a, a + 0.035, b - 0.035, b], [0, 1, 1, 0])
  const y = useTransform(story, [a, a + 0.05, b - 0.05, b], reduced ? [0, 0, 0, 0] : [70, 0, 0, -70])
  const count = useTransform(story, [a + 0.01, a + 0.08], [chapter.from, chapter.to])
  const figure = useTransform(count, chapter.format)
  return (
    <m.article className="chapter" style={{ opacity, y, skewY: skew }} aria-labelledby={`chapter-${chapter.key}`}>
      <p className="chapter-kicker">
        Fig. {chapter.n} <span>{chapter.kicker}</span>
      </p>
      <h2 id={`chapter-${chapter.key}`} className="chapter-title">{chapter.title}</h2>
      <p className="chapter-figure">
        {reduced ? <span aria-hidden="true">{chapter.format(chapter.to)}</span> : <m.span aria-hidden="true">{figure}</m.span>}
        <span className="sr-only">{chapter.format(chapter.to)} </span>
        <small>{chapter.unit}</small>
      </p>
      <p className="chapter-note">{chapter.note}</p>
    </m.article>
  )
}

export function Theatre() {
  const reduced = !!useReducedMotion()
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress: story } = useScroll({ target: ref, offset: ['start start', 'end end'] })

  // The fallback ring plays the same story: members on load, vouchers, netting, settlement.
  const intro = useMotionValue(reduced ? 1 : 0)
  useEffect(() => {
    if (reduced) {
      intro.set(1)
      return
    }
    const play = animate(intro, 1, { duration: 2.8, delay: 0.3, ease: EASE_OUT })
    return () => play.stop()
  }, [intro, reduced])
  const mapped = useTransform(story, [0, STORY.vouchers[0], STORY.vouchers[1], STORY.loops[0], STORY.loops[1], STORY.net[0], STORY.net[1]], [0.14, 0.14, 0.46, 0.5, 0.64, 0.74, 0.92])
  const ringProgress = useTransform(() => Math.min(mapped.get(), intro.get()))
  // On a wide screen the ring stands right of the headline and the captions until the dive (CSS ignores it on a portrait screen).
  const aside = useTransform(story, [STORY.net[1], STORY.dive[0] + 0.05], [1, 0])

  // Pointer depth, and a skew that follows the speed of the scroll (the faster the scroll, the more the captions lean).
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const sx = useSpring(px, { stiffness: 90, damping: 18 })
  const sy = useSpring(py, { stiffness: 90, damping: 18 })
  const { scrollY } = useScroll()
  const speed = useVelocity(scrollY)
  const skew = useSpring(useTransform(speed, [-3000, 0, 3000], reduced ? [0, 0, 0] : [3, 0, -3]), { stiffness: 300, damping: 40 })
  const fogX = useTransform(sx, (v) => v * 18)
  const fogY = useTransform(sy, (v) => v * 12)

  const heroOpacity = useTransform(story, [0, STORY.hero[1] - 0.02], [1, 0])
  const heroY = useTransform(story, [0, STORY.hero[1]], [0, reduced ? 0 : -90])
  const heroVisibility = useTransform(story, (v) => (v > STORY.hero[1] ? 'hidden' : 'visible'))
  const diveFlash = useTransform(story, [STORY.dive[0] + 0.06, 0.985, 1], [0, 0.85, 1])
  const rail = useTransform(story, [STORY.kinds[0], STORY.net[1]], [0, 1])

  const [active, setActive] = useState(-1)
  useMotionValueEvent(story, 'change', (v) => setActive(CHAPTERS.findIndex((c) => v >= STORY[c.key][0] && v < STORY[c.key][1])))

  const onMove = (event: PointerEvent<HTMLElement>) => {
    if (reduced || event.pointerType !== 'mouse') return
    px.set((event.clientX / window.innerWidth - 0.5) * 2)
    py.set((event.clientY / window.innerHeight - 0.5) * 2)
  }

  return (
    <section id="how" ref={ref} className="theatre" onPointerMove={onMove} onPointerLeave={() => (px.set(0), py.set(0))} aria-labelledby="hero-title">
      {/* A link target where the first chapter is on stage: the theatre scrolls through its height minus one screen. */}
      <span id="epoch" className="theatre-mark" style={{ top: `calc(${STORY.kinds[0] + 0.05} * (100% - 100svh))` }} />
      <div className="theatre-stage">
        <m.div className="holo-fog" style={{ x: fogX, y: fogY }} aria-hidden="true" />
        <div className="holo-grid" aria-hidden="true" />
        <m.div className="holo-visual" style={{ '--aside': aside } as never}>
          <BrainStage
            reduced={reduced}
            px={sx}
            py={sy}
            story={story}
            fallback={
              <div className="holo-fallback">
                <Ring progress={ringProgress} label={`The circle of ${EPOCH8.tag}: ${EPOCH8.members} members and the ${EPOCH8.vouchers} vouchers they registered`} />
              </div>
            }
          />
        </m.div>

        <m.div className="hero-copy" style={{ opacity: heroOpacity, y: heroY, visibility: heroVisibility }}>
          <m.p className="hero-live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.05 }}>
            Live on NEAR testnet, contract <code>{LIVE.contract}</code>
          </m.p>
          <m.h1 id="hero-title" className="hero-title" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.15 }}>
            {/* The spaces between the lines keep the accessible name one sentence. */}
            <span className="line">Agents pay in</span>{' '}
            <MorphWord reduced={reduced} />{' '}
            <span className="line is-quiet">x207 settles the net.</span>
          </m.h1>
          <m.p className="hero-lead" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }}>
            Mutual-credit settlement for x402 agents on NEAR. Pay in vouchers or in kind; once an epoch, only the net moves.
          </m.p>
          <m.div className="hero-actions" initial={{ y: 14 }} animate={{ y: 0 }} transition={{ ...SPRING, delay: 0.6 }}>
            <a className="btn is-primary" href="#epoch">Watch one epoch</a>
            <a className="btn" href={LIVE.dashboard}>Open the dashboard</a>
          </m.div>
          <WordPill reduced={reduced} />
        </m.div>

        <div className="chapters">
          {CHAPTERS.map((c) => (
            <Caption key={c.key} chapter={c} story={story} reduced={reduced} skew={skew} />
          ))}
        </div>

        <div className="hud" aria-hidden="true">
          <div className="hud-rail">
            <m.span className="hud-fill" style={{ scaleY: rail }} />
          </div>
          <ol className="hud-ticks">
            {CHAPTERS.map((c, i) => (
              <li key={c.key} className={i === active ? 'is-on' : i < active ? 'is-past' : undefined}>
                {c.kicker}
              </li>
            ))}
          </ol>
        </div>
        <p className="hud-source">
          Numbers from {EPOCH8.tag}.{' '}
          <a href={LIVE.epoch8Run} target="_blank" rel="noreferrer">Source</a>
        </p>
        <a className="skip-story" href="#barter">Skip the story</a>
        <m.div className="dive-flash" style={{ opacity: diveFlash }} aria-hidden="true" />
      </div>
    </section>
  )
}
