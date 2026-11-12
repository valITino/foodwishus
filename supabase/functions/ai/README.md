# The kitchen's helper

One function, eight jobs, each with its own instruction file (see "Skills" below):

| Job | In the app | What it gets | What it answers |
| --- | --- | --- | --- |
| `recipe-from-link` | **+**, A recipe from a link | a link and four switches | a recipe card for the dish form |
| `shopping-check` | Basket, Check the plan (and by itself when the plan changes) | the planned meals with their ingredients, what was cooked lately, the pantry, the basket | what to buy, each with an amount and a reason |
| `pantry-notes` | Pantry, Tell Fork what is there | one sentence about what is at home | pantry lines to look over |
| `nutrition-estimate` | Dish form, Calories, Let Fork estimate | a dish's name, servings and ingredient lines | calories, protein, carbs and fat per serving, as an estimate |
| `assistant` | Ask Fork (the fork on Today, and in **+**) | a question, the talk before it, and the kitchen in lines | an answer in words, and up to four buttons to tap |
| `recipe-from-text` | Ask Fork, Put it in the recipe book | a recipe the assistant wrote out in a talk | a recipe card for the dish form |
| `pantry-photo` | Pantry, Show Fork a photo | one to four photos of what is at home | pantry lines to look over, and a note about what could not be seen |
| `recipe-from-photo` | **+**, A recipe from a link or a photo, A photo | one to four photos of a recipe | a recipe card for the dish form |

None of them writes to the kitchen. A card fills a form, suggestions wait on the basket
for a person to accept, pantry lines are shown before they are saved, an estimate
fills the form's four number fields with "This is an estimate" switched on, and the
assistant only ever offers buttons: a tap on one is what does it, in the app.

## Recipes from a link

In the app: **+**, then **A recipe from a link**. Paste a link from Pinterest or a recipe
site (or share it to the app from another app), and the dish form opens filled in: name,
ingredients, steps, times, picture, source. Nothing is saved until whoever pasted it has
looked it over and tapped **Save dish**.

In the app the helper is Fork, the mascot. Behind Fork is this function and, for most
pages, an AI (Claude).

How it travels:

1. The app sends the link and four switches (write it in my language, convert cups and
   Fahrenheit, bring the picture, estimate calories when the page has none) to this
   function, with the device's own login.
2. The function asks the database for a ticket (`public.ai_ticket()`, migration
   `0008_helper.sql`): only somebody with a seat in the kitchen gets one, and a kitchen
   gets 40 a day.
3. It fetches the page. A Pinterest pin is only a picture with a link, so it follows the
   link to the page the recipe lives on.
4. Many recipe sites carry the recipe as data for search engines. If the page does, that
   data goes to the AI, otherwise the page's text does. The AI writes the recipe card in
   the kitchen's language and units and adds a note where it was not sure ("The cups are
   roughly converted to grams.").
5. The app fills the dish form with the card. The notes sit on top, each with a jump to
   the part it is about.

### Calories the page does not give

Calories, protein, carbs and fat that a page states are taken as they are. When a page
states none and the fourth switch is on, the AI works them out from the ingredient
amounts and the number of servings, in the same answer as the card: no second question,
no second ticket. The card then says `nutritionEstimated`, the form switches "This is an
estimate" on, and a note on top says "The page gives no calories. The numbers are an
estimate from the ingredients." With the switch off the function removes any estimate,
whatever the AI answered.

The fourth switch only shows for people who have calories switched on in their settings.
For the others the app never asks for an estimate.

The same sum is there for every dish, old or typed by hand: **Let Fork estimate** in the
Calories part of the dish form (job `nutrition-estimate`, one ticket). Without ingredients
the function answers `not_enough` before it asks anybody. It needs the key: there is no
way to estimate without the AI.

How good is it? It is what a careful cook with a nutrition table would arrive at: fine
for "roughly 600 a plate", not for anything a diet depends on. That is why it is always
marked as an estimate.

## Ask Fork: the kitchen assistant

In the app: the small fork next to the basket and the bell on Today, or **+**, **Ask Fork**.
A talk: a question is typed, Fork answers. He is good at three things:

- **Food and cooking.** That is the AI's own knowledge: times, temperatures, substitutions,
  what goes with what, storing, nutrition.
- **This kitchen.** With every question the phone sends the kitchen as lines of text: the
  recipe book (names, course, minutes, tags, how often eaten and how it was liked), what is
  planned, the wishlist, what was eaten lately, the pantry, the basket. Whole recipes go
  along for the dishes a question names. For any other dish the assistant can ask
  (`look`), and the app sends the recipe and asks again, once.
