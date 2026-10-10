# Build with an agent

Paste the following into your coding agent in the project you want to change. Replace the bracketed parts with your use case. The agent can prepare the integration without seeing your key; supply it directly in your local environment file or demo input.

```text
Customize this Unmap Maps clone for [my use case].

1. Read README.md, AGENTS.md, and CONTRIBUTING.md. Inspect the existing app
   and reuse its Next.js/React stack, components, URL state, and API inspector.
   Read the installed Next.js docs before changing framework conventions.
2. Install with pnpm install --frozen-lockfile. Copy .env.example to .env.local
   if needed. I will supply NEXT_PUBLIC_UNMAP_KEY; never read, print, or commit
   it. Tell me to allow http://localhost:3100 on my browser key.
3. Start pnpm dev. Keep the matching MapLibre worker setup, CSS, map height,
   and attribution. Make the smallest working change for my use case; keep
   TypeScript strict and handle loading/empty/error states.
4. Preserve static export and describe any deliberate changes to canonical
   registry components. Do not overwrite provenance hashes to hide drift.
   Explain how a fork's customization differs from the exported source.
5. Run pnpm check and inspect the relevant page locally. Report the changed
   files, checks/results, local URL, and setup still needed. If no key is
   supplied, distinguish app checks from unverified live API behavior.
   Do not deploy or publish as part of this task.
```

A finished integration should have a runnable local URL, a visible map when a valid browser key is supplied, correct attribution, and passing relevant checks. Review the changes before using them in production. For changes to this repository itself, follow [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md).
