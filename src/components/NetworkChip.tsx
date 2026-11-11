import { NEAR_NETWORK } from '../config'
import { NETWORK_NAME } from '../lib/network'

/** The network the dashboard is on, in the top bar of every page, signed in or not, so nobody takes test tokens for money. */
export function NetworkChip() {
  return (
    <span
      className="net-chip"
      data-network={NEAR_NETWORK}
      title={NEAR_NETWORK === 'mainnet' ? 'This dashboard is on NEAR mainnet.' : 'This dashboard is on NEAR testnet. Its tokens are mock tokens with no value, and no real funds move.'}
    >
      <i aria-hidden="true" />
      {NETWORK_NAME}
    </span>
  )
}
