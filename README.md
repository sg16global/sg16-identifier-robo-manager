# Universal Identifier — verification engine & universal API gateway

A React 19 + Vite SPA served by a Cloudflare Worker, implementing a deterministic
verification engine (products, news claims, websites/scams, media), stored
evidence reports, an operator console, and a universal `/v1` API that can front
**any** model server or company API anywhere in the world.

The project is deliberately free of hardcoded companies, providers, brand
catalogues or evidence endpoints. Everything operator-specific is configuration
(environment variables / JSON), and every decorative or optional section hides
itself when unconfigured. A fresh clone with only `DATABASE_URL` set boots as a
complete, unbranded product that reports honestly which capabilities are active.

## Running locally

```bash
npm install
cp .env.example .dev.vars      # fill what you need; everything optional degrades gracefully
npm run dev                    # Vite + workerd via the Cloudflare Vite plugin
```

Database: PostgreSQL through Drizzle (`drizzle.config.json`); in production bind
Hyperdrive in `wrangler.jsonc` (left exactly as the deployment defines it).

## The configuration surface

See `.env.example` for the full annotated list. The important groups:

- **Identity** — `APP_NAME`, `SITE_URL`, `ROBO_NAME`, `REPORT_ID_PREFIX`, … and the
  footer's operating-entity block (`ORG_*`) plus an optional watermarked
  certificate viewer (`CERTIFICATE_IMAGE`). All optional; neutral defaults apply.
- **Evidence connectors** — `SEARCH_CONNECTORS`, `FACTCHECK_CONNECTORS`,
  `REPUTATION_CONNECTORS`, `CT_CONNECTORS`: declarative JSON HTTP calls
  (`src/lib/connectors.ts`) describing *any* JSON API in *any* region, with
  `{{placeholders}}` and `${ENV}` secrets. Empty slot ⇒ the report says the
  capability is not configured instead of guessing.
- **Trust lists & lexicon** — `OFFICIAL_DOMAIN_SUFFIXES`, `REPUTABLE_DOMAINS`,
  `MIXED_TRUST_DOMAINS`, `SHORTENER_HOSTS`, `FREE_HOST_DOMAINS`, `PAYMENT_TERMS`,
  `PROTECTED_BRANDS`, `SIGNAL_TERMS`, `PRODUCT_CATALOG`: operator vocabulary for
  rating sources and spotting impersonation. The catalogue can also be edited at
  runtime from the admin console (`catalog-upsert`, `catalog-delete`, `catalog-import`).
- **AI adapter** — `AI_PROTOCOL` (`openai | anthropic | gemini | custom`),
  `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, auth-shape overrides, or a Workers AI
  binding. `custom` reaches any JSON API via a request template + response map.
- **Universal /v1 gateway** — `GATEWAY_API_KEYS`, `GATEWAY_RPM`,
  `GATEWAY_CORS_ORIGINS`, `MODEL_PROVIDERS` (extra model servers), `API_UPSTREAMS`
  (company APIs proxied with server-side credentials), and caller-supplied
  targets: transparent pass-through (`x-gateway-base-url`) and `/v1/forward`
  reach any public host on any continent; `GATEWAY_ALLOW_PRIVATE_TARGETS` opts
  into private ranges.
- **Robustness knobs** — `RETENTION_DAYS`, `DAILY_BUDGET_USD` (hard daily
  variable-cost ceiling enforced by the guard Durable Object), `ENABLE_DNS`,
  `DNS_RESOLVERS`.

## Architecture map

```
src/
├── main.tsx                  # boot: configureIdentity() from injected JSON, then render
├── worker/
│   ├── index.ts              # routes, bindings GUARD/AI/DB, assets
│   ├── guard.ts              # Durable Object: per-key rate limits + daily budget
│   ├── html.ts               # per-route title/description/OG + identity injection
│   └── routes/               # verify · report · meta · stats · engage · admin ·
│                             # health · image · showcase · certificate · v1/*
└── lib/
    ├── identity.ts           # the whole operator surface, sanitized, with neutral defaults
    ├── connectors.ts         # declarative HTTP connector framework (any JSON API)
    ├── providers/            # registry · research · risk · ai adapters over connectors
    ├── universal/            # gateway: chat completions, models, proxy, forward, passthrough
    ├── verification/         # engine · classify · scoring · lexicon · modules
    ├── identifiers/          # checksums (IMEI Luhn, GS1 mod-10) · catalogue
    ├── media/                # container forensics, generator-signature scan
    └── security/             # SSRF url-guard · DoH · rate-limit · upload validation
```

Design rules the codebase enforces:

1. **No company, provider, brand or source is named in code.** Lists that look
   like presets are configuration with empty defaults.
2. **Unconfigured ≠ broken.** Every capability records an honest
   "not configured in this deployment" provider call and the verdict abstains.
3. **Deterministic core.** The scorer is rule-based over named findings; AI may
   decompose, compare and summarise but never raises confidence on its own.
4. **Hostile input is the normal workload.** SSRF guard, hop-by-hop redirect
   revalidation, size caps, magic-byte upload checks, watermarked certificate
   viewer, `x-gateway-*` request headers stripped from inbound traffic.

## Cloudflare configuration

`wrangler.jsonc` is deployment-owned and intentionally left untouched by this
codebase's generic logic: Worker name, assets, the `GUARD` Durable Object, the
`AI` and `DB`/Hyperdrive bindings stay exactly as the operator's file defines.

## Licence & reuse

Fork freely; rebrand by setting environment variables — never by editing code.
