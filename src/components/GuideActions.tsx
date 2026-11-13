// FE-122: the buttons that walk the guides again, on Settings, Help and the All pages sheet. "Replay onboarding" opens Join the circle at step 1
// (onboarding/replay.ts); the tour restarts at step 1, or resumes where it was left when a step is saved. No wallet is needed for the tour;
// Join the circle asks to sign in first, as it always does.
import { Button } from '../ds/components'
import { useReplayOnboarding } from '../onboarding/replay'
import { loadProgress, startTour } from '../tour/state'
import './guide.css'

export function GuideActions({ onDone }: { onDone?: () => void }) {
  const replay = useReplayOnboarding()
  const saved = loadProgress()
  const resumeAt = saved && !saved.done && saved.step > 0 ? saved.step + 1 : null
  const run = (action: () => void) => () => {
    onDone?.()
    action()
  }
  return (
    <div className="settings-actions guide-actions">
      <Button type="button" variant="quiet" onClick={run(replay)}>
        Replay onboarding
      </Button>
      <Button type="button" variant="quiet" aria-haspopup="dialog" onClick={run(() => startTour(true))}>
        Restart the product tour
      </Button>
      {resumeAt !== null && (
        <Button type="button" variant="quiet" aria-haspopup="dialog" onClick={run(() => startTour(false))}>
          Resume the tour at step {resumeAt}
        </Button>
      )}
    </div>
  )
}
