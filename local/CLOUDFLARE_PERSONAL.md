# Cloudflare 个人版

此版本运行在一个 Cloudflare Worker、一个 D1 数据库和一个 Queue 上。每条订阅最多 100 个节点，个人实例最多 20 条订阅，每条最多 10 个来源。保存配置的请求最大 1 MiB，导入的单个来源最大 512 KiB。自动任务每 5 分钟检查一次；实际刷新间隔由订阅设置决定。

首次安装请从 [公开部署指南](../docs/CLOUDFLARE_DEPLOY.md) 开始。下文是已有实例的运维备注。

当来源站点对 Worker 返回 HTTP 403 时，首页会尝试由当前浏览器直连读取该来源。该回退仅适用于 HTTPS、允许当前站点跨域读取的来源，且限制响应为 512 KiB；若浏览器也无法读取，仍显示原始 403。后台自动刷新仍由 Worker 发起，因此被源站拦截的来源无法靠浏览器回退自动更新，需要源站允许 Worker 请求或使用可由 Worker 访问的订阅地址。

## 部署

安装依赖并登录 Wrangler 后，从 `local` 目录运行：

```powershell
node scripts/deploy-cloudflare.mjs staging
node scripts/smoke-cloudflare.mjs staging https://YOUR-STAGING-SITE --account-roundtrip
node scripts/deploy-cloudflare.mjs production
node scripts/smoke-cloudflare.mjs production https://YOUR-PRODUCTION-SITE
```

部署脚本会隐藏本地 `.dev.vars` 后构建，把目标环境的 D1、Queue 和定时任务写入生成配置，执行 D1 迁移，再发布 Worker。更新正式实例前，脚本会自动创建加密 D1 备份并在独立本地数据库中恢复验证。首次安装使用 `production --initial`，且要求 D1 为空。`wrangler.staging.jsonc` 和 `wrangler.production.jsonc` 保存各自资源 ID，已被 Git 忽略；Worker 密钥由 Cloudflare Secret 管理，不写入仓库。

## YAML 与规则缓存

公开订阅的 YAML 由 Worker 入口直接从 D1 交付。第一次生成尚未完成时返回 `503 PREPARING` 和 `Retry-After`。后台生成失败时，已有版本继续以 `200` 提供，并带 `X-SubBoost-Stale: 1`；没有旧版本时返回 `503 GENERATION_FAILED`，同时给出下一次重试秒数。失败次数、下次重试时间和安全的错误类型保存在 D1，并显示在账户设置中。

规则索引和中国规则候选结果也保存在 D1。Queue 将上游规则文件分批下载后再合成候选结果，避免触及免费 Worker 的子请求上限。首次预热前候选接口可能短暂返回 `503`；缓存建立后，刷新失败会继续提供旧结果。

## 账户与备份

账户设置支持更换密码。更换后所有旧登录会话失效。TOTP 开启时会一次性显示 10 枚恢复码；每枚只能登录一次，必须离线保存。忘记 TOTP 时用密码和未使用的恢复码登录。

加密备份位于 `local/backups/`，密钥位于当前 Windows 用户目录的 `.subboost-cf-personal/backup.key`。两者都不进入 Git。离线验证指定备份：

```powershell
node scripts/cloudflare-backup.mjs test-restore backups/<backup-file>.sbak
```

恢复生产数据时，应先用此命令确认备份可读，再解密到仓库外的临时 SQL 文件：

```powershell
node scripts/cloudflare-backup.mjs decrypt backups/<backup-file>.sbak "$env:TEMP\subboost-recovery.sql"
```

在 Cloudflare 新建一个 D1 数据库，用 `wrangler d1 execute <新数据库名> --remote --file "$env:TEMP\subboost-recovery.sql"` 导入，更新 `wrangler.production.jsonc` 的数据库 ID，并重新部署。确认新实例后删除临时 SQL。旧库可以保留供核对。必须同时保存备份文件和密钥，否则无法解密。

账户设置中的资源概览显示应用内部的订阅、YAML、导入和规则缓存状态。Cloudflare 请求、Queue 操作及 D1 读写的实际免费额度用量以 Cloudflare 控制台为准。
