import { useEpochs } from '../api/queries'
import type { MemberResponse } from '../api/types'
import { formatCredit } from '../lib/format'
import { useSignTransaction } from '../wallet/WalletContext'
import { requestExitTx, withdrawStakeTx } from '../wallet/transactions'
import { TxResult } from './TxResult'

// FE-018 (ADR-29, ADR-32): keluar dari lingkaran dan tarik stake. Syarat penarikan sama dengan kontrak: epoch tempat keluar diminta
// sudah `finalized` dan `outstanding_debt` anggota 0. Kontrak tetap yang memutuskan; panel hanya mencegah transaksi yang pasti ditolak.
export function ExitPanel({ member }: { member: MemberResponse }) {
  const epochs = useEpochs()
  const { state, sign } = useSignTransaction()
  const signing = state.kind === 'signing'
  const owes = BigInt(member.outstandingDebt) > 0n
  const requested = member.exitRequestedEpoch
  const phase = requested === null ? null : epochs.data?.items.find((e) => e.epoch === requested)?.phase ?? null
  const finalized = phase === 'finalized'

  if (member.status === 'exited') {
    return (
      <section aria-label="Keluar dari lingkaran">
        <h2>Keluar dari lingkaran</h2>
        <p className="state">Akun ini sudah keluar dan stake sudah ditarik. Klaim epoch lama tetap bisa diambil di halaman settlement.</p>
      </section>
    )
  }
  if (member.status === 'pending') return null

  return (
    <section aria-label="Keluar dari lingkaran">
      <h2>Keluar dari lingkaran</h2>
      {owes && (
        <p className="state state-error" role="alert">
          Masih ada kewajiban {formatCredit(member.outstandingDebt)} credit (posisi <code className="plain">due</code> atau obligasi epoch berjalan).
          Lunasi dulu: <code className="plain">withdraw_stake</code> ditolak <code className="plain">ERR_HAS_DUE</code> selama kewajiban ada.
        </p>
      )}
      {requested === null ? (
        <>
          <p className="state">
            Setelah meminta keluar, voucher untuk epoch berikutnya dan tambahan stake ditolak. Voucher epoch ini tetap berlaku sampai cutoff.
          </p>
          <button type="button" disabled={signing} onClick={() => void sign(requestExitTx())}>
            {signing ? 'Menunggu wallet…' : 'Minta keluar'}
          </button>
        </>
      ) : (
        <>
          <p className="state" role="status">
            Keluar diminta di epoch {requested}.{' '}
            {finalized ? 'Epoch itu sudah finalized.' : `Menunggu epoch ${requested} berstatus finalized${phase ? ` (sekarang ${phase})` : ''}.`}
          </p>
          <button type="button" disabled={signing || !finalized || owes} onClick={() => void sign(withdrawStakeTx())}>
            {signing ? 'Menunggu wallet…' : `Tarik stake (${formatCredit(member.stake)})`}
          </button>
        </>
      )}
      <TxResult state={state} />
    </section>
  )
}
