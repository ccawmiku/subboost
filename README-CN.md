# SubBoost CF Personal

[English](README.md) · [Cloudflare 部署教程](docs/CLOUDFLARE_DEPLOY.md) · [许可证](LICENSE) · [改版声明](NOTICE.md)

这是 [SubBoost 原版](https://github.com/SubBoost/subboost) 的**非官方 Cloudflare 改版**，用 Workers、D1 和 Queues 运行订阅转换与管理界面。你需要部署自己的实例并创建自己的管理员；本仓库没有可共用的账号、数据库或订阅服务。

## 适合什么场景

- 把订阅链接、YAML 和节点链接导入可视化配置生成器，生成 Clash/Mihomo 配置。
- 用代理组、规则、DNS、链式代理和多来源聚合管理配置。
- 在 Cloudflare 上运行单管理员实例；每条订阅最多 100 个节点，实例最多 20 条订阅，每条最多 10 个来源。
- 由 Queue 处理来源预览、订阅刷新和 YAML 生成。免费额度能否满足你的使用量，取决于 Cloudflare 当前限制和实际请求量。

**开始部署：**按 [Cloudflare 部署教程](docs/CLOUDFLARE_DEPLOY.md) 从零创建 Worker、D1、Queue 和密钥。教程同时说明首次初始化、更新、备份和 403 等常见问题。[运行结构](local/cloudflare/README.md) 解释各组件的用途。

## 与原版的关系

本仓库保留了原版的 Next.js/PostgreSQL 自部署代码，但这里的主要发布路径是 Cloudflare 个人版。原版 Docker 镜像、原版在线服务与原版发布流程不等于本改版的 Cloudflare 部署。需要原版功能和支持，请访问 [SubBoost/subboost](https://github.com/SubBoost/subboost)。本改版的变更与来源见 [NOTICE.md](NOTICE.md)。

## 开发

项目要求的 Node.js 版本见 `package.json`。在仓库根目录运行：

```powershell
npm ci
npm run lint
npm run test:unit
npm run local:typecheck
```

Cloudflare 构建命令为 `npm --prefix local run build:vinext`。本机部署配置、Worker 密钥、数据库备份和真实订阅链接不能提交到 Git；公开模板是 [wrangler.example.jsonc](local/wrangler.example.jsonc)。贡献规范见 [CONTRIBUTING.md](docs/CONTRIBUTING.md)。

## 许可和源码

此改版保留原版的 [GNU AGPL-3.0-only](LICENSE) 许可及原作者声明，并标明了改动。通过网络提供修改后的服务时，应向用户提供**该运行版本**的对应源码；界面提供源码链接。若你再次修改并部署，请将 `NEXT_PUBLIC_SOURCE_REPOSITORY_URL` 指向你公开的对应源码仓库。参见 [改版声明](NOTICE.md) 和 [第三方说明](docs/THIRD_PARTY_NOTICES.md)。

本项目不提供代理节点或订阅服务，也不保证第三方订阅的可用性或合法性。
