// v4: a member's standing as a small badge with the word (never colour alone). It is not a settlement result code, so it carries no 200/202/402/409; the dot takes the
// colour role of the standing (see `.ds-status[data-member]` in src/ds/pages-circle.css). The status text stays as the API says it (lowercase); the CSS capitalises it.
export function MemberBadge({ status }: { status: string }) {
  return (
    <span className="ds-status" data-member={status}>
      {status}
    </span>
  )
}
