// What happened in the demo kitchen: every meal of the last three months, how it was
// rated and what the two of them said about it. The calendar days are picked by the
// seeded generator in history.ts; the stories are written here, so the numbers on the
// cockpit always tell the same tales:
//
//   - Älplermagronen is the clear favourite (most eaten, best rated).
//   - Riz Casimir divides the table: 5, 2, 4, 2.
//   - The first cheese soufflé was a kitchen disaster. The second one rose.
//   - Cravings mostly predict the rating, with a few honest surprises.

import type { ExtraReaction, Reaction, Score5 } from '../types'
import type { Both, DemoMenu, DishKey } from './content'

export type CriterionKey = 'taste' | 'texture' | 'smell' | 'looks' | 'portion' | 'temperature'

/** The six review criteria, in their order on the review sheet: [English, German, icon]. */
export const CRITERIA: readonly (readonly [key: CriterionKey, en: string, de: string, icon: string])[] = [
  ['taste', 'Taste', 'Geschmack', 'tongue'],
  ['texture', 'Texture', 'Konsistenz', 'layers'],
  ['smell', 'Smell', 'Duft', 'steam'],
  ['looks', 'Looks', 'Aussehen', 'sparkle'],
  ['portion', 'Portion', 'Portion', 'plate'],
  ['temperature', 'Temperature', 'Temperatur', 'flame'],
]

export const KITCHEN = {
  name: ['Demo kitchen', 'Demo-Küche'],
  chefStatus: ['Chef mode: on. Bring an appetite.', 'Kochmodus: an. Bring Hunger mit.'],
  tasterStatus: ['Always Huuungryyyyy', 'Immer huuungriiig'],
} as const satisfies Record<string, Both>

export type ChipKey = 'moreSalt' | 'perfect' | 'tooSpicy' | 'keeper'

/** The quick chips on the review sheet. */
export const CHIPS: Record<ChipKey, Both> = {
  moreSalt: ['More salt', 'Mehr Salz'],
  perfect: ['Perfect', 'Perfekt'],
  tooSpicy: ['Too spicy', 'Zu scharf'],
  keeper: ['Recipe keeper', 'Rezept behalten'],
}

export const MENUS: readonly DemoMenu[] = [
  {
    key: 'sundayroast',
    name: ['Sunday roast', 'Sonntagsmenü mit Poulet'],
    description: ['Soup, the big chicken and a slice of tart. Nap included.', 'Suppe, das grosse Poulet und ein Stück Wähe. Mittagsschlaf inbegriffen.'],
    courses: ['kuerbissuppe', 'roastchicken', 'zwetschgenwaehe'],
  },
  {
    key: 'datenight',
    name: ['Date night, Italian style', "Date Night all'italiana"],
    description: ['Three courses, two candles, no phones.', 'Drei Gänge, zwei Kerzen, keine Handys.'],
    courses: ['tomatosoup', 'risotto', 'tiramisu'],
  },
  {
    key: 'chalet',
    name: ['Chalet evening', 'Hüttenabend'],
    description: ['Salad first, so the fondue feels earned.', 'Zuerst Salat, damit man sich das Fondue verdient hat.'],
    courses: ['nuesslisalat', 'fondue', 'schoggimousse'],
  },
  {
    key: 'brunch',
    name: ['Lazy Sunday brunch', 'Fauler Sonntagsbrunch'],
    description: ['Everything on the table at once. Pyjamas welcome.', 'Alles gleichzeitig auf dem Tisch. Pyjama erlaubt.'],
    courses: ['zopf', 'birchermuesli', 'shakshuka', 'heisseschoggi'],
  },
]

/** One time a dish was eaten. Anything left out is filled in by the generator. */
export interface Visit {
  /** Overall rating. */
  o: Score5
  /** How much the Taster wanted it beforehand. Left out: close to the rating. */
  craving?: Score5
  reaction?: Reaction
  /** The Taster's comment. */
  say?: Both
  /** The Chef's answer. */
  reply?: Both
  /** The Chef's note on the proposal. */
  note?: Both
  /** The Taster cooked this one, so the Chef rated it. */
  leoCooks?: boolean
  /** The Taster asked for it ("Again please!"). */
  leoAsked?: boolean
  /** Nudges for single criteria, on top of the overall rating. */
  bias?: Partial<Record<CriterionKey, number>>
  portions?: number
  again?: boolean
  extra?: ExtraReaction[]
  chips?: ChipKey[]
  /** The Chef's own secret rating. */
  self?: Score5
  /** The proof photo shows what went wrong. */
  disaster?: boolean
}

