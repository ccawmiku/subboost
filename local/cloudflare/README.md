# Cloudflare 运行结构

面向新用户的完整步骤见 [Cloudflare 部署指南](../../docs/CLOUDFLARE_DEPLOY.md)。此目录包含 Cloudflare Worker、D1 迁移和 Queue 任务实现。Next.js/PostgreSQL 代码仍在 `local/` 中，用于保留原版自部署路径；Cloudflare 个人版使用一个管理员、一个 D1 数据库、一个 Queue 和每五分钟触发的 Cron。

## 请求流

- Worker 提供 UI、登录、订阅管理和公开 YAML。
- D1 存储账号、订阅、缓存和任务状态。导入任务的输入与结果在 D1 中加密。
- Queue 处理来源预览、订阅刷新、YAML 生成和规则索引，避免把耗时工作放在免费 Worker 的普通 HTTP 请求中。
- 每条订阅最多 100 个节点；个人实例最多 20 条订阅，每条最多 10 个来源。单个来源最多读取 512 KiB。

公开 YAML 首次生成时可能返回 `503 PREPARING` 与 `Retry-After`。生成失败但有旧缓存时会继续交付旧版，并返回 `X-SubBoost-Stale: 1`。来源站点对 Worker 返回 403 时，首页可尝试由浏览器直接读取允许跨域的 HTTPS 来源；自动刷新仍须由 Worker 访问源站。

## 配置边界

`wrangler.example.jsonc` 是可公开的模板。`wrangler.production.jsonc` 和 `wrangler.staging.jsonc` 是每个部署者自己的本地配置，已被 Git 忽略。密钥属于 Worker Secrets，不能写入公开配置。生产更新脚本会在迁移前备份 D1 并测试恢复；首次部署使用 `--initial` 且只能针对空数据库。

运行额度、D1 存储和 Queue 操作限制可能变化，请查阅 [Workers 限制](https://developers.cloudflare.com/workers/platform/limits/)、[D1 限制](https://developers.cloudflare.com/d1/platform/limits/) 与 [Queues 定价](https://developers.cloudflare.com/queues/platform/pricing/)。
