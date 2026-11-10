// Words for the parts of Settings that are about this one device: notifications and
// installing the app. In both languages.

import type { PushType } from '../../data/backend'
import type { PushProblem, PushStatus } from '../../data/push'

// How to lift a block in Chrome on Android. The page shows "Blocked" next to it.
const unblockEn = 'To allow them again in Chrome, tap the icon to the left of the address, then "Permissions", then "Notifications". In the installed app, press and hold its icon and tap "App info", then "Notifications".'
const unblockDe = 'So erlaubst du sie in Chrome wieder: Tippe auf das Symbol links neben der Adresse, dann auf «Berechtigungen», dann auf «Benachrichtigungen». In der installierten App: Symbol gedrückt halten, «App-Info» antippen, dann «Benachrichtigungen».'

export const deviceCopy = {
  en: {
    section: 'This device',
    notifications: {
      row: 'Notifications',
      rowHints: {
        on: 'On for this device.',
        off: 'Off on this device.',
        blocked: 'Blocked in the browser.',
        unconfigured: 'Not set up yet.',
        unsupported: 'Not possible in this browser.',
      } satisfies Record<PushStatus, string>,
      title: 'Notifications',
      heading: 'On this device',
      on: 'On',
      off: 'Off',
      blockedTag: 'Blocked',
      partner: 'your partner',
      leadOff: (partner: string) => `Hear it right away when ${partner} proposes, plans or serves something, hands in a verdict or answers yours. Every device is turned on by itself.`,
      leadOn: (partner: string) => `This device rings when ${partner} proposes, plans or serves something, hands in a verdict or answers yours.`,
      turnOn: 'Turn on notifications',
      turnedOn: 'Notifications turned on',
      turnOff: 'Turn off notifications',
      turnedOff: 'Notifications turned off',
      unconfigured: 'Notifications are not set up for this kitchen yet. There is nothing to do here for now.',
      unsupported: 'This browser cannot show notifications. Open FoodwishUs in Chrome on your phone.',
      blocked: unblockEn,
      problems: {
        dismissed: 'The question was closed without an answer. Tap again and choose "Allow".',
        blocked: unblockEn,
        subscribe_failed: 'The browser could not sign up for notifications. Check the connection and try again.',
        offline: 'No connection. Turning notifications on needs the cloud. Try again when you are online.',
        refused: 'The cloud did not accept this device. Log out, log in again, then try once more.',
      } satisfies Record<PushProblem, string>,
      kindsTitle: 'What to hear about',
      kindsHint: 'Your choice counts for this device only.',
      kinds: {
        proposed: 'A new dish or menu on the wishlist',
        planned: 'A meal is planned',
        served: 'Served, proof needed',
        reviewed: 'A verdict is handed in',
        replied: 'An answer to your verdict',
      } satisfies Record<PushType, string>,
      savedLater: 'Saved on this device. The cloud hears about it when you are back online.',
    },
    install: {
      title: 'Install FoodwishUs',
      ready: 'Put FoodwishUs on your home screen. It opens like any other app, also without a connection.',
      button: 'Install FoodwishUs',
      installed: 'Installed',
      manual: 'To put FoodwishUs on your home screen, open the Chrome menu (the three dots) and tap "Install app" or "Add to Home screen".',
    },
  },
  de: {
    section: 'Dieses Gerät',
    notifications: {
      row: 'Benachrichtigungen',
      rowHints: {
        on: 'Auf diesem Gerät an.',
        off: 'Auf diesem Gerät aus.',
        blocked: 'Im Browser blockiert.',
        unconfigured: 'Noch nicht eingerichtet.',
        unsupported: 'In diesem Browser nicht möglich.',
      },
      title: 'Benachrichtigungen',
      heading: 'Auf diesem Gerät',
      on: 'An',
      off: 'Aus',
      blockedTag: 'Blockiert',
      partner: 'dein Schatz',
      leadOff: (partner: string) => `Erfahre es sofort, wenn ${partner} etwas vorschlägt, einplant oder serviert, ein Urteil abgibt oder auf deins antwortet. Jedes Gerät wird einzeln eingeschaltet.`,
      leadOn: (partner: string) => `Dieses Gerät meldet sich, wenn ${partner} etwas vorschlägt, einplant oder serviert, ein Urteil abgibt oder auf deins antwortet.`,
      turnOn: 'Benachrichtigungen einschalten',
      turnedOn: 'Benachrichtigungen eingeschaltet',
      turnOff: 'Benachrichtigungen ausschalten',
      turnedOff: 'Benachrichtigungen ausgeschaltet',
      unconfigured: 'Benachrichtigungen sind für diese Küche noch nicht eingerichtet. Hier gibt es im Moment nichts zu tun.',
      unsupported: 'Dieser Browser kann keine Benachrichtigungen anzeigen. Öffne FoodwishUs in Chrome auf deinem Handy.',
      blocked: unblockDe,
      problems: {
        dismissed: 'Die Frage wurde ohne Antwort geschlossen. Tippe nochmal und wähle «Zulassen».',
        blocked: unblockDe,
        subscribe_failed: 'Der Browser konnte sich nicht für Benachrichtigungen anmelden. Prüf die Verbindung und versuch es nochmal.',
        offline: 'Keine Verbindung. Zum Einschalten braucht es die Cloud. Versuch es nochmal, sobald du online bist.',
        refused: 'Die Cloud hat dieses Gerät nicht angenommen. Melde dich ab und wieder an, dann versuch es nochmal.',
      },
      kindsTitle: 'Was sich melden darf',
      kindsHint: 'Deine Wahl gilt nur für dieses Gerät.',
      kinds: {
        proposed: 'Neues Gericht oder Menü auf der Wunschliste',
        planned: 'Eine Mahlzeit ist eingeplant',
        served: 'Serviert, Beweisfoto gefragt',
        reviewed: 'Ein Urteil ist abgegeben',
        replied: 'Antwort auf dein Urteil',
      },
      savedLater: 'Auf diesem Gerät gespeichert. Die Cloud erfährt es, sobald du wieder online bist.',
    },
    install: {
      title: 'FoodwishUs installieren',
      ready: 'Hol FoodwishUs auf deinen Startbildschirm. Dann öffnet es sich wie jede andere App, auch ohne Verbindung.',
      button: 'FoodwishUs installieren',
      installed: 'Installiert',
      manual: 'Für FoodwishUs auf dem Startbildschirm: Öffne das Chrome-Menü (die drei Punkte) und tippe auf «App installieren» oder «Zum Startbildschirm hinzufügen».',
    },
  },
}