export type Occasion = 'meal' | 'breakfast' | 'treat'

export interface DishStory {
  /** meal: lunch or dinner. treat: the dessert-or-snack slot. */
  at: Occasion
  /** Where it fits best. */
  prefers?: 'lunch' | 'sunday' | 'weekend-evening' | 'weekday'
  /** The part of the three months it shows up in: 0 is the oldest day, 1 is yesterday. */
  season?: readonly [from: number, to: number]
  /** Nudges that hold for every visit of this dish. */
  bias?: Partial<Record<CriterionKey, number>>
  visits: Visit[]
}

export const STORIES: Partial<Record<DishKey, DishStory>> = {
  alplermagronen: {
    at: 'meal',
    bias: { portion: 1 },
    visits: [
      {
        o: 5,
        craving: 5,
        reaction: 6,
        portions: 2,
        note: ['Extra cheese, just for you', 'Extra Käse, nur für dich'],
        say: ['Like a hug from a mountain hut.', 'Wie eine Umarmung aus der Alphütte.'],
        reply: ['I saw you counting the onions. More next time.', 'Ich hab gesehen, wie du die Zwiebeln zählst. Nächstes Mal gibt es mehr.'],
        extra: ['love', 'chef-queen'],
        chips: ['perfect', 'keeper'],
      },
      { o: 5, craving: 5, reaction: 6, portions: 1.5 },
      { o: 5, craving: 4, reaction: 6, leoAsked: true, say: ['I asked for it, I got it, I regret nothing.', 'Gewünscht, bekommen, nichts bereut.'] },
      {
        o: 4,
        craving: 5,
        reaction: 5,
        bias: { looks: -1 },
        say: ['Onions a bit pale today. Still gone in five minutes.', 'Zwiebeln heute etwas blass. Trotzdem in fünf Minuten weg.'],
        reply: ['I was impatient. Guilty.', 'Ich war ungeduldig. Schuldig.'],
        self: 3,
      },
      { o: 5, craving: 5, reaction: 6, portions: 1.5, extra: ['again'] },
      {
        o: 5,
        craving: 5,
        reaction: 6,
        portions: 2,
        note: ['With apple sauce, the way you like it', 'Mit Apfelmus, so wie du es magst'],
        say: ['I would walk up an alp for this.', 'Dafür würde ich auf jede Alp laufen.'],
        reply: ['Good. You carry the cheese next time.', 'Gut. Dann trägst du nächstes Mal den Käse hoch.'],
        extra: ['love', 'again'],
        chips: ['perfect'],
      },
    ],
  },
  lasagne: {
    at: 'meal',
    prefers: 'sunday',
    visits: [
      {
        o: 5,
        craving: 5,
        reaction: 6,
        portions: 1.5,
        say: ['The corner piece is mine. Always.', 'Das Eckstück gehört mir. Immer.'],
        reply: ['It has your name on it.', 'Da steht dein Name drauf.'],
        chips: ['keeper'],
      },
      { o: 4, craving: 5, reaction: 5, bias: { temperature: -1 }, say: ['Burnt my tongue because I could not wait.', 'Zunge verbrannt, weil ich nicht warten konnte.'] },
      { o: 5, craving: 5, reaction: 6, leoAsked: true, portions: 2, extra: ['fire'] },
      { o: 5, craving: 4, reaction: 6, note: ['Sunday project. You grate the Parmesan.', 'Sonntagsprojekt. Du reibst den Parmesan.'], chips: ['perfect'] },
    ],
  },
  geschnetzeltes: {
    at: 'meal',
    visits: [
      {
        o: 5,
        craving: 4,
        reaction: 6,
        say: ['The sauce is so good, I used the Rösti as a sponge.', 'Die Sauce ist so gut, ich habe die Rösti als Schwamm benutzt.'],
        extra: ['chef-queen'],
      },
      { o: 4, craving: 4, reaction: 5, bias: { portion: -1 }, say: ['More sauce next time, please. Much more.', 'Nächstes Mal bitte mehr Sauce. Viel mehr.'], reply: ['Noted, sauce monster.', 'Notiert, du Saucenmonster.'] },
      { o: 5, craving: 5, reaction: 6, note: ['Rösti on the side, obviously', 'Mit Rösti, was sonst'], chips: ['perfect', 'keeper'] },
    ],
  },
  rizcasimir: {
    at: 'meal',
    visits: [
      { o: 5, craving: 3, reaction: 6, note: ['Trust me on this one', 'Vertrau mir bei dem hier'], say: ['Retro and proud. More banana!', 'Retro und stolz darauf. Mehr Banane!'], reply: ['Told you so.', 'Hab ich doch gesagt.'] },
      {
        o: 2,
        craving: 4,
        reaction: 2,
        portions: 0.5,
        again: false,
        say: ['Warm pineapple and I are not friends today.', 'Warme Ananas und ich sind heute keine Freunde.'],
        reply: ['Last time you wanted more banana!', 'Letztes Mal wolltest du mehr Banane!'],
        self: 4,
      },
      { o: 4, craving: 2, reaction: 5, say: ['Okay, the almonds won me back.', 'Okay, die Mandeln haben mich zurückgeholt.'] },
      {
        o: 2,
        craving: 3,
        reaction: 3,
        again: false,
        bias: { taste: -1 },
        say: ['Too sweet for dinner. I said what I said.', 'Zu süss fürs Znacht. Ich bleibe dabei.'],
        reply: ['Noted. The banana stays.', 'Notiert. Die Banane bleibt.'],
        self: 4,
      },
    ],
  },
  kaesesouffle: {
    at: 'meal',
    season: [0.3, 0.85],
    visits: [
      {
        o: 1,
        craving: 4,
        reaction: 1,
        portions: 0.5,
        again: false,
        disaster: true,
        bias: { looks: -1, texture: -1 },
        note: ['New recipe. Be gentle.', 'Neues Rezept. Sei gnädig.'],
        say: ['It sank like my hopes. We ordered pizza.', 'Es fiel zusammen wie meine Hoffnung. Wir haben Pizza bestellt.'],
        reply: ['We never speak of this again.', 'Darüber reden wir nie wieder.'],
        self: 1,
        extra: [],
        chips: [],
      },
      {
        o: 4,
        craving: 2,
        reaction: 5,
        again: true,
        bias: { looks: 1 },
        note: ['Round two. I did not open the oven this time.', 'Zweiter Versuch. Diesmal blieb die Ofentür zu.'],
        say: ['It rose! And so did my respect.', 'Es ist aufgegangen! Mein Respekt auch.'],
        reply: ['Redemption tastes like Gruyère.', 'Wiedergutmachung schmeckt nach Gruyère.'],
        self: 4,
        extra: ['chef-queen'],
      },
    ],
  },
  hoernli: {
    at: 'meal',
    visits: [
      { o: 4, craving: 4, reaction: 5, say: ['Tastes like school holidays.', 'Schmeckt nach Schulferien.'] },
      { o: 5, craving: 4, reaction: 6, portions: 1.5, note: ['Rainy day food', 'Regenwetter-Essen'], chips: ['perfect'] },
    ],
  },
  rosti: {
    at: 'meal',
    prefers: 'lunch',
    visits: [
      { o: 4, craving: 4, reaction: 5, bias: { texture: 1 }, say: ['Crisp outside, soft inside. Just like me.', 'Aussen knusprig, innen weich. Wie ich.'], reply: ['Mostly soft.', 'Vor allem weich.'] },
      { o: 5, craving: 4, reaction: 6, extra: ['fire'] },
    ],
  },
  carbonara: {
    at: 'meal',
    visits: [
      { o: 4, craving: 4, reaction: 5, say: ['Creamy without cream. Witchcraft.', 'Cremig ohne Rahm. Hexerei.'] },
      { o: 4, craving: 5, reaction: 5, bias: { portion: -1 }, note: ['Ready in 20 minutes. No snacking before.', 'In 20 Minuten fertig. Vorher nicht naschen.'], chips: ['moreSalt'] },
    ],
  },
  pizza: {
    at: 'meal',
    prefers: 'weekend-evening',
    visits: [
      { o: 5, craving: 5, reaction: 6, portions: 1.5, say: ['Better than the place on the corner. Do not tell them.', 'Besser als beim Italiener an der Ecke. Sag es ihm nicht.'], extra: ['fire', 'again'] },
      { o: 3, craving: 5, reaction: 4, bias: { texture: -1 }, say: ['A bit soft in the middle. Still pizza.', 'In der Mitte etwas weich. Bleibt trotzdem Pizza.'], reply: ['The oven was not hot enough. My fault.', 'Der Ofen war nicht heiss genug. Mein Fehler.'], self: 3 },
    ],
  },
  risotto: {
    at: 'meal',
    bias: { portion: -1 },
    visits: [
      { o: 4, craving: 3, reaction: 5, say: ['Lovely. But I was hungry again at ten.', 'Fein. Aber um zehn hatte ich wieder Hunger.'], reply: ['You are always hungry again at ten.', 'Du hast um zehn immer wieder Hunger.'] },
      { o: 3, craving: 3, reaction: 4, chips: ['moreSalt'], extra: ['needs-salt'] },
    ],
  },
  fondue: {
    at: 'meal',
    prefers: 'weekend-evening',
    season: [0.62, 1],
    bias: { smell: 1, temperature: 1 },
    visits: [
      { o: 5, craving: 5, reaction: 6, portions: 1.5, leoAsked: true, say: ['Lost my bread twice. Worth it.', 'Zweimal das Brot verloren. Hat sich gelohnt.'], reply: ['Twice means you do the dishes twice.', 'Zweimal heisst: zweimal abwaschen.'], extra: ['love'] },
      { o: 4, craving: 5, reaction: 5, note: ['I found the good Vacherin at the market', 'Ich habe den guten Vacherin auf dem Markt gefunden'] },
    ],
  },
  raclette: {
    at: 'meal',
    prefers: 'weekend-evening',
    season: [0.8, 1],
    visits: [{ o: 4, craving: 4, reaction: 5, portions: 2, say: ['Stopped counting after the eighth little pan.', 'Nach dem achten Pfännli habe ich aufgehört zu zählen.'] }],
  },
  greencurry: {
    at: 'meal',
    visits: [
      {
        o: 3,
        craving: 4,
        reaction: 3,
        bias: { taste: -1 },
        say: ['My tongue is still on fire.', 'Meine Zunge brennt immer noch.'],
        reply: ['Mild paste next time. Promise.', 'Nächstes Mal die milde Paste. Versprochen.'],
        extra: ['too-spicy'],
        chips: ['tooSpicy'],
        self: 4,
      },
      { o: 4, craving: 3, reaction: 5, note: ['One spoon of paste this time, I swear', 'Diesmal nur ein Löffel Paste, ich schwöre'], say: ['I can feel my face again. Much better.', 'Ich spüre mein Gesicht noch. Viel besser.'] },
    ],
  },
  chili: {
    at: 'meal',
    visits: [
      {
        o: 4,
        craving: 3,
        reaction: 5,
        leoCooks: true,
        note: ['I cook tonight. Stay out of the kitchen.', 'Heute koche ich. Bleib aus der Küche.'],
        say: ['Who knew chocolate belongs in chili? You, apparently.', 'Wer hätte gedacht, dass Schokolade ins Chili gehört? Du anscheinend.'],
        reply: ['A chef never reveals his secrets. Except this one.', 'Ein Koch verrät seine Geheimnisse nie. Ausser dieses.'],
        self: 5,
      },
      { o: 5, craving: 4, reaction: 6, leoCooks: true, note: ['My famous chili. Famous to me.', 'Mein berühmtes Chili. Berühmt bei mir.'], say: ['Fine. It is famous now.', 'Na gut. Jetzt ist es berühmt.'], self: 5, extra: ['fire'] },
    ],
  },
  burger: {
    at: 'meal',
    prefers: 'weekend-evening',
    visits: [
      {
        o: 4,
        craving: 4,
        reaction: 5,
        leoCooks: true,
        say: ['Juicy. The kitchen looks like a crime scene though.', 'Saftig. Die Küche sieht aber aus wie ein Tatort.'],
        reply: ['Art needs space.', 'Kunst braucht Platz.'],
        self: 5,
      },
      { o: 3, craving: 5, reaction: 4, leoCooks: true, bias: { texture: -1 }, say: ['Patty a bit too well done. The fries were perfect.', 'Das Fleisch etwas zu durch. Die Frites waren perfekt.'], self: 4 },
    ],
  },
  salmon: {
    at: 'meal',
    bias: { portion: -1 },
    visits: [{ o: 3, craving: 2, reaction: 4, note: ['Something light after all that cheese', 'Etwas Leichtes nach dem ganzen Käse'], say: ['Healthy. Very healthy.', 'Gesund. Sehr gesund.'], reply: ['You will thank me at sixty.', 'Mit sechzig dankst du mir.'] }],
  },
  roastchicken: {
    at: 'meal',
    prefers: 'sunday',
    bias: { smell: 1 },
    visits: [
      { o: 5, craving: 4, reaction: 6, portions: 1.5, say: ['This is how Sunday should always smell.', 'So sollte jeder Sonntag riechen.'], extra: ['love'] },
      { o: 4, craving: 4, reaction: 5, bias: { texture: -1 }, say: ['Breast a little dry, the potatoes made up for it.', 'Die Brust etwas trocken, die Kartoffeln haben es wettgemacht.'], self: 3 },
    ],
  },
  tomatosoup: {
    at: 'meal',
    prefers: 'lunch',
    visits: [{ o: 4, craving: 3, reaction: 5, say: ['The cheese toast did the heavy lifting.', 'Der Käsetoast hat die Hauptarbeit gemacht.'] }],
  },
  kuerbissuppe: {
    at: 'meal',
    prefers: 'lunch',
    season: [0.5, 1],
    visits: [
      {
        o: 5,
        craving: 2,
        reaction: 6,
        note: ['The pumpkin from the balcony has to go', 'Der Kürbis vom Balkon muss weg'],
        say: ['I did not expect to love pumpkin this much.', 'Hätte nie gedacht, dass ich Kürbis so mag.'],
        reply: ['Screenshot taken.', 'Screenshot ist gemacht.'],
        chips: ['keeper'],
      },
      { o: 4, craving: 4, reaction: 5 },
    ],
  },
  nuesslisalat: {
    at: 'meal',
    prefers: 'lunch',
    season: [0.55, 1],
    visits: [{ o: 4, craving: 2, reaction: 4, say: ['A salad I actually finished.', 'Ein Salat, den ich tatsächlich aufgegessen habe.'], reply: ['It was the bacon, I know.', 'Es lag am Speck, ich weiss.'] }],
  },
  chaeschuechli: {
    at: 'meal',
    prefers: 'lunch',
    visits: [{ o: 5, craving: 4, reaction: 6, portions: 2, say: ['Eight were not enough.', 'Acht waren nicht genug.'], chips: ['keeper'] }],
  },
  birchermuesli: {
    at: 'breakfast',
    prefers: 'weekday',
    visits: [
      { o: 4, craving: 2, reaction: 4, say: ['Fresh. I still want bacon.', 'Frisch. Speck will ich trotzdem.'] },
      { o: 3, craving: 3, reaction: 4, bias: { texture: -1 } },
      { o: 4, craving: 3, reaction: 5, note: ['With the last raspberries of the year', 'Mit den letzten Himbeeren des Jahres'] },
    ],
  },
  zopf: {
    at: 'breakfast',
    prefers: 'sunday',
    bias: { smell: 1 },
    visits: [
      { o: 5, craving: 5, reaction: 6, portions: 1.5, say: ['Still warm, butter melting. Perfect Sunday.', 'Noch warm, die Butter schmilzt. Perfekter Sonntag.'], extra: ['love'] },
      { o: 5, craving: 4, reaction: 6, chips: ['perfect'] },
      { o: 4, craving: 5, reaction: 5, bias: { texture: -1 }, say: ['A little dry today. More jam fixed it.', 'Heute etwas trocken. Mehr Konfitüre hat es gerettet.'], self: 3 },
      { o: 5, craving: 5, reaction: 6, portions: 2, note: ['I got up at seven for this', 'Dafür bin ich um sieben aufgestanden'], say: ['You are the best thing about Sundays. The Zopf is second.', 'Du bist das Beste am Sonntag. Der Zopf kommt gleich danach.'], reply: ['Smooth. You still do the dishes.', 'Charmant. Abwaschen musst du trotzdem.'] },
    ],
  },
  pancakes: {
    at: 'breakfast',
    visits: [
      { o: 5, craving: 5, reaction: 6, portions: 1.5, say: ['A stack of happiness.', 'Ein Stapel Glück.'] },
      {
        o: 4,
        craving: 4,
        reaction: 5,
        leoCooks: true,
        note: ['Breakfast in bed. Do not look at the kitchen.', 'Frühstück im Bett. Schau nicht in die Küche.'],
        say: ['The first one was a sacrifice, the rest were lovely.', 'Der erste war ein Opfer, der Rest war wunderbar.'],
        reply: ['The first pancake never counts.', 'Der erste Pancake zählt nie.'],
        self: 4,
      },
    ],
  },
  shakshuka: {
    at: 'breakfast',
    visits: [
      { o: 4, craving: 3, reaction: 5, say: ['Dipping bread into egg yolk is my cardio.', 'Brot ins Eigelb tunken ist mein Sport.'] },
      { o: 4, craving: 4, reaction: 5, chips: ['tooSpicy'], bias: { taste: -1 } },
    ],
  },
  tiramisu: {
    at: 'treat',
    visits: [
      { o: 5, craving: 5, reaction: 6, portions: 1.5, say: ['I licked the dish. No regrets.', 'Ich habe die Form ausgeschleckt. Keine Reue.'], reply: ['I saw. I have a photo.', 'Hab ich gesehen. Ich habe ein Foto.'], extra: ['love'] },
      { o: 4, craving: 5, reaction: 5, say: ['A bit heavy on the amaretto. Hic.', 'Etwas viel Amaretto. Hicks.'] },
    ],
  },
  zwetschgenwaehe: {
    at: 'treat',
    season: [0.05, 0.6],
    visits: [
      { o: 4, craving: 3, reaction: 5, say: ['Grandma level.', 'Grosi-Niveau.'] },
      { o: 5, craving: 4, reaction: 6, note: ["The plums from your parents' tree", 'Die Zwetschgen vom Baum deiner Eltern'], chips: ['keeper'] },
    ],
  },
  schoggimousse: {
    at: 'treat',
    visits: [{ o: 5, craving: 5, reaction: 6, say: ['Clouds, but chocolate.', 'Wolken, aber aus Schokolade.'], extra: ['love', 'again'] }],
  },
  rueblitorte: {
    at: 'treat',
    visits: [{ o: 4, craving: 3, reaction: 5, say: ['Counts as a vegetable, right?', 'Zählt als Gemüse, oder?'], reply: ['Absolutely. Have another slice of vegetable.', 'Absolut. Nimm noch ein Stück Gemüse.'] }],
  },
  heisseschoggi: {
    at: 'treat',
    season: [0.75, 1],
    visits: [{ o: 5, craving: 4, reaction: 6, say: ['Winter can come now.', 'Jetzt darf der Winter kommen.'] }],
  },
  eistee: {
    at: 'treat',
    season: [0, 0.25],
    visits: [{ o: 4, craving: 3, reaction: 5, bias: { temperature: 1 } }],
  },
}

