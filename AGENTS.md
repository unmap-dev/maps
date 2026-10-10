# Working on Unmap Maps

Read README.md and CONTRIBUTING.md first. This is a standalone Next.js/React map app using published @unmap packages, copied registry components, and a static production export. Keep changes small and preserve the existing stack.

## Start and validate

Use Node.js 24 and pnpm 10.29.3. Run `pnpm install --frozen-lockfile`, copy `.env.example` to `.env.local`, and let the developer supply NEXT_PUBLIC_UNMAP_KEY. `pnpm dev` serves http://localhost:3100 and copies the matching MapLibre worker automatically. The browser key must allow that origin.

`pnpm check` runs typechecking, lint, tests, and a production build without API credentials. Run it for source or dependency changes. `pnpm build` writes static files to `out/`; no Node server is needed in production. Read the installed Next.js docs before changing framework conventions.

## Useful files

- `components/maps/maps-app.tsx`: application composition, panels, map, and inspector.
- `components/maps/`: feature panels, search, controls, inspector.
- `components/ui/`, `lib/map-*`: reusable copied registry components.
- `lib/config.ts`: browser API settings and initial camera.
- `lib/url-state.ts`: URL and browser-history state.
- `lib/inspector.ts`: request recorder and SDK/curl descriptions.
- `app/globals.css`: application styles; map attribution must remain visible.
- `scripts/copy-maplibre-worker.mjs`: worker asset copied before dev/build. Keep it aligned with installed MapLibre.

## Rules

Never read, print, or commit actual keys or .env.local. NEXT_PUBLIC_* variables are visible in the browser and fixed at build time; use browser keys restricted to the deployment origins, never server secrets. Coordinates are [longitude, latitude]. Keep CSS and worker setup intact and clean up map resources on unmount. Preserve data attribution and avoid implying realtime transit or traffic speeds.

Registry provenance tests enforce copied component consistency. For an intentional upstream component change, update the canonical registry through the maintainer workflow; do not simply regenerate hashes to hide drift. Fork authors may customize components and adapt provenance checks explicitly, explaining the departure from the exported snapshot.

Maintainers backport accepted upstream PRs to the authoritative product monorepo; public contributors can open a PR here. Customize your own fork normally. Do not add a deploy workflow for Unmap's production account. Deploying a fork requires the developer's own host configuration and credentials.

Report changed files, validation results, local URL, and remaining setup. Separate tests without a key from live API verification.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
