import { NEAR_NETWORK } from '../config'
import { NETWORK_NAME } from '../lib/network'
import nearLogo from '../assets/near.jpg'

/** The network the dashboard is on, in the top bar of every page, signed in or not, so nobody takes test tokens for money. */
export function NetworkChip() {
  return (
    <span
      className="net-chip"
      data-network={NEAR_NETWORK}
      title={NEAR_NETWORK === 'mainnet' ? 'This dashboard is on NEAR mainnet.' : 'This dashboard is on NEAR testnet. Its tokens are mock tokens with no value, and no real funds move.'}
    >
      {/* v6: the NEAR mark, with a small live dot on it */}
      <span className="net-mark" aria-hidden="true">
        <img src={nearLogo} alt="" width="18" height="18" />
        <i />
      </span>
      {NETWORK_NAME}
    </span>
  )
}