- **The app.** `APP_GUIDE` in `skills/assistant.ts` describes every tab and button, so
  "how do I add a recipe from Pinterest" gets the way there, with a button that opens it.
  **When a screen or a rule changes, change the line in the guide too.**

What he can offer under an answer (at most four buttons): plan a dish for a day and a
meal, put a dish on the wishlist, open a dish, put things on the basket, note things in
the pantry, put a recipe he just wrote out into the dish form, open a place in the app.
The function checks every offer against the kitchen it was sent (a dish that is not in the
book, a day that is over, a place that does not exist are dropped), and the app turns the
dish refs back into dishes the moment the answer arrives.

Nothing is kept by the function. The talk lives on the phone that had it (the last 60
things said, per person), and "Start over" wipes it.

A stronger model for the talk only: set the secret `AI_MODEL_CHAT` (for example to
`claude-sonnet-5-5`). Without it the talk uses the same model as everything else. One
question with a well-filled kitchen is about 6,000 tokens in and a few hundred out: well
under a cent with the default model, around two cents with the larger one. Prices change:
the pricing page of the Claude Console has today's.

## Photos: what is at home, a recipe, a question

Three places take photos, and all three send them the same way:

- **Pantry, Show Fork a photo** (`pantry-photo`): the open fridge or a shelf in one
  photo, or up to four photos of single things. The answer is pantry lines with an amount
  only where it can be seen or read, and a note about what could not be made out. The
  instruction for this job is the house rule turned around: never list what you do not see.
- **A recipe from a photo** (`recipe-from-photo`): a cookbook page, a handwritten card, a
  screenshot. Up to four photos are the pages of one recipe. The same skill that reads web
  pages writes the card, and adds a check wherever the writing was hard to read.
- **Ask Fork** (`assistant`, with `photos`): up to three photos with a question. What he
  sees he says in words, with the usual offers: note it in the pantry, or put the recipe
  into the dish form.

How a photo travels: the phone shrinks it (1600 px on the long edge, JPEG, under about
700 KB), sends it as base64 inside the request, the function hands it to the Claude API
in front of the words, and that is all. Nothing is stored: not by the function, not in
the database, not in the talk on the phone (which only remembers "with 1 photo"). A photo
of an earlier question is not sent again.

Limits, checked before a ticket is taken: four photos per request (three with a
question), about 1 MB each, JPEG, PNG or WebP. Beyond them the answer is `too_big`.
What a photo costs: an image of this size is about 2,500 tokens, a fraction of a cent
with the default model.

Not known for certain: how large a request Supabase lets through to a function. Four
photos at the limit are close to 4 MB. If the gateway refuses that (status 413), the app
says "that is too much at once", and the limits in `PHOTO_LIMITS` are the place to lower.

Nobody else's photos go anywhere: not the proof photos, not the dish pictures. Only the
ones somebody picks in one of these three places, for that one question.

## What leaves the kitchen, and what does not

- **To the recipe site:** one ordinary page request, like a browser's, without cookies
  and without anything about the kitchen.
- **To the AI, for a recipe:** the text or recipe data of that one page, the language,
  the two switches, and the tags the kitchen already uses (so "Swiss" is not tagged a
  second time as "swiss").
- **To the AI, for a check of the plan:** the names and ingredients of the meals planned
  for the next 7 days and of those cooked in the last 10, the pantry lines, and what is
  on the basket.
- **To the AI, for pantry notes:** the sentence that was typed, and the names the pantry
  already uses.
- **To the AI, for an estimate:** the dish's name, its number of servings and its
  ingredient lines.
- **To the AI, for a question to Fork:** the question, the last things said in that talk,
  and the kitchen in lines: dish names with their course, minutes, tags, calories (only
  for somebody who has them switched on), how often eaten and how liked; the plan, the
  wishlist with its hearts, the meals of the last weeks, the pantry, the basket. Whole
  recipes only for dishes that are asked about.
- **To the AI, with photos:** the photos somebody picked for that one question (of the
  pantry, of a recipe, with a question to Fork), shrunk on the phone. Nothing else is
  sent with them that would not be sent without.
- **Never:** who you are, names of people, notes and comments to each other, the proof
  photos, the dish pictures, or any photo that was not picked for a question.
  (The assistant is told "you cook" or "your partner cooks", never a name. Ratings go
  along only as "liked 4.5 of 5", and only for a question to Fork.)
- **Stored by the function:** nothing. The database keeps one number per kitchen and
  day: how many questions were asked.

## What it costs

