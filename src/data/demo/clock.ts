// Wall-clock times in the kitchen's time zone, for writing the demo's history:
// "that Saturday at 19:40 in Zurich". The helpers live with the other date code.

export { zurichIso, zurichMinutes, zurichMoment } from '../../lib/dates'

export const hm = (hours: number, minutes = 0): number => hours * 60 + minutes
