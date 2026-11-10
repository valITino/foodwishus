// A first taste of the real thing: the Today screen, built only from styleguide parts
// and filled with sample content. Milestone 3 replaces this with the live screen.

import { useState } from 'react'
import { quoteOfTheDay } from '../../content/quotes'
import { useLang } from '../../i18n'
import { AwningHeader, Avatar, Button, Card, cx, HeartMeter, Stat, StatusBubble, SyncPill, TabBar, Tag, type TabId } from '../../ui/components'
import { Mascot } from '../../ui/deco/Deco'
import { Icon } from '../../ui/deco/Icon'
import { SamplePlate } from './SamplePlate'

const copy = {
  en: {
    hello: 'Good evening, Leo',
    herStatus: 'Chef mode: on. Bring an appetite.',
    servedTitle: 'Dinner is served',
    servedBody: 'Älplermagronen is on the table. Proof, please.',
    note: 'Extra cheese, just for you',
    from: 'A note from Mia',
    proof: 'Take the proof photo',
    next: 'Up next',
    week: 'meals this week',
    streak: 'in a row',
    days: 'days',
    queue: [
      { dish: 'lasagne' as const, name: 'Lasagne al forno', when: 'Thursday, dinner', craving: 5 },
      { dish: 'rosti' as const, name: 'Rösti with fried egg', when: 'Saturday, lunch', craving: 4 },
      { dish: 'strudel' as const, name: 'Apple strudel', when: 'Not planned yet', craving: 3 },
    ],
    dinner: 'Dinner',
  },
  de: {
    hello: 'Guten Abend, Leo',
    herStatus: 'Kochmodus: an. Bring Hunger mit.',
    servedTitle: 'Es ist angerichtet',
    servedBody: 'Die Älplermagronen stehen auf dem Tisch. Beweisfoto, bitte.',
    note: 'Extra Käse, nur für dich',
    from: 'Eine Notiz von Mia',
    proof: 'Beweisfoto machen',
    next: 'Als Nächstes',
    week: 'Mahlzeiten diese Woche',
    streak: 'in Folge',
    days: 'Tage',
    queue: [
      { dish: 'lasagne' as const, name: 'Lasagne al forno', when: 'Donnerstag, Abendessen', craving: 5 },
      { dish: 'rosti' as const, name: 'Rösti mit Spiegelei', when: 'Samstag, Mittagessen', craving: 4 },
      { dish: 'strudel' as const, name: 'Apfelstrudel', when: 'Noch nicht geplant', craving: 3 },
    ],
    dinner: 'Abendessen',
  },
}

export function TodayPreview({ embedded = false }: { embedded?: boolean }) {
  const lang = useLang()
  const c = copy[lang]
  const [tab, setTab] = useState<TabId>('today')

  return (
    <div className={embedded ? 'relative overflow-hidden rounded-card border border-line' : 'min-h-dvh pb-28'}>
      <div className="gingham bg-ground">
        <AwningHeader title={c.hello} script={quoteOfTheDay(lang)} action={<Avatar avatar="fork" color="sage" name="Leo" size={48} />}>
          <div className="mt-3 flex flex-col items-start gap-3">
            <SyncPill status={{ state: 'idle', pending: 0, uploads: 0 }} />
            <StatusBubble name="Mia" status={c.herStatus} avatar="whisk" color="rose" />
          </div>
        </AwningHeader>

        <main className={cx('app-column flex flex-col gap-5 px-4 pt-5', embedded ? 'pb-16' : 'pb-6')}>
          <Card tone="paper" raised pad={false} className="relative overflow-hidden" style={{ animation: 'soft-pulse 2.4s ease-in-out infinite' }}>
            <div className="flex gap-3 p-4 pb-3">
              <div className="min-w-0 flex-1">
                <Tag tone="butter">
                  <Icon name="clock" size={13} /> {c.dinner}
                </Tag>
                <h2 className="mt-2 text-xl">{c.servedTitle}</h2>
                <p className="mt-1 text-sm text-ink-soft">{c.servedBody}</p>
              </div>
              <Mascot size={74} mood="love" className="-mr-1 shrink-0" />
            </div>
            <div className="mx-4 mb-4 rounded-card bg-blush px-5 py-4 stitched">
              <p className="text-2xs font-extrabold text-ink-soft">{c.from}</p>
              <p className="mt-0.5 font-script text-[1.6rem] leading-tight text-rose-ink">{c.note}</p>
            </div>
            <div className="px-4 pb-5">
              <Button size="lg" block icon={<Icon name="camera" size={22} />}>
                {c.proof}
              </Button>
            </div>
          </Card>

          <section aria-labelledby="next-title">
            <h2 id="next-title" className="mb-2.5 px-1 text-lg">
              {c.next}
            </h2>
            <Card pad={false} className="divide-y divide-line">
              {c.queue.map((item) => (
                <div key={item.name} className="flex items-center gap-3 p-3">
                  <div className="size-14 shrink-0 overflow-hidden rounded-2xl">
                    <SamplePlate dish={item.dish} label={item.name} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-extrabold leading-snug">{item.name}</p>
                    <p className="text-xs text-ink-soft">{item.when}</p>
                  </div>
                  <HeartMeter value={item.craving} size={15} showLabel={false} />
                </div>
              ))}
            </Card>
          </section>

          <Card tone="blush" pad={false} className="grid grid-cols-2 gap-4 px-5 py-4">
            <Stat value={5} label={c.week} />
            <Stat value={4} unit={c.days} label={c.streak} />
          </Card>
        </main>
      </div>
      <TabBar active={tab} onSelect={setTab} onAdd={() => {}} badges={{ today: 1 }} inline={embedded} />
    </div>
  )
}
