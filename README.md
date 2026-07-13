# SubBoost：Clash/Mihomo 订阅增强与管理

SubBoost 是一个可视化的 Clash/Mihomo 订阅转换、聚合和增强工具。它可以导入机场订阅、自建节点、YAML 文件或节点链接，在网页中完成节点筛选、链式代理、规则分流与 DNS 配置，并定时生成更新后的聚合订阅。

> 本仓库是 [SubBoost/subboost](https://github.com/SubBoost/subboost) 的 Fork。上游版本、发行说明和许可证要求以上游仓库为准。

## 核心能力

- 导入订阅链接、YAML 文件和常见节点链接。
- 批量重命名、删除和筛选节点。
- 按来源、地区或自定义条件组织代理组。
- 可视化配置链式代理与中转代理组。
- 使用内置代理组和远程规则集进行精确分流。
- 调整规则顺序与基础 DNS 设置，降低 DNS 泄露风险。
- 定时刷新订阅，并在更新时匹配已有节点。

## 使用与部署

- 在线入口：[subboost.org](https://subboost.org)
- 一键部署：[官方部署文档](https://docs.subboost.org/deploy/one-click)
- 源码构建：[高级部署文档](https://docs.subboost.org/deploy/advanced)
- 配置教程：[Clash 可视化配置教程](https://ryanvan.com/t/topic/59?u=ryan)

## 本地开发

~~~bash
npm ci
npm run dev
~~~

提交前可运行：

~~~bash
npm run lint
npm run test:unit
npm run check:local-app
~~~

## 相关资料

- 项目文档：[docs.subboost.org](https://docs.subboost.org)
- 发行说明：[docs/release-notes.md](./docs/release-notes.md)
- 常见问题与更新记录：[subboost.org/faq](https://subboost.org/faq)

## 许可证

源码采用 [GNU Affero General Public License v3.0 only](./LICENSE)。如果修改后通过网络向用户提供服务，需要按 AGPL-3.0 向这些用户提供对应源码。

本项目不提供代理服务，也不保证第三方订阅内容的可用性或合法性。请遵守所在地法律、网络服务条款和订阅提供方规则。

