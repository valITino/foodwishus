// Settings and everything behind it.
//
//   /settings                  the Settings page
//   /settings/profile          my profile: name, avatar maker and status line
//   /settings/people           both profiles; the admin's controls for the partner's seat
//   /settings/people/back-in   the one-time code that lets the partner back in
//   /settings/invite           the invite again, while the second seat is free
//   /settings/pin              PIN and devices: change PIN, log out other devices, log out
//   /settings/notifications    notifications on this device, and which kinds
//   /settings/welcome          right after opening a kitchen: you are the admin, then the invite

import { MotionConfig } from 'motion/react'
import type { Route } from '../../app/router'
import { isDemo } from '../../data/app'
import { useMe } from '../../data/hooks'
import { NotificationsPage } from './NotificationsPage'
import { BackInPage, FirstSteps, InvitePage } from './PairingPages'
import { PeoplePage } from './PeoplePage'
import { PinPage } from './PinPage'
import { ProfileEdit } from './ProfileEdit'
import { SettingsHome } from './SettingsHome'

/** These talk to the cloud, and the demo kitchen has none. */
const CLOUD_PAGES = ['/settings/invite', '/settings/people', '/settings/people/back-in', '/settings/pin', '/settings/welcome', '/settings/notifications']
/** Only the admin hands out codes. */
const ADMIN_PAGES = ['/settings/invite', '/settings/people/back-in', '/settings/welcome']

export function SettingsRoutes({ route }: { route: Route }) {
  const me = useMe()
  let path = route.path
  if (isDemo && CLOUD_PAGES.includes(path)) path = '/settings'
  if (ADMIN_PAGES.includes(path) && me?.member && !me.member.isAdmin) path = '/settings/people'

  let page
  switch (path) {
    case '/settings/profile':
      page = <ProfileEdit />
      break
    case '/settings/people':
      page = <PeoplePage />
      break
    case '/settings/people/back-in':
      page = <BackInPage />
      break
    case '/settings/invite':
      page = <InvitePage />
      break
    case '/settings/pin':
      page = <PinPage />
      break
    case '/settings/welcome':
      page = <FirstSteps />
      break
    case '/settings/notifications':
      page = <NotificationsPage />
      break
    default:
      page = <SettingsHome />
  }
  return <MotionConfig reducedMotion="user">{page}</MotionConfig>
}
