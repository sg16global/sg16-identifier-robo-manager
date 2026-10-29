import type { ReactNode } from "react";
import { Reveal } from "@/components/ui";

/**
 * "Global Presence" strip between the hero and the AI Pioneers, matching the
 * one on mistralbrain.com. Flags are inline SVG (flag emoji do not render on
 * Windows), so nothing is fetched and every flag stays crisp at any size.
 */

/** Five-pointed star centred on (cx, cy), pointing up, rotated by `rotate` degrees. */
function Star({ cx, cy, r, rotate = 0, fill }: { cx: number; cy: number; r: number; rotate?: number; fill: string }) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const radius = i % 2 === 0 ? r : r * 0.382;
    const angle = ((-90 + i * 36) * Math.PI) / 180;
    return `${(cx + radius * Math.cos(angle)).toFixed(3)},${(cy + radius * Math.sin(angle)).toFixed(3)}`;
  }).join(" ");
  return <polygon points={points} fill={fill} transform={rotate ? `rotate(${rotate.toFixed(2)} ${cx} ${cy})` : undefined} />;
}

function FlagUSA() {
  // 19:10, 13 stripes, 50 stars on a 9-row × 11-column grid in the 7.6 × 5.385 canton,
  // alternating rows of 6 (odd columns) and 5 (even columns).
  const colStep = 7.6 / 12;
  const rowStep = (7 * 10) / 13 / 10;
  const stars: ReactNode[] = [];
  for (let row = 0; row < 9; row++) {
    const count = row % 2 === 0 ? 6 : 5;
    for (let col = 0; col < count; col++) {
      const x = (2 * col + (row % 2 === 0 ? 1 : 2)) * colStep;
      stars.push(<Star key={`${row}-${col}`} cx={x} cy={(row + 1) * rowStep} r={0.308} fill="#fff" />);
    }
  }
  return (
    <svg viewBox="0 0 19 10" preserveAspectRatio="xMidYMid slice">
      <rect width="19" height="10" fill="#fff" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} y={(i * 2 * 10) / 13} width="19" height={10 / 13} fill="#B22234" />
      ))}
      <rect width="7.6" height={(7 * 10) / 13} fill="#3C3B6E" />
      {stars}
    </svg>
  );
}

function FlagUK() {
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice">
      <clipPath id="gp-uk-s">
        <path d="M0,0 v30 h60 v-30 z" />
      </clipPath>
      <clipPath id="gp-uk-t">
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <g clipPath="url(#gp-uk-s)">
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#gp-uk-t)" stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

function FlagTricolour({ colours, vertical }: { colours: [string, string, string]; vertical: boolean }) {
  return (
    <svg viewBox="0 0 3 2" preserveAspectRatio="none">
      {colours.map((fill, i) =>
        vertical ? <rect key={i} x={i} width="1" height="2" fill={fill} /> : <rect key={i} y={(i * 2) / 3} width="3" height={2 / 3} fill={fill} />,
      )}
    </svg>
  );
}

function FlagChina() {
  // 30 × 20 grid: the large star at (5, 5); each small star points at its centre.
  const small = [
    [10, 2],
    [12, 4],
    [12, 7],
    [10, 9],
  ];
  return (
    <svg viewBox="0 0 30 20" preserveAspectRatio="xMidYMid slice">
      <rect width="30" height="20" fill="#EE1C25" />
      <Star cx={5} cy={5} r={3} fill="#FFFF00" />
      {small.map(([x, y]) => (
        <Star key={`${x}-${y}`} cx={x} cy={y} r={1} fill="#FFFF00" rotate={(Math.atan2(5 - y, 5 - x) * 180) / Math.PI + 90} />
      ))}
    </svg>
  );
}

const NATIONS: Array<{ name: string; flag: ReactNode }> = [
  { name: "USA", flag: <FlagUSA /> },
  { name: "UK", flag: <FlagUK /> },
  { name: "France", flag: <FlagTricolour vertical colours={["#0055A4", "#FFFFFF", "#EF4135"]} /> },
  { name: "Russia", flag: <FlagTricolour vertical={false} colours={["#FFFFFF", "#0039A6", "#D52B1E"]} /> },
  { name: "China", flag: <FlagChina /> },
  { name: "Germany", flag: <FlagTricolour vertical={false} colours={["#000000", "#DD0000", "#FFCE00"]} /> },
];

export function GlobalPresence() {
  return (
    <section aria-labelledby="global-presence-title" className="relative mx-auto mt-14 max-w-[1040px] px-5 sm:px-8">
      <Reveal>
        <div className="card-edge card-feature relative overflow-hidden rounded-sm px-5 pb-6 pt-7 sm:px-8">
          <div className="grid-fine pointer-events-none absolute inset-0 opacity-30" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/70 to-transparent" />

          <header className="relative text-center">
            <h2
              id="global-presence-title"
              className="font-display text-[clamp(1.15rem,2.2vw,1.5rem)] font-semibold uppercase tracking-[0.14em] text-brand-400 [text-shadow:0_0_18px_rgb(255_23_68/0.4)]"
            >
              Global Presence
            </h2>
            <p className="rule-label mt-1.5 text-mist-400">United minds · for a better tomorrow</p>
          </header>

          <ul className="relative mt-6 grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-6">
            {NATIONS.map((n) => (
              <li key={n.name} className="group flex flex-col items-center gap-2">
                <span
                  aria-hidden
                  className="block h-[40px] w-[60px] overflow-hidden rounded-[3px] border border-ink-500 shadow-[0_2px_10px_rgb(0_0_0/0.6)] transition-[transform,border-color,box-shadow] duration-300 group-hover:-translate-y-0.5 group-hover:border-brand-500 group-hover:shadow-[0_0_18px_-4px_var(--glow-red-strong)] sm:h-[44px] sm:w-[66px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                >
                  {n.flag}
                </span>
                <span className="font-display text-[12.5px] font-semibold uppercase tracking-[0.08em] text-paper-50">
                  {n.name}
                </span>
              </li>
            ))}
          </ul>

          <p className="relative mt-6 text-center font-mono text-[10.5px] uppercase tracking-[0.2em] text-mist-500">
            Different nations <span className="text-brand-500">★</span> same vision <span className="text-brand-500">★</span> a brighter human future
          </p>
        </div>
      </Reveal>
    </section>
  );
}
