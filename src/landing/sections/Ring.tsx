import { NEARBLOCKS_TX, RING_245 } from '../facts'
import { KindIcon } from './kindIcon'
import { LoopPath } from './Mac'

const R = RING_245
const MEMBERS = R.deliveries.map((d) => d.seller) // alice, bob, dan2: each sells to the next
const LEFT = R.owed - R.cleared // 9 credit after the loop, netted per member to R.moved

// the waterfall of epoch 245, in credit, like the one of epoch 8 in Numbers: owed, cancelled in the loop, netted, moved
const STEPS = [
  { key: 'owed', label: 'Owed', figure: String(R.owed), low: 0, high: R.owed },
  { key: 'loops', label: 'Loop', figure: `−${R.cleared}`, low: LEFT, high: R.owed },
  { key: 'pairs', label: 'Netted', figure: `−${LEFT - R.moved}`, low: R.moved, high: LEFT },
  { key: 'moved', label: 'Moved', figure: String(R.moved), low: 0, high: R.moved },
]
const pc = (v: number) => `${((v / R.owed) * 100).toFixed(2)}%`

/** FE-127: the ring of epoch 245 (AG-055), the strongest barter run: three mock NFTs moved through the circle's escrow, and the loop of their three debts
 * cancelled. Static, from the run record (src/data/recordedRuns.ts); the labels say what the run is and is not. */
export function Ring() {
  return (
    <section className="section" id="ring" aria-labelledby="ring-h">
      <div className="col">
        <div className="xhead">
          <p className="tag">Recorded on testnet ({R.item})</p>
          <h2 id="ring-h" className="reveal-words">Three NFTs changed hands. {R.moved} mock USDT moved.</h2>
          <p className="sub">
            In epoch {R.epoch}, three agents each sold an NFT to the next one. The circle held each NFT in escrow and handed it to the buyer. The three debts made one loop,
            and the loop cancelled most of them.
          </p>
          <ul className="ring-tags" aria-label="What this run is">
            <li>NEAR testnet</li>
            <li>Mock NFTs</li>
            <li>Mock USDT</li>
            <li>Prices set by the operator, not by the appraiser</li>
            <li>One operator played all three agents</li>
          </ul>
        </div>
        <div className="xgrid">
          <article className="xcard reveal">
            <h3>Each NFT really moved</h3>
            <p>The owner of each token on {R.nftContract}, before the trade and after it. In between, the circle held it.</p>
            <figure className="xfig xfig-checks">
              <p className="xfig-bar mono">
                <LoopPath members={[0, 1, 2]} label={(m) => MEMBERS[m]} /> · epoch {R.epoch}
              </p>
              <ol className="legs" aria-label={`The three NFTs of epoch ${R.epoch}`}>
                {R.deliveries.map((d) => (
                  <li key={d.key}>
                    <span className="kind-box" aria-hidden="true">
                      <KindIcon code={d.kind} />
                    </span>
                    <span className="leg-what">
                      <b>{d.label}</b>
                      <span className="mono">
                        {d.seller} → {d.buyer}
                      </span>
                    </span>
                    <span className="leg-price mono">{d.price} credit</span>
                    <span className="leg-owner mono">
                      owner before <b>{d.seller}</b> · in escrow {R.contract} · after <b>{d.buyer}</b>
                    </span>
                  </li>
                ))}
              </ol>
            </figure>
          </article>
          <article className="xcard reveal">
            <h3>The loop cancels first</h3>
            <p>
              {R.owed} credit was owed. {R.cleared} cancelled in the loop, and the {LEFT} left netted to {R.moved} mock USDT: alice paid 1, dan2 paid 7, bob claimed 8.
            </p>
            <figure className="xfig">
              <div className="fall" role="img" aria-label={`Of ${R.owed} credit owed: ${R.cleared} cancelled in the loop, ${LEFT - R.moved} netted, ${R.moved} mock USDT moved.`}>
                {STEPS.map((st) => (
                  <div key={st.key} className={`fall-col fall-${st.key}`}>
                    <div className="fall-track">
                      <i style={{ bottom: pc(st.low), height: pc(st.high - st.low) }} />
                      <span className="fall-fig mono" style={{ bottom: `calc(${pc(st.high)} + 6px)` }}>
                        {st.figure}
                      </span>
                    </div>
                    <span className="fall-label">{st.label}</span>
                  </div>
                ))}
              </div>
            </figure>
          </article>
        </div>
        <div className="ring-links">
          <a className="pill white lg" href={R.stats}>
            Replay epoch {R.epoch}
          </a>
          <a className="pill dark lg" href={`${NEARBLOCKS_TX}${R.deliveries[0].completeEscrow}`}>
            complete_escrow on NearBlocks
          </a>
          <a className="pill dark lg" href={R.doc}>
            Read the run record
          </a>
        </div>
        <p className="ring-src">
          Recorded on testnet ({R.item}), contract {R.contract}. The live appraiser valued the mock tokens at about 0, so the prices{' '}
          {R.deliveries.map((d) => d.price).join(', ')} credit were set by the operator. One operator ran all three agents, each with its own account and keys.
        </p>
      </div>
    </section>
  )
}
