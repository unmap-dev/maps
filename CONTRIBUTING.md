# Contributing

Open an issue for a bug or proposal, or submit a focused pull request with a description of
what changes and how you verified it. Use Node.js 24 and pnpm 10.29.3, install with
`pnpm install --frozen-lockfile`, and run `pnpm check` before submitting.

This is an automatic public export. The product monorepo is the authoritative source during
the migration, including releases and production deployment. Maintainers apply accepted pull
requests upstream and export them back here. Please do not edit generated lockfiles or contract
snapshots by hand. The public repository's CI runs without production credentials.

Do not include API keys in contributions. Report credential exposure through GitHub's
private vulnerability reporting for this repository.
