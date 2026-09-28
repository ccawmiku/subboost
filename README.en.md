# SubBoost CF Personal

[中文（默认）](README.md) · [Cloudflare deployment guide](docs/CLOUDFLARE_DEPLOY.en.md) · [License](LICENSE) · [Modification notice](NOTICE.md)

This is an **unofficial Cloudflare edition** of [SubBoost](https://github.com/SubBoost/subboost). It runs the subscription conversion and management UI on Workers, D1, and Queues. Deploy your own instance and create your own administrator. This repository does not include a shared account, database, or subscription service.

## What it does

- Imports subscription URLs, YAML, and node links to create Clash/Mihomo configurations.
- Manages proxy groups, rules, DNS, chained proxies, and multiple sources through a visual UI.
- Runs as a single-administrator Cloudflare instance, with at most 100 nodes per subscription, 20 subscriptions per instance, and 10 sources per subscription.
- Uses a Queue for source previews, subscription refreshes, and YAML generation. Whether Cloudflare's free allowance is sufficient depends on current limits and your workload.

**Get started:** follow the [Cloudflare deployment guide](docs/CLOUDFLARE_DEPLOY.en.md) to create your Worker, D1 database, Queue, and secrets. It also covers administrator setup, updates, backups, and common 403 errors. See the [runtime overview](local/cloudflare/README.md) for component roles.

## Relationship to upstream

The original Next.js/PostgreSQL self-hosted code remains in the repository, but the primary distribution here is the Cloudflare personal edition. Upstream Docker images, the upstream online service, and upstream releases are separate from this edition. For upstream features and support, visit [SubBoost/subboost](https://github.com/SubBoost/subboost). See [NOTICE.md](NOTICE.md) for origin and change notices.

## Development

Use a Node.js version supported by `package.json`. From the repository root:

```powershell
npm ci
npm run lint
npm run test:unit
npm run local:typecheck
```

Build for Cloudflare with `npm --prefix local run build:vinext`. Never commit local deployment configuration, Worker secrets, database backups, or real subscription links. The public configuration template is [wrangler.example.jsonc](local/wrangler.example.jsonc). See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for contribution guidance.

## License and source

This edition retains the upstream [GNU AGPL-3.0-only](LICENSE) license and notices, and marks its modifications. If you operate a further modified version over a network, offer the corresponding source for the **version actually running**. The UI links to this fork's source by default. Point `NEXT_PUBLIC_SOURCE_REPOSITORY_URL` to your public corresponding source repository when deploying your own modifications. See the [modification notice](NOTICE.md) and [third-party notices](docs/THIRD_PARTY_NOTICES.md).

This project provides no proxy nodes or subscription service and does not guarantee the availability or legality of third-party subscriptions.