/** Notes Mia adds when nothing more specific is written. */
export const SPARE_NOTES: readonly Both[] = [
  ['Bring an appetite', 'Bring Hunger mit'],
  ['Double portion, I know you', 'Doppelte Portion, ich kenne dich doch'],
  ['Your turn to set the table', 'Du bist dran mit Tischdecken'],
  ['Made with love and too much butter', 'Mit Liebe und zu viel Butter gemacht'],
  ['Wear something stain-proof', 'Zieh etwas an, das Flecken verträgt'],
  ['I promise nothing burns this time', 'Versprochen, diesmal brennt nichts an'],
]

/** Things he says when the story has no line for this meal. Picked by rating. */
export const SPARE_COMMENTS: Record<'high' | 'mid', readonly Both[]> = {
  high: [
    ['Plate licked clean.', 'Teller sauber geleckt.'],
    ['Seconds were not optional.', 'Nachschlag war Pflicht.'],
    ['Ten out of five.', 'Zehn von fünf.'],
    ['I would propose to this plate.', 'Diesem Teller würde ich einen Antrag machen.'],
  ],
  mid: [
    ['Good, not legendary.', 'Gut, aber nicht legendär.'],
    ['Would eat again, would not dream of it.', 'Würde ich wieder essen, aber nicht davon träumen.'],
    ['Needed a bit more of something.', 'Da fehlte noch ein bisschen etwas.'],
  ],
}

