import type { DemoDish } from '../content'
import { everyday } from './everyday'
import { sweet } from './sweet'
import { swiss } from './swiss'

/** Every recipe card in the demo kitchen. */
export const DEMO_DISHES: readonly DemoDish[] = [...swiss, ...everyday, ...sweet]