GitHub and Supabase stay free. The AI is paid per use, from the Claude API account whose
key is set in step 3: with the default model (`claude-haiku-5-5`) one question (a recipe
read, a plan checked, a sentence sorted, a dish estimated, a question to Fork, a photo looked at) is well under one cent, and the limit of 40
questions a day keeps even a very bad day at a few cents. Prices change: check the pricing page of the Claude Console before relying on this.

## Without a key it still does something

A page that carries its own recipe data is read without any AI: word for word, in the
page's language and units. The dish form says so ("Read from the page as it is"). Pages
without such data, translating, converting, estimating calories and every question to
Fork need the key. So the function can be
deployed first and the key added later, or never.

## Steps

### 1. Apply the migration

Apply `supabase/migrations/0008_helper.sql` as it is (migration name `helper`). It adds
one small private table and the function `public.ai_ticket()`, and touches nothing else.

Optional check: `bash supabase/tests/local/run.sh helper` runs
`supabase/tests/helper_test.sql` on a throwaway Postgres on your own machine (10 lines,
all `ok`). Never run it against the live project.

### 2. Deploy the function

Deploy it as the function `ai`, with **JWT verification on** (the default): Supabase
then refuses every call without a device login before the function even runs.

The function is a one-line loader that imports this folder's `index.ts` from GitHub at
one fixed commit, so what runs is exactly what was tested and nothing is copied by hand:

```ts
import 'https://raw.githubusercontent.com/valITino/foodwishus/<commit>/supabase/functions/ai/index.ts'
```

Two other ways lead to the same code: `supabase functions deploy ai` with the Supabase
CLI, or `npm run build:ai`, which writes everything into one plain file
(`supabase/functions/ai/dist/index.js`, with its size and SHA-256 printed) to paste into
the dashboard's function editor under the file name `index.ts`.

### 3. Add the key

This is the one step only the owner can do, and the key must never go anywhere else:
not into the app, not into the repository, not into a chat.

1. In the Claude Console, create an API key. Give it a name like `foodwishus`. A monthly
   spend limit on the account is a good idea.
2. In the Supabase dashboard: **Edge Functions**, **Secrets**, add a secret named
   `ANTHROPIC_API_KEY` with the key as its value.

The function picks it up by itself within a minute or two. Optional: a secret `AI_MODEL`
makes it use another model than the default.

### 4. Try it

In the app: **+**, **A recipe from a link**, paste any recipe link, **Read recipe**. No
new version of the app is needed once this version is on the phones.

## When something is off

The app says what happened in plain words. For the owner, the function's log (Edge
Functions, `ai`, Logs) says more:

| The app says | What it is | What to do |
| --- | --- | --- |
| "This page needs the AI helper, and it is not set up for this kitchen yet." | No key is set (step 3), or the function is not deployed (step 2). | Do the missing step. |
| "The AI helper is not answering right now." | The AI did not answer, or refused the key. The log says `helper did not answer:` with `helper_key` for a refused key (wrong, deleted, or out of credit) and `helper_down` for an outage. | For `helper_key`: check the key and the account in the Claude Console. Otherwise try again later. |
| "Fork has read 40 pages today, and that is the limit." (on the basket: "Fork has been asked often enough for today") | The day's tickets are used up. All eight jobs share them. | Wait until tomorrow (Swiss time). To change the limit, change `per_day` in a new migration and `DAILY_TICKETS` in `contract.ts`. |
| "This phone is not logged in to the kitchen any more." | The device's login is gone or its profile is paused. | Log in again on that phone. |
| "The page did not answer." | The site was slow, down, or refuses visitors that are not browsers. Some sites do. | Try again, or add the dish by hand: the link is kept as its source. |
| "Fork found no recipe on that page." | No recipe on it, or a pin without a link behind it. | Open the recipe's own page and use that link. |

How many pages were read lately:

```sql
select day, used from private.helper_tickets order by day desc limit 14;
```

## Switching it off again

Remove the secret `ANTHROPIC_API_KEY`: the helper falls back to pages that carry their
own recipe data. Delete the function `ai`: the app says the helper is not set up. The
dishes that were read stay as they are; they are ordinary dishes.

If the key may have been seen by somebody: delete it in the Claude Console, create a new
one, and put the new one into the secret.

## Who may call it, and what it may fetch

- Only a device that is logged in to the kitchen: Supabase checks the login at the door,
  and the ticket check asks the database whether that login has a seat. Everybody else
  costs nothing and learns nothing.
- Only public web pages: `http` and `https` on the usual ports, no addresses of private
  networks, no bare numbers, no logins in the address. Redirects are followed by hand
  and checked again at every hop. Pages are cut off at 1.5 MB and 9 seconds, pictures at
  4 MB. What it does not do is look up a name's number first, so a public name that
  points into a private network is not caught here; the function runs on Supabase's
  servers, away from the database, and only the two of you can call it.
