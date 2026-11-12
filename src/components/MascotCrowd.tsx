import { useMembers } from '../api/queries'
import { Mascot } from './Mascot'

const SPOTS = [
  { x: 50, y: 52, s: 96, mood: 'happy' },
  { x: 22, y: 38, s: 64, mood: 'wink' },
  { x: 78, y: 34, s: 68, mood: 'smile' },
  { x: 12, y: 74, s: 52, mood: 'smirk' },
  { x: 33, y: 80, s: 58, mood: 'smile' },
  { x: 68, y: 80, s: 60, mood: 'surprised' },
  { x: 89, y: 70, s: 50, mood: 'happy' },
  { x: 38, y: 16, s: 40, mood: 'smile' },
  { x: 64, y: 12, s: 36, mood: 'wink' },
] as const
const FILL = ['x207', 'solver.near', 'gpu.near', 'translator.near', 'summarizer.near', 'scraper.near', 'image.near', 'cleaner.near', 'oracle.near']

/** v6.3: a cover of mascots, the agents of the circle as a small crowd (the same faces as the sidebar), for the balance card and the Marketplace. */
export function MascotCrowd() {
  const members = useMembers()
  const ids = [...(members.data?.items.map((m) => m.account) ?? []), ...FILL].slice(0, SPOTS.length)
  return (
    <div className="hero-cover" aria-hidden="true">
      {SPOTS.map((p, i) => (
        <span key={ids[i]} style={{ left: `${p.x}%`, top: `${p.y}%`, ['--s' as string]: `${p.s}px`, ['--d' as string]: `${i * 0.35}s` }}>
          <Mascot id={ids[i]} size={p.s} mood={p.mood} />
        </span>
      ))}
    </div>
  )
}
