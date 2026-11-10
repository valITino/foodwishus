// The criteria profile: a radar with one spoke per criterion, for all dishes or one
// dish, with a second dish to compare. The table underneath says every value in
// plain numbers, with how many ratings went in.

import { useMemo, useState, type ReactNode } from 'react'
import type { ID } from '../../../data/types'
import { criteriaProfile } from '../../../lib/stats'
import { Button } from '../../../ui/components'
import { BLUSH, ChartCard, INK, LINE_STRONG, ROSE_EDGE, SURFACE } from '../charts/base'
import { Radar, type RadarShape } from '../charts/Radar'
import { PickSheet, SelectButton, Thumb, type PickOption, type SectionProps } from '../parts'

type Profile = ReturnType<typeof criteriaProfile>

const ALL = 'all'
const NOTHING = 'nothing'

function Marker({ look }: { look: RadarShape['look'] }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
      {look === 'context' && <rect x="1.5" y="3" width="11" height="8" rx="2" fill={BLUSH} stroke={LINE_STRONG} />}
      {look === 'first' && <circle cx="7" cy="7" r="4.5" fill={ROSE_EDGE} stroke={SURFACE} strokeWidth="1.5" />}
      {look === 'second' && <rect x="2.75" y="2.75" width="8.5" height="8.5" rx="1.5" fill={INK} stroke={SURFACE} strokeWidth="1.5" />}
    </svg>
  )
}

export function CriteriaChart({ kitchen, sel, w }: SectionProps) {
  const c = w.c.criteria
  const [first, setFirst] = useState<ID | null>(null)
  const [second, setSecond] = useState<ID | null>(null)
  const [choosing, setChoosing] = useState<'first' | 'second' | null>(null)

  // Dishes that have at least one criterion rated in this selection, by name.
  const rated = useMemo(
    () =>
      [...sel.stats.values()]
        .filter((stats) => Object.keys(stats.criteria).length > 0)
        .sort((a, b) => w.dishName(a.dishId).localeCompare(w.dishName(b.dishId), w.lang)),
    [sel.stats, w],
  )
  const ids = useMemo(() => new Set(rated.map((stats) => stats.dishId)), [rated])
  // A dish that the filter has taken away falls back to "all dishes" and "nothing".
  const a = first && ids.has(first) ? first : null
  const b = second && ids.has(second) && second !== a ? second : null

  const all = useMemo(() => criteriaProfile(sel.meals, kitchen.criteria), [sel.meals, kitchen.criteria])
  const forA = useMemo(() => (a ? criteriaProfile(sel.meals, kitchen.criteria, a) : null), [sel.meals, kitchen.criteria, a])
  const forB = useMemo(() => (b ? criteriaProfile(sel.meals, kitchen.criteria, b) : null), [sel.meals, kitchen.criteria, b])

  if (all.length === 0 || all.every((row) => row.value === null)) return <ChartCard id="criteria" title={c.title} empty={c.empty} />

  // With one dish picked, "all dishes" steps back and becomes the soft shape behind.
  const columns: { key: string; name: string; look: RadarShape['look']; profile: Profile }[] = []
  if (forA && a) {
    columns.push({ key: 'all', name: c.allDishes, look: 'context', profile: all })
    columns.push({ key: a, name: w.dishName(a), look: 'first', profile: forA })
  } else {
    columns.push({ key: 'all', name: c.allDishes, look: 'first', profile: all })
  }
  if (forB && b) columns.push({ key: b, name: w.dishName(b), look: 'second', profile: forB })

  const shapes: RadarShape[] = columns.map((column) => ({ key: column.key, look: column.look, values: column.profile.map((row) => row.value?.mean ?? null) }))
  const summary = columns
    .map((column) => c.summary(column.name, column.profile.map((row) => `${row.label} ${row.value ? w.f.one(row.value.mean) : c.notRated}`).join(', ')))
    .join(' ')

  const dishOptions: PickOption[] = rated.map((stats) => ({
    id: stats.dishId,
    label: w.dishName(stats.dishId),
    note: stats.average ? w.c.shared.fromRatings(w.f.one(stats.average.mean), stats.average.n) : undefined,
    lead: <Thumb dish={kitchen.dishes.get(stats.dishId)} id={stats.dishId} />,
  }))
  const options: PickOption[] =
    choosing === 'first' ? [{ id: ALL, label: c.allDishes }, ...dishOptions] : [{ id: NOTHING, label: c.nothing }, ...dishOptions.filter((option) => option.id !== a)]

  const cell = (profile: Profile, i: number): ReactNode => {
    const value = profile[i].value
    if (!value) return <span className="text-ink-soft">{c.notRated}</span>
    return (
      <>
        <span className="font-extrabold">{w.f.one(value.mean)}</span> <span className="text-2xs text-ink-soft">{value.n}</span>
      </>
    )
  }

  return (
    <ChartCard id="criteria" title={c.title}>
      <div className="grid grid-cols-2 gap-2 px-4 pt-3">
        <SelectButton label={c.show} value={a ? w.dishName(a) : c.allDishes} onClick={() => setChoosing('first')} />
        <SelectButton label={c.compare} value={b ? w.dishName(b) : c.nothing} onClick={() => setChoosing('second')} />
      </div>
      {!a && !b && rated.length >= 2 && (
        <div className="px-1 pt-1">
          <Button
            variant="quiet"
            onClick={() => {
              // Start with the two dishes eaten most often: the comparison people ask for first.
              const [one, two] = [...rated].sort((x, y) => y.timesEaten - x.timesEaten || y.lastEaten.localeCompare(x.lastEaten))
              setFirst(one.dishId)
              setSecond(two.dishId)
            }}
          >
            {c.compareTwo}
          </Button>
        </div>
      )}

      {all.length >= 3 && (
        <div className="pt-2">
          <Radar label={summary} spokes={all.map((row) => row.label)} shapes={shapes} />
        </div>
      )}

      {/* Each shape with its marker and full name: the key to the radar and to the table. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 pt-2" data-testid="radar-legend">
        {columns.map((column) => (
          <li key={column.key} className="flex min-w-0 items-center gap-1.5 text-xs font-bold">
            <Marker look={column.look} />
            <span className="truncate">{column.name}</span>
          </li>
        ))}
      </ul>

      <div className="px-4 pb-4 pt-2">
        <table className="w-full table-fixed border-collapse text-xs">
          <thead>
            <tr className="align-bottom">
              <th scope="col" className="w-[34%] py-1.5 text-left font-extrabold text-ink-soft">
                {c.column}
              </th>
              {columns.map((column) => (
                <th key={column.key} scope="col" className="py-1.5 pl-2 text-left font-extrabold">
                  <Marker look={column.look} />
                  <span className="sr-only">{column.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {all.map((row, i) => (
              <tr key={row.criterionId} className="border-t border-line">
                <th scope="row" className="truncate py-2 text-left font-bold">
                  {row.label}
                </th>
                {columns.map((column) => (
                  <td key={column.key} className="tabular py-2 pl-2">
                    {cell(column.profile, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-2xs text-ink-soft">{c.count}</p>
      </div>

      <PickSheet
        open={choosing !== null}
        onClose={() => setChoosing(null)}
        title={c.pick}
        options={options}
        value={[choosing === 'first' ? (a ?? ALL) : (b ?? NOTHING)]}
        onChange={([id]) => {
          if (choosing === 'first') setFirst(id === ALL ? null : id)
          else setSecond(id === NOTHING ? null : id)
        }}
        searchLabel={w.c.filter.searchDishes}
        emptyText={w.c.filter.noDishFound}
      />
    </ChartCard>
  )
}
