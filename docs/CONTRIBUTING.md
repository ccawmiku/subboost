# Contributing to SubBoost CF Personal

This is an unofficial Cloudflare fork of SubBoost. For upstream changes, contribute directly to [SubBoost/subboost](https://github.com/SubBoost/subboost).

## Issues and Pull Requests

- Open an issue for bug reports, reproducible failures, or documentation gaps.
- Open pull requests from a fork or your own branch.
- Keep each pull request focused on one feature, fix, or documentation change.
- Include what changed, how you tested it, and any user-visible impact.
- Do not bump package versions unless a maintainer explicitly asks for it.

## What Belongs Here

This repository contains the Cloudflare edition, shared packages, documentation, and tests.

Do not add secrets, personal configuration, deployment credentials, private keys, real subscription URLs, machine-specific files, or private operational notes.

## Contributor License Grant

By submitting a pull request, you confirm that you have the right to submit it and agree to distribute your contribution under this repository's AGPL-3.0-only license. This fork does not request an additional proprietary license grant.

## Local Checks

Run the smallest relevant checks first:

```powershell
npm run lint
npm run test:unit
npm run check:local-app
```

For parser, template, subscription output, or deployment changes, also run the focused test or selftest that covers the changed behavior.

## Documentation

- Keep README changes bilingual: update `README-CN.md` first, then sync `README.md`.
- Keep Cloudflare deployment instructions in `docs/CLOUDFLARE_DEPLOY.md` and link them from the README.
- Avoid publishing maintainer-only workflow, private infrastructure details, or machine-specific paths.
