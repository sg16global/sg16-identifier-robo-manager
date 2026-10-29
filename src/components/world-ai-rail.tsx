/**
 * "World's AI" name rail above the footer, matching the one on sg16engine.com.
 * Names roll right-to-left without end: the list is rendered twice and the track
 * slides by exactly one copy (`ticker`, 0 → -50%), so the loop restarts on an
 * identical frame. Hover pauses it; with reduced motion it becomes a scrollable row.
 */
const WORLD_AI: Array<[name: string, maker: string]> = [
  ["Claude", "Anthropic"],
  ["ChatGPT", "OpenAI"],
  ["Gemini", "Google"],
  ["Mistral", "Mistral AI"],
  ["DeepSeek", "DeepSeek"],
  ["Llama", "Meta"],
  ["Grok", "xAI"],
  ["Copilot", "Microsoft"],
  ["Qwen", "Alibaba"],
  ["Command", "Cohere"],
  ["Perplexity", "Perplexity AI"],
];

const SECONDS_PER_NAME = 3.5;

export function WorldAiRail() {
  return (
    <section aria-labelledby="world-ai-title" className="relative mx-auto mt-24 max-w-[1400px] px-5 sm:px-8">
      <div className="card-edge card-feature relative overflow-hidden rounded-sm pb-6 pt-9">
        <div className="grid-fine pointer-events-none absolute inset-0 opacity-30" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/70 to-transparent" />

        <header className="relative px-5 text-center">
          <h2
            id="world-ai-title"
            className="font-display text-[clamp(1.4rem,2.6vw,2rem)] font-semibold uppercase tracking-[0.14em] text-brand-400 [text-shadow:0_0_22px_rgb(255_23_68/0.45)]"
          >
            World’s AI
          </h2>
          <p className="rule-label mt-2 text-mist-400">The minds of today’s AI</p>
        </header>

        <div
          role="region"
          aria-label="AI products and their makers, rolling — hover to pause"
          className="scrollbar-thin relative mt-7 overflow-hidden border-y border-brand-700/50 bg-ink-950/70 [mask-image:linear-gradient(to_right,transparent,black_6%,black_94%,transparent)] motion-reduce:overflow-x-auto"
        >
          {/* Trailing padding equals the gap, so half the track is exactly one copy plus its gap. */}
          <ul
            className="flex w-max animate-ticker items-center gap-10 py-5 pr-10 hover:[animation-play-state:paused] motion-reduce:animate-none"
            style={{ animationDuration: `${WORLD_AI.length * SECONDS_PER_NAME}s` }}
          >
            {[...WORLD_AI, ...WORLD_AI].map(([name, maker], i) => {
              const duplicate = i >= WORLD_AI.length;
              return (
                <li
                  key={`${name}-${i}`}
                  aria-hidden={duplicate || undefined}
                  className={`flex shrink-0 items-center gap-10 ${duplicate ? "motion-reduce:hidden" : ""}`}
                >
                  <span className="h-1.5 w-1.5 rotate-45 bg-brand-500 shadow-[0_0_8px_var(--glow-red-strong)]" />
                  <span className="flex flex-col items-center">
                    <strong className="font-display text-[clamp(1.25rem,2vw,1.65rem)] font-semibold tracking-tight text-paper-50">{name}</strong>
                    <span className="rule-label mt-1 text-brand-400">{maker}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative mt-5 px-5 text-center font-mono text-[10.5px] uppercase tracking-[0.2em] text-mist-600">
          Independent. Not affiliated with these companies.
        </p>
      </div>
    </section>
  );
}