export const SPARE_REPLIES: readonly Both[] = [
  ['That is what I like to hear.', 'Das höre ich gern.'],
  ['You are easy to please. Keep it that way.', 'Du bist leicht glücklich zu machen. Bleib so.'],
  ['Thank you, my favourite critic.', 'Danke, mein Lieblingskritiker.'],
]

export interface Skip {
  dish?: DishKey
  menu?: DemoMenu['key']
  slot: 'dinner' | 'lunch' | 'breakfast'
  /** Skipped straight from the wishlist, never planned. */
  unplanned?: boolean
  /** The part of the three months it happened in: 0 is the oldest day, 1 is yesterday. */
  when?: readonly [from: number, to: number]
  craving?: Score5
  reason: Both
}

/** Meals that did not happen. The first one sits on the day before the current streak. */
export const SKIPS: readonly Skip[] = [
  { dish: 'carbonara', slot: 'dinner', craving: 4, reason: ['Ate out with friends', 'Auswärts gegessen mit Freunden'] },
  { dish: 'risotto', slot: 'dinner', craving: 3, reason: ['Not hungry after the late lunch', 'Kein Hunger nach dem späten Zmittag'] },
  { dish: 'fondue', slot: 'dinner', craving: 5, when: [0.65, 0.9], reason: ['No Vacherin left at the shop', 'Kein Vacherin mehr im Laden'] },
  { dish: 'hoernli', slot: 'dinner', craving: 4, reason: ['Too tired to cook, ordered pizza', 'Zu müde zum Kochen, Pizza bestellt'] },
  { menu: 'datenight', slot: 'dinner', craving: 5, reason: ['Went out for dinner instead', 'Stattdessen auswärts essen gegangen'] },
  { dish: 'birchermuesli', slot: 'breakfast', craving: 2, reason: ['Overslept, coffee only', 'Verschlafen, nur Kaffee'] },
  { dish: 'eistee', slot: 'lunch', unplanned: true, when: [0.4, 0.6], reason: ['Summer is over', 'Der Sommer ist vorbei'] },
]

