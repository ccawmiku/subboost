# 上游 SubBoost 发布记录 / Upstream SubBoost release notes

以下内容来自原版的 Docker/PostgreSQL 发布流程，不是本仓库 Cloudflare 个人版的更新命令。Cloudflare 部署与更新请看 [部署指南](CLOUDFLARE_DEPLOY.md)。

The entries below describe upstream Docker/PostgreSQL releases, not the update procedure for this Cloudflare edition. See the [Cloudflare deployment guide](CLOUDFLARE_DEPLOY.en.md).

# SubBoost v2.8.1

## 中文

### 修复

- 修复自部署实例从旧版本更新时，首次执行 `subboost update` 可能已显示新版本配置、但应用仍运行旧镜像的问题。升级成功后现在会在一次更新中实际切换到新版本镜像。

### 升级说明

- 现有自部署用户可继续运行 `subboost update`。升级器仍会按原流程创建并验证数据库备份；本版本不需要新增环境变量或人工迁移。

## English

### Fixes

- Fixed an issue where the first `subboost update` from an older self-hosted version could activate new release metadata while the application continued running the old image. A successful update now switches the running application to the new image in a single update.

### Upgrade Notes

- Existing self-hosted users can continue to run `subboost update`. The updater still creates and verifies a database backup as before; this release requires no new environment variables or manual migration.
