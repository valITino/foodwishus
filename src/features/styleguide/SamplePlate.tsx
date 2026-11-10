// Stand-in "photos" for the styleguide and previews: little top-down plates.
// Real proof photos replace these in the app.

type Dish = 'magronen' | 'lasagne' | 'strudel' | 'rosti'

const looks: Record<Dish, { cloth: string; food: string; accent: string; garnish: string }> = {
  magronen: { cloth: '#f6d5dc', food: '#f2cf7a', accent: '#e8b04a', garnish: '#8fa382' },
  lasagne: { cloth: '#d5dfcb', food: '#d9644a', accent: '#f4d58a', garnish: '#6f8a5f' },
  strudel: { cloth: '#f8ecc0', food: '#dba55c', accent: '#fff6e6', garnish: '#c8414b' },
  rosti: { cloth: '#d3e8f2', food: '#e9b949', accent: '#c98f2b', garnish: '#fffdf9' },
}

export function SamplePlate({ dish = 'magronen', label }: { dish?: Dish; label?: string }) {
  const c = looks[dish]
  return (
    <svg viewBox="0 0 200 200" className="size-full" role="img" aria-label={label ?? 'Sample dish'} preserveAspectRatio="xMidYMid slice">
      <rect width="200" height="200" fill={c.cloth} />
      <g opacity=".5" fill="#fff">
        {[0, 50, 100, 150].map((x) => (
          <rect key={`v${x}`} x={x} width="25" height="200" />
        ))}
        {[0, 50, 100, 150].map((y) => (
          <rect key={`h${y}`} y={y} width="200" height="25" />
        ))}
      </g>
      <ellipse cx="104" cy="108" rx="76" ry="74" fill="#4a3833" opacity=".12" />
      <circle cx="100" cy="100" r="76" fill="#fffdf9" />
      <circle cx="100" cy="100" r="56" fill="#f3ece6" />
      <path d="M62 96c-4-22 14-40 38-40s44 16 40 40c-3 20-18 34-40 34s-35-14-38-34Z" fill={c.food} />
      <g fill="none" stroke={c.accent} strokeWidth="7" strokeLinecap="round">
        <path d="M76 84c8-8 18-8 24 0s16 8 24 0" />
        <path d="M74 102c8-8 18-8 24 0s16 8 26 0" />
        <path d="M84 118c6-6 14-6 18 0s10 6 16 0" />
      </g>
      <g fill={c.garnish}>
        <circle cx="88" cy="74" r="5" />
        <circle cx="118" cy="92" r="4" />
        <circle cx="96" cy="110" r="4.5" />
        <circle cx="122" cy="114" r="3.5" />
      </g>
      <rect x="168" y="40" width="7" height="120" rx="3.5" fill="#e7ddd5" transform="rotate(8 171 100)" />
    </svg>
  )
}
