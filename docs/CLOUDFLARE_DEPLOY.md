# Cloudflare 部署指南

[English](CLOUDFLARE_DEPLOY.en.md)

本指南部署你自己的 SubBoost CF Personal。每个实例使用一个 Worker、一个 D1 数据库和一个 Queue。仓库不包含任何现成账号、数据库或订阅。下面的命令在 PowerShell 中运行；macOS/Linux 用户将 `Copy-Item` 换成 `cp` 即可。

## 1. 准备

1. 注册并登录 [Cloudflare](https://dash.cloudflare.com/)，确认账号可以使用 [Workers](https://developers.cloudflare.com/workers/)、[D1](https://developers.cloudflare.com/d1/) 和 [Queues](https://developers.cloudflare.com/queues/)。免费额度与限制以 Cloudflare 当前文档为准。
2. 安装 Git 和本仓库 `package.json` 要求的 Node.js 版本。
3. 下载代码并安装依赖：

   ```powershell
   git clone https://github.com/ccawmiku/subboost-cf-personal.git
   cd subboost-cf-personal
   npm ci
   cd local
   npx wrangler login
   ```

## 2. 创建独立资源

将下例的 `subboost-my-instance` 换成你自己的唯一名称。Queue 名称需与配置文件一致。

```powershell
npx wrangler d1 create subboost-my-instance
npx wrangler queues create subboost-my-instance-jobs
Copy-Item wrangler.example.jsonc wrangler.production.jsonc
```

`d1 create` 会显示 `database_id`。编辑本机的 `wrangler.production.jsonc`，填入这个 ID，并把 Worker 名、D1 名、Queue 的生产者与消费者名称改为刚创建的资源。这个文件已被 Git 忽略，不能提交；公开模板中的全零 ID 无法部署。

在 Cloudflare 控制台的 Workers & Pages 页面找到你的 `workers.dev` 子域。站点地址形如 `https://<Worker 名>.<你的子域>.workers.dev`。也可以使用已配置好的自定义 HTTPS 域名。

## 3. 创建密钥并首次部署

把下面的地址换成**你自己的站点地址**。脚本会在被 Git 忽略的 `.production-secrets` 中创建五个随机密钥与 `APP_URL`，并显示一次性管理员初始化链接。文件已存在时脚本会拒绝覆盖，避免重置密钥后无法解密旧数据。

```powershell
node scripts/create-cloudflare-secrets.mjs production https://subboost-my-instance.YOUR-SUBDOMAIN.workers.dev
node scripts/deploy-cloudflare.mjs production --initial
node scripts/smoke-cloudflare.mjs production
```

`--initial` 只接受尚未初始化的 D1。部署脚本检查数据库、构建应用、应用迁移，再同时上传 Worker 和密钥。如果 Wrangler 提示资源或权限错误，先核对登录账号、D1 ID、Queue 名称和 Worker 名。不要把 `.production-secrets`、初始化链接、终端中显示的密钥或真实订阅地址发到 Issue。

打开创建密钥时显示的 `/login#setup-token=...` 链接，设置管理员账号和强密码。只有第一次初始化会用到该令牌。登录后可在账户设置中开启 TOTP；请离线保存恢复码。

## 4. 更新与备份

在仓库根目录拉取新版并安装依赖，然后在 `local` 目录部署：

```powershell
git pull --ff-only
npm ci
cd local
node scripts/deploy-cloudflare.mjs production
node scripts/smoke-cloudflare.mjs production
```

更新命令会先导出生产 D1，生成加密备份，并在独立的本地 D1 中恢复验证；通过后才应用迁移与部署。备份文件保存在 `local/backups/`，备份密钥保存在当前用户目录的 `.subboost-cf-personal/backup.key`。**两者必须一起离线保存**，也要私下保存 `.production-secrets`。这些文件都不能提交到 Git。恢复命令见 [备份脚本](../local/scripts/cloudflare-backup.mjs) 和 [运维说明](../local/CLOUDFLARE_PERSONAL.md)。

升级前请阅读 Git 差异，尤其是 D1 迁移。已经初始化的数据库不能再使用 `--initial`。更换 `ENCRYPTION_KEY` 会使已有的加密数据无法读取；更换 `AUTH_PEPPER` 会使当前管理员密码失效。

## 5. 常见情况

- **导入来源显示 403：**源站可能拒绝 Worker 的请求。首页会在已入队的来源导入返回 403 时，尝试由当前浏览器跨域读取 HTTPS 来源；只有源站允许跨域时才有效。后台自动刷新仍由 Worker 执行，因此这类来源需要源站允许 Worker 请求，或改用可从 Worker 访问的订阅地址。
- **公开 YAML 暂时返回 503：**Queue 可能正在生成或重试。稍后重试并查看 Worker 与 Queue 日志；已有缓存时程序会尽量提供旧版 YAML。
- **首次登录提示令牌缺失：**使用创建密钥时显示的带 `#setup-token=` 的完整链接。若未保存，可在本机私下读取 `.production-secrets` 中的 `LOCAL_SETUP_TOKEN`，不要通过聊天或 Issue 发送它。
- **要使用自己的域名：**先在 Cloudflare 为 Worker 配置自定义域名，再把 `APP_URL` 更新成新域名。`APP_URL` 是 Worker Secret；修改后重新登录。

## 6. 开源和分享

本改版基于 [SubBoost 原版](https://github.com/SubBoost/subboost)，继续遵循仓库根目录的 [AGPL-3.0-only](../LICENSE)。如果你再次修改并向他人提供网络服务，请保留许可证与原作者声明，并在运行中的界面提供**你实际部署版本**的对应源码地址。默认界面指向本仓库；发布你自己的修改版时，把 `NEXT_PUBLIC_SOURCE_REPOSITORY_URL` 设置为你的公开源码仓库地址并重新构建部署。详见 [改版声明](../NOTICE.md)。
