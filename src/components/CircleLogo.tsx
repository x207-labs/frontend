import { CONTRACT_ID } from '../config'
import { Mascot } from './Mascot'

/** v6.3: the logo of the circle, the mascot of its contract, as the circle picker shows it. Decorative: the circle is named beside it. */
export function CircleLogo({ size = 22 }: { size?: number }) {
  return (
    <span className="eyebrow-logo" aria-hidden="true">
      <Mascot id={CONTRACT_ID} size={size} mood="smile" />
    </span>
  )
}
