import { NEARBLOCKS_TX, recordedEpoch } from '../data/recordedRuns'

const short = (hash: string) => `${hash.slice(0, 8)}…`

/**
 * FE-128: what changed hands in the epoch, for an epoch with a run record (src/data/recordedRuns.ts). An epoch of the asset ring lists its deliveries;
 * a credit-only ring says that no asset moved. Any other epoch shows nothing: the read API does not say which escrow delivered when.
 */
export function RecordedAssets({ contract, circle, epoch }: { contract: string; circle: string; epoch: number }) {
  const run = recordedEpoch(contract, circle, epoch)
  if (!run) return null
  if (run.kind === 'credit') {
    return (
      <section className="ep-section ep-assets" aria-label="Assets delivered in this epoch">
        <p className="state">Credit only: no asset changed hands in this ring.</p>
      </section>
    )
  }
  return (
    <section className="ep-section ep-assets" aria-labelledby="ep-assets-h">
      <h2 id="ep-assets-h" className="ep-h2">Assets delivered in this epoch</h2>
      <p className="state">
        Recorded run on NEAR testnet ({run.item}): mock NFTs on {run.nftContract}, held in the circle&apos;s escrow and handed to the buyer by complete_escrow.
        Prices were set by the operator, not by the appraiser. One operator played all three members.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">Token</th>
              <th scope="col">Seller → buyer</th>
              <th scope="col" className="num">Price</th>
              <th scope="col">complete_escrow</th>
            </tr>
          </thead>
          <tbody>
            {run.deliveries.map((d) => (
              <tr key={d.key}>
                <td>
                  {d.label}
                  <br />
                  <code className="plain">{d.token}</code>
                </td>
                <td>
                  <span title={d.sellerAccount}>{d.seller}</span> → <span title={d.buyerAccount}>{d.buyer}</span>
                </td>
                <td className="num">{d.price} credit</td>
                <td>
                  <a href={`${NEARBLOCKS_TX}${d.completeEscrow}`} aria-label={`complete_escrow transaction ${d.completeEscrow} on NearBlocks`} title={d.completeEscrow}>
                    <code>{short(d.completeEscrow)}</code>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ep-how">
        <a href={run.doc}>The run record ({run.item})</a>
      </p>
    </section>
  )
}