export interface Wish {
  dish?: DishKey
  menu?: DemoMenu['key']
  craving?: Score5
  note?: Both
  leoAsked?: boolean
  /** Suggest the next weekend. */
  weekend?: boolean
}

/** Today's dinner. */
export const TONIGHT: Wish = { dish: 'geschnetzeltes', craving: 5, note: ['Rösti on the side, obviously', 'Mit Rösti, was sonst'] }

/** The coming week. Each lands on its weekday within the next seven days. */
export const COMING_UP: readonly (Wish & { on: 'first-weekday' | 'last-weekday' | 'friday' | 'saturday' | 'sunday'; slot: 'breakfast' | 'dinner' })[] = [
  { on: 'first-weekday', slot: 'dinner', dish: 'carbonara', craving: 4 },
  { on: 'last-weekday', slot: 'dinner', dish: 'hoernli', craving: 4, note: ['With apple sauce, the way you like it', 'Mit Apfelmus, so wie du es magst'] },
  { on: 'friday', slot: 'dinner', dish: 'pizza', craving: 5, note: ['Friday is pizza day. I do not make the rules.', 'Freitag ist Pizzatag. Die Regeln mache nicht ich.'] },
  { on: 'saturday', slot: 'breakfast', dish: 'pancakes' },
  { on: 'sunday', slot: 'dinner', menu: 'sundayroast', craving: 5, note: ['Three courses. Wear the comfy trousers.', 'Drei Gänge. Zieh die bequeme Hose an.'] },
]

/** The wishlist, in his order: what he wants most on top, new ideas at the bottom. */
export const WISHLIST: readonly Wish[] = [
  { dish: 'alplermagronen', craving: 5, leoAsked: true },
  { dish: 'lasagne', craving: 5, note: ['Sunday project. You grate the Parmesan.', 'Sonntagsprojekt. Du reibst den Parmesan.'] },
  { menu: 'datenight', craving: 4, weekend: true, note: ['Candles, no phones. Except for the proof photo.', 'Kerzen, keine Handys. Ausser fürs Beweisfoto.'] },
  { dish: 'schoggimousse', craving: 4, note: ['For when the week was long', 'Für nach einer langen Woche'] },
  { dish: 'rizcasimir', craving: 2, note: ['One more chance? Less banana, I promise.', 'Noch eine Chance? Weniger Banane, versprochen.'] },
  { dish: 'kuerbissuppe', note: ['The market had the pretty orange ones again', 'Auf dem Markt gab es wieder die schönen orangen'] },
  { dish: 'rueblitorte', weekend: true, note: ["Shall I bake this for your mum's visit?", 'Soll ich die für den Besuch deiner Mama backen?'] },
  { dish: 'salmon' },
]
