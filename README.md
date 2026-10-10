# Unmap Maps

A complete map application with search, place cards, directions, nearby places,
travel-time areas, road events, and scheduled transit.

[Try the live app](https://maps.unmap.dev) · [API documentation](https://unmap.dev/docs) ·
[SDK source](https://github.com/unmap-dev/sdk-js)

The API inspector shows requests, responses, timings, SDK calls, and curl commands.
Map components are copied from the [Unmap component registry](https://registry.unmap.dev),
so this is a reference for building an application with the same components.

## Run locally

Use Node.js 24 and pnpm 10.29.3.

```sh
git clone https://github.com/unmap-dev/maps.git
cd maps
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Get a browser key from the [dashboard](https://unmap.dev/dashboard), allow
`http://localhost:3100` in its allowed origins, and set `NEXT_PUBLIC_UNMAP_KEY` in `.env.local`.
Then run:

```sh
pnpm dev
```

Open [localhost:3100](http://localhost:3100). This repository uses published `@unmap/*`
packages; you do not need the product monorepo or a Cloudflare account.
Some Canadian layers require add-ons enabled on your key.

```sh
pnpm check  # typecheck, lint, tests, and production build
```

## Structure

- `components/maps/`: panels, map controls, API inspector, and live layers.
- `components/ui/`, `lib/map-*`: copied registry components and UI primitives.
- `lib/url-state.ts`: shareable URLs and browser history.
- `lib/inspector.ts`: request recording and SDK/curl descriptions.
- `test/`: application tests and a registry provenance snapshot.

The registry snapshot checks the bundled components without requiring private source files.
To update a copied component, maintainers change it in the registry and export a fresh snapshot.

## Deploy your own copy

```sh
pnpm build
pnpm run deploy
```

The production build exports static files to `out/`. The included Wrangler configuration
serves them with a single-page fallback. Set a unique Worker name and allow your deployment
origin on your browser key before deploying. You can also use another static host with a
fallback to `index.html` for application URLs. `NEXT_PUBLIC_*` values are set at build time.

## Data coverage

The basemap is worldwide. Geocoding and routing cover Canada. Transit times are scheduled,
not realtime; road events do not include traffic speeds. Some place details, including photos,
reviews, opening hours, and phone numbers, are not available from the API.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).
This repository is automatically exported from Unmap's product monorepo, which remains the
authoritative source during the migration. Maintainers apply accepted changes there and export
them here. Public sync runs hourly, or on manual dispatch. The live demo is deployed from that monorepo.

## License

[MIT](LICENSE). Dependencies retain their own licenses. The license covers this source code;
using the hosted Unmap API requires an API key and is subject to its service terms and quotas.
