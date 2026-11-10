// English copy. German lives in de.ts and must have exactly the same shape.

export const en = {
  brand: { name: 'FoodwishUs', slogan: 'U cook. I eat.' },
  tabs: { today: 'Today', wishlist: 'Wishlist', week: 'Week', cockpit: 'Cockpit', recipes: 'Recipes', add: 'Add a dish or menu' },
  actions: { save: 'Save', cancel: 'Cancel', done: 'Done', served: 'Served', takeProof: 'Take the proof photo', again: 'Again please!', plan: 'Plan it', propose: 'Propose' },
  craving: {
    title: 'How much do you want it?',
    hint: 'Tap a heart',
    levels: ["Only if I'm starving", 'Hmm, maybe', 'Sure, why not', 'Ooh, yes please', 'Feed me this immediately'],
    heart: (n: number) => `${n} of 5 hearts`,
  },
  review: {
    levels: ["Let's never speak of it", 'Not my favorite', 'Solid', 'So good', "Chef's kiss"],
    spoon: (n: number) => `${n} of 5 spoons`,
    sealText: 'EATEN WITH LOVE',
    sealLabel: 'Sealed: eaten with love',
  },
  reactions: {
    title: 'How was it?',
    hint: 'Tap how it tasted',
    levels: ['Kitchen disaster', 'Not my thing', 'Meh', 'Pretty good', 'Yummy', 'Super delicious'],
  },
  photo: { live: 'Live', gallery: 'From gallery' },
  sync: {
    synced: 'All synced',
    syncing: 'Syncing',
    sending: (n: number) => (n === 1 ? '1 change waiting' : `${n} changes waiting`),
    offline: 'Offline. Saved on this phone.',
    error: 'Sync hit a snag',
    lockedOut: 'This phone needs pairing again',
  },
  empty: {
    wishlistTitle: 'The wishlist is empty',
    wishlistBody: 'Time to dream up something delicious.',
    wishlistAction: 'Add the first dish',
  },
  loading: 'Something is cooking',
}

export type Messages = typeof en