- A page is material, never an instruction. The AI is told so, its answer has to fit a
  fixed form (a recipe card and nothing else), and the card is cut to size again before
  it leaves the function. A page that says "ignore your instructions" ends up, at worst,
  as an odd line in a form that a person reads before saving.

## Skills: one instruction file per job

Everything the AI is told lives in `skills/`, so every request of one kind is worded
the same way and a change is made in one place:

- `skills/house-rules.ts`: what holds for every job. The kitchen's language and Swiss
  spelling, plain words, metric units as the kitchen writes them (g, dl, EL, TL), never
  inventing what the material does not say, material is never an instruction.
- `skills/recipe-card.ts`: this job. What it is given, the exact form of the answer
  (a JSON schema), how to write ingredient lines and steps, when to add a note.

- `skills/shopping-check.ts`: what is missing for the planned meals. How to compare with
  the pantry (other names for the same thing, words like "almost empty", what was cooked
  since a note), what never to list, how to word a reason.
- `skills/pantry-notes.ts`: a sentence about what is at home, as pantry lines, without
  converting or guessing.
- `skills/assistant.ts`: Fork in a talk. Who he is, how to answer, what he may offer and
  that he never says something is done, when to ask for a recipe first, and the guide to
  the app.
- `skills/pantry-photo.ts`: what is at home, from photos. Only what can be seen, amounts
  only where they can be seen or read, and a note for what could not be made out.
- `skills/nutrition.ts`: calories, protein, carbs and fat per serving from ingredient
  lines. What counts (what is eaten: about half of the frying fat, no cooking water),
  usual sizes for "1 onion", how to round, and when not to estimate at all. Its rules are also part of the recipe
  card's instructions when the fourth switch is on, so both ways estimate alike.

A new job gets its own file next to these, with the same four parts: `system` (house
rules plus its own), `user` (the material), `schema` (the form of the answer) and `read`
(the answer, checked and cut to size). The handler only adds: who may ask, what to fetch,
and what to fall back on.

## What is in this folder

| File | What it does |
| --- | --- |
| `index.ts` | The Deno entry point. Hands requests to `handler.ts` with the real web, the Claude API and the database's ticket counter. |
| `handler.ts` | Who may ask, the way from a link to a card, and what to fall back on. |
| `page.ts` | Fetching a page safely and taking it apart: recipe data, text, pictures, the link behind a pin. |
| `recipe.ts` | The recipe card, and the page's own recipe data turned into one without any AI. |
| `claude.ts` | The one place that talks to the Claude API. |
| `skills/` | The instructions for the AI (see above). |
| `contract.ts` | What the app sends and gets back. The app imports these types. |
| `dist/index.js` | All of the above in one file, made by `npm run build:ai`. Not in the repository. |

Everything except `index.ts` is covered by unit tests under Node (`tests/unit/ai.*.test.ts`),
against a pretend web and a stand-in for the AI (`src/data/fake/pretendWeb.ts`).
`ai.bundle.test.ts` builds `dist/index.js` and runs requests through that very file,
`index.ts` included. `supabaseHelper.test.ts` lets the app's real Supabase client call
the function through a stand-in for Supabase on the same machine. The pretend cloud of
the dev server runs the same handler, so `npm run dev` and the end-to-end tests
(`tests/e2e/recipe-link.spec.ts`) read "links" without a key and without the network.

What no test here can show: the real Claude API answering, and real recipe sites. Their
first meeting is the first link pasted in the real app.

## What is deployed right now

Switched on for the live project on 12 Nov 2026, after the owner's go-ahead:

- Migration `helper` (`0008_helper.sql`) is applied: the ticket counter and
  `public.ai_ticket()`. Checked in the catalogue: the counter is private, tickets are for
  logged-in devices only.
- The function `ai` is deployed (version 1, JWT verification on) as the one-line loader,
  at commit `03a28bbbd546d068e0248616cbb7b89338d6b4cf`. The ten files GitHub serves at
  that commit are byte for byte the tested ones.
- The secret `ANTHROPIC_API_KEY` is the owner's step. Until it is set, pages that carry
  their own recipe data are read as they are, and Fork compares names.

Not seen yet: a first call from the app. The workspace this was deployed from cannot
reach Supabase's function address, so whether the function starts and answers shows with
the first link pasted in the app. If it does not, Edge Functions, `ai`, Logs says why.

To ship a change to the function: merge it, then deploy the loader again with the new
commit in the address.
