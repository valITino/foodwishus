// Serve, proof and review: the Taster's flow from photo to wax seal, the Chef's answer,
// and the photo wall. The Shell mounts ReviewRoutes; the meal page and Today use the parts.

import { MotionConfig } from 'motion/react'
import { matchPath, type Route } from '../../app/router'
import { PhotoWallScreen } from './PhotoWall'
import { ReviewFlowScreen } from './ReviewFlow'

export { EarlyProof, MealReview, ProofCard } from './MealReview'
export { EatenToday, PhotoWallCard } from './TodayParts'

/** True for the addresses this feature answers: the flow and the photo wall. */
export function isReviewPath(path: string): boolean {
  return path === '/photos' || matchPath('/review/:id', path) !== null
}

/** Bounces and stamps are decoration: skip them for people who asked for less motion. */
export function ReviewRoutes({ route }: { route: Route }) {
  const flow = matchPath('/review/:id', route.path)
  return <MotionConfig reducedMotion="user">{flow ? <ReviewFlowScreen key={flow.id} id={flow.id} /> : <PhotoWallScreen />}</MotionConfig>
}
