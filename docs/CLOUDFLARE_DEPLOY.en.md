# Deploy on Cloudflare

[中文指南](CLOUDFLARE_DEPLOY.md)

Each installation needs its own Cloudflare Worker, D1 database, and Queue. This repository contains no shared account, database, or subscription. The commands below use PowerShell; replace `Copy-Item` with `cp` on macOS/Linux.

## 1. Prerequisites

Create a [Cloudflare account](https://dash.cloudflare.com/) with access to [Workers](https://developers.cloudflare.com/workers/), [D1](https://developers.cloudflare.com/d1/), and [Queues](https://developers.cloudflare.com/queues/). Install Git and a Node.js version supported by the root `package.json`.

```powershell
git clone https://github.com/ccawmiku/subboost-cf-personal.git
cd subboost-cf-personal
npm ci
cd local
npx wrangler login
```

## 2. Create your resources

Pick a unique name in place of `subboost-my-instance`:

```powershell
npx wrangler d1 create subboost-my-instance
npx wrangler queues create subboost-my-instance-jobs
Copy-Item wrangler.example.jsonc wrangler.production.jsonc
```

Edit the private `wrangler.production.jsonc`: set the Worker name, D1 name and the `database_id` printed by `d1 create`, and set the same Queue name in the producer and consumer entries. This file is ignored by Git. The all-zero ID in the public template cannot be deployed.

Find your `workers.dev` subdomain in Cloudflare's Workers & Pages dashboard. Your site URL has the form `https://<worker-name>.<your-subdomain>.workers.dev`. An HTTPS custom domain also works.

## 3. Generate secrets and deploy for the first time

Replace the URL with **your own site URL**. The script creates five random secrets in the ignored `.production-secrets` file and prints a one-time administrator setup link. It refuses to overwrite an existing file so it cannot accidentally rotate keys used for stored data.

```powershell
node scripts/create-cloudflare-secrets.mjs production https://subboost-my-instance.YOUR-SUBDOMAIN.workers.dev
node scripts/deploy-cloudflare.mjs production --initial
node scripts/smoke-cloudflare.mjs production
```

`--initial` accepts only an empty D1 database. Deployment verifies that condition, builds the application, applies D1 migrations, and uploads the Worker with its secrets. Open the printed `/login#setup-token=...` URL and create your administrator account. Optionally enable TOTP in account settings and save the recovery codes offline. Never put `.production-secrets`, the setup URL, or real subscription URLs in Git or an issue.

## 4. Update and back up

From the repository root, then `local`:

```powershell
git pull --ff-only
npm ci
cd local
node scripts/deploy-cloudflare.mjs production
node scripts/smoke-cloudflare.mjs production
```

The update script exports production D1, makes an encrypted backup, verifies a local restore, then applies migrations and deploys. Keep both `local/backups/` and the backup key at `.subboost-cf-personal/backup.key` in your user directory in a safe private location. Keep `.production-secrets` privately as well. Do not use `--initial` for an existing database. Rotating `ENCRYPTION_KEY` makes existing encrypted data unreadable; rotating `AUTH_PEPPER` invalidates the current administrator password.

## 5. Troubleshooting

- **Source import shows 403:** the source may reject requests from Workers. After a queued import receives 403, the home page attempts an HTTPS browser fetch if the source allows cross-origin access. Background refresh still runs in the Worker and needs a Worker-accessible source.
- **Public YAML shows 503:** the Queue may still be preparing or retrying. Retry later and inspect Worker and Queue logs. An existing cache may be served as stale data.
- **Setup token missing:** use the full URL with `#setup-token=` printed when secrets were created. If lost, read `LOCAL_SETUP_TOKEN` from your local `.production-secrets` privately.
- **Custom domain:** configure the domain for the Worker, then update its `APP_URL` secret and sign in again.

## 6. License and source offer

This fork derives from [SubBoost](https://github.com/SubBoost/subboost) under [AGPL-3.0-only](../LICENSE). Keep license and origin notices. If you modify and serve this app, provide the corresponding source for the version you actually run. Set `NEXT_PUBLIC_SOURCE_REPOSITORY_URL` to your public source repository before building and deploying your version. See the [modification notice](../NOTICE.md).
