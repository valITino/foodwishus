// Settings and everything behind it.
//
//   /settings            the Settings page
//   /settings/profile    my profile: avatar maker and status line
//   /settings/invite     the invite again, while the partner's seat is free
//   /settings/move       move a profile to a new phone (restore code)
//   /settings/key        a new recovery key
//   /settings/welcome    first steps right after starting a kitchen: recovery key, then invite

import { MotionConfig } from 'motion/react'
import type { Route } from '../../app/router'
import { isDemo } from '../../data/app'
import { FirstSteps, InvitePage, MovePage, NewKeyPage } from './PairingPages'
import { ProfileEdit } from './ProfileEdit'
import { SettingsHome } from './SettingsHome'

/** Pairing talks to the cloud, and the demo kitchen has none. */
const PAIRING_PAGES = ['/settings/invite', '/settings/move', '/settings/key', '/settings/welcome']

export function SettingsRoutes({ route }: { route: Route }) {
  let page
  switch (isDemo && PAIRING_PAGES.includes(route.path) ? '/settings' : route.path) {
    case '/settings/profile':
      page = <ProfileEdit />
      break
    case '/settings/invite':
      page = <InvitePage />
      break
    case '/settings/move':
      page = <MovePage />
      break
    case '/settings/key':
      page = <NewKeyPage />
      break
    case '/settings/welcome':
      page = <FirstSteps />
      break
    default:
      page = <SettingsHome />
  }
  return <MotionConfig reducedMotion="user">{page}</MotionConfig>
}
