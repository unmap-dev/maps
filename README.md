# Unmap Maps

A complete map app you can run, inspect, and adapt: search, place cards, directions, nearby places, travel-time areas, road events, and scheduled transit. Built with Next.js, React, MapLibre, and copied Unmap registry components.

[Live app](https://apps.unmap.dev/maps/) · [Docs](https://unmap.dev/docs) · [SDK source](https://github.com/unmap-dev/sdk-js) · [Smaller examples](https://github.com/unmap-dev/examples) · [Agent prompt](AGENT_PROMPT.md)

## Run locally in under 60 seconds

Have **Git, Node.js 24, pnpm 10.29.3, and a browser key** ready. Get the key from the [dashboard](https://unmap.dev/dashboard) and allow **`http://localhost:3100`**. No Cloudflare account is needed to run locally.

```sh
git clone --depth 1 https://github.com/unmap-dev/maps.git
cd maps
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Set `NEXT_PUBLIC_UNMAP_KEY` in `.env.local` to your browser key, then:

```sh
pnpm dev
```

Open **[localhost:3100](http://localhost:3100)**. You should see the Calgary map and search field. Search for **Calgary Tower**, open its place card, then request walking directions. The included worker script runs automatically before startup.

The 60-second target starts with the prerequisites and key ready; a first install downloads dependencies, so network speed and hardware affect timing. Use the [live app](https://apps.unmap.dev/maps/) for an immediate preview. If pnpm is missing, enable your installed Corepack with `corepack enable`, or install `pnpm@10.29.3` through your normal Node setup.

## Learn by inspecting real requests

Open the app's **API inspector** to see requests, responses, timings, SDK calls, and equivalent curl commands as you search or get directions. This connects each visible feature to the API call behind it.

The basemap is worldwide; geocoding and routing cover Canada. Some layers require add-ons on your key. Transit departures are scheduled, not realtime, and road events do not include traffic speeds. Photos, reviews, opening hours, and phone numbers are not available from the place API.

## Make it yours

1. Change the starting location in [`lib/config.ts`](lib/config.ts). Coordinates use **longitude, latitude**.
2. Edit the app composition in [`components/maps/maps-app.tsx`](components/maps/maps-app.tsx).
3. Adapt panels in `components/maps/` and the copied components in `components/ui/`.
4. Adjust application colors in [`app/globals.css`](app/globals.css). Preserve attribution on the map and any displayed data.

Changes appear during `pnpm dev`. API calls use published `@unmap/*` packages. You can reuse a smaller piece from the [examples repo](https://github.com/unmap-dev/examples) if you do not need the full app.

| Configuration | Default / purpose |
| --- | --- |
| `NEXT_PUBLIC_UNMAP_KEY` | Your browser key; required for live API requests |
| `NEXT_PUBLIC_UNMAP_GATEWAY` | `https://api.unmap.dev`; optional gateway override |
| Development port | `3100`; change it in the `dev` script if needed |

Environment files are ignored by Git. Restart the dev server after changing them. `NEXT_PUBLIC_*` values are included in the browser bundle and fixed at production build time; never put server secrets in them.

## Build with an agent

Paste this in your clone or fork:

```text
Adapt this Unmap Maps app for my use case: [describe the change]. Read README.md
and AGENTS.md first. Keep the existing Next.js/React stack and reuse the map
components and API inspector. Start with the smallest useful working change.
Keep my browser key in .env.local; never print or commit it. Preserve map and
data attribution. Run pnpm check, verify the relevant screen locally, and
report the local URL, changed files, and anything I must configure.
```

Use [AGENT_PROMPT.md](AGENT_PROMPT.md) for a detailed customization prompt. [AGENTS.md](AGENTS.md) gives agents the project layout, worker setup, validation commands, and contribution rules.

## Project layout

| Path | What to change or learn |
| --- | --- |
| `app/` | Root page, layout, application styles |
| `components/maps/` | Search, panels, controls, API inspector, live layers |
| `components/ui/`, `lib/map-*` | Copied registry components and their UI primitives |
| `lib/config.ts` | API settings and initial camera |
| `lib/url-state.ts` | Shareable URLs and browser history |
| `lib/inspector.ts` | Request recording and SDK/curl descriptions |
| `test/` | App tests and component provenance checks |
| `scripts/copy-maplibre-worker.mjs` | Keeps the served worker aligned with installed MapLibre |

## Validate and deploy

```sh
pnpm check
```

This runs typechecking, lint, tests, and a production build without API credentials. These checks take longer than startup.

```sh
pnpm build
```

The static site is written to `out/`. Serve it with any static host that falls back to `index.html` for application URLs. To deploy to Cloudflare, choose a unique Worker name in [`wrangler.jsonc`](wrangler.jsonc), set your production browser key before building, allow the deployment origin on that key, and run:

```sh
pnpm run deploy
```

The deploy script builds and invokes Wrangler; you will need your own Cloudflare account. Changing a production key requires rebuilding.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| App loads, map does not | Set `NEXT_PUBLIC_UNMAP_KEY` in `.env.local`, allow `http://localhost:3100`, and restart. |
| Key / origin rejected | Confirm the exact scheme, host, and port. A `127.0.0.1` URL needs its own allowed origin. |
| Missing layer | Check that your key has the required add-on. |
| Worker 404 | Use `pnpm dev` / `pnpm build` so the worker copy step runs; check `/maplibre/maplibre-gl-worker.mjs`. |
| Port 3100 is occupied | Change the port in `package.json`, then update your key's allowed origin. |
| pnpm missing or wrong version | Install pnpm 10.29.3; run it from the clone root. |
| Production key still looks old | Rebuild; public environment values are compiled into the static output. |

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md); [issues](https://github.com/unmap-dev/maps/issues) and pull requests are welcome. This repo receives verified source snapshots from Unmap's product monorepo, where maintainers backport accepted upstream changes. The sync runs hourly or on manual dispatch. Customize your own fork normally. The live app at [apps.unmap.dev/maps](https://apps.unmap.dev/maps/) is deployed from the product monorepo.

Source is [MIT](LICENSE); dependencies retain their licenses. Hosted API use requires a key and follows the service terms and quotas.
