# Cloudflare Free feasibility probe

This is a local Wrangler probe against the SubBoost core parser and YAML generator at upstream commit `3703669` (2026-09-26). It uses synthetic Shadowsocks node links and no real subscription secrets.

## Run

From the repository root:

```powershell
npm ci --ignore-scripts
cd research/cloudflare-free-probe
npx wrangler dev --local --port 8787
```

Then request `http://127.0.0.1:8787/?nodes=100` (or another integer from 1 to 10000).

## Observed local results

Three warmed requests for each size. Time is the in-Worker synchronous parsing plus YAML generation time, rounded by the local runtime. It is an approximation of CPU usage, not a measurement of Cloudflare production CPU billing/enforcement.

| Nodes | Total time, ms | YAML bytes |
| ---: | ---: | ---: |
| 20 | 3–4 | 15,132 |
| 100 | 6–8 | 35,132 |
| 500 | 22–29 | 141,132 |
| 1,000 | 40–44 | 273,632 |
| 5,000 | 207–235 | 1,393,632 |
| 10,000 | 422–430 | 2,793,632 |

All synthetic nodes parsed with zero errors. The actual YAML endpoint also loads database state, decrypts data, and handles HTTP; those costs are excluded. Network fetches, D1 storage, authentication, cron, Next.js rendering, and real Cloudflare deployment were not tested.

The `/bcrypt` probe runs the application's current bcrypt cost factor (12) with a synthetic password. Three local Worker runs took 278–302 ms to hash and 271–296 ms to verify. This login implementation cannot fit a 10 ms CPU budget; the Cloudflare version needs a different authentication design.

The `vinext check` tool reported 94% compatibility for the local Next.js application, with its custom webpack config as the one reported issue. That scanner result does not establish runtime, database, or source-fetch compatibility.
