import { useMembers } from '../api/queries'
import { QueryState } from '../components/QueryState'
import { CIRCLE } from '../config'

export function Onboarding() {
  const members = useMembers()
  return (
    <QueryState query={members} loadingLabel="Memuat anggota">
      {(data) => (
        <p>
          {data.items.length} anggota terdaftar di lingkaran {CIRCLE}.
        </p>
      )}
    </QueryState>
  )
}
