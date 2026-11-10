import type { Messages } from './en'

export const de: Messages = {
  brand: { name: 'FoodwishUs', slogan: 'U cook. I eat.' },
  tabs: { today: 'Heute', wishlist: 'Wünsche', week: 'Woche', cockpit: 'Cockpit', recipes: 'Rezepte', add: 'Gericht oder Menü hinzufügen' },
  actions: { save: 'Speichern', cancel: 'Abbrechen', done: 'Fertig', served: 'Serviert', takeProof: 'Beweisfoto machen', again: 'Nochmal bitte!', plan: 'Einplanen', propose: 'Vorschlagen' },
  craving: {
    title: 'Wie sehr willst du es?',
    hint: 'Tippe auf ein Herz',
    levels: ['Nur wenn ich am Verhungern bin', 'Hmm, vielleicht', 'Klar, warum nicht', 'Oh ja, bitte', 'Sofort her damit'],
    heart: (n: number) => `${n} von 5 Herzen`,
  },
  review: {
    levels: ['Reden wir nie wieder darüber', 'Nicht mein Favorit', 'Solide', 'Richtig gut', 'Zum Niederknien'],
    spoon: (n: number) => `${n} von 5 Löffeln`,
    sealText: 'MIT LIEBE GEGESSEN',
    sealLabel: 'Besiegelt: mit Liebe gegessen',
  },
  reactions: {
    title: 'Wie war es?',
    hint: 'Tippe an, wie es geschmeckt hat',
    levels: ['Küchenkatastrophe', 'Nicht meins', 'Naja', 'Ganz gut', 'Lecker', 'Mega fein'],
  },
  photo: { live: 'Live', gallery: 'Aus der Galerie' },
  sync: {
    synced: 'Alles synchron',
    syncing: 'Synchronisiert',
    sending: (n: number) => (n === 1 ? '1 Änderung wartet' : `${n} Änderungen warten`),
    offline: 'Offline. Auf diesem Handy gespeichert.',
    error: 'Sync hakt gerade',
    lockedOut: 'Dieses Handy muss neu gekoppelt werden',
  },
  empty: {
    wishlistTitle: 'Die Wunschliste ist leer',
    wishlistBody: 'Zeit, sich etwas Feines auszudenken.',
    wishlistAction: 'Erstes Gericht hinzufügen',
  },
  loading: 'Da köchelt etwas',
}
