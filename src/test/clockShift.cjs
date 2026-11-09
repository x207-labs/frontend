// FE-049: moves the real clock (Date only) of a test run to X207_CLOCK_SHIFT_TO, to prove the tests do not depend on the calendar. Loaded before vitest, so the
// "real" Date that fake timers save and restore is the shifted one too:
//   X207_CLOCK_SHIFT_TO=2026-11-20T00:00:00Z NODE_OPTIONS=--require=./src/test/clockShift.cjs npx vitest run
const target = Date.parse(process.env.X207_CLOCK_SHIFT_TO ?? '')
if (!Number.isNaN(target)) {
  const RealDate = Date
  const offset = target - RealDate.now()
  class ShiftedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [RealDate.now() + offset]))
    }
    static now() {
      return RealDate.now() + offset
    }
  }
  globalThis.Date = ShiftedDate
}
