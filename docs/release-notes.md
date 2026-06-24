# SubBoost v2.5.1

## 中文

### 更新重点

SubBoost v2.5.1 是一个修复版本，主要修复自定义代理组的默认成员逻辑，并提升自部署安装、更新时的版本来源稳定性。建议 v2.5.0 用户升级。

### 主要变化

- 修复新建自定义代理组时默认成员过宽的问题，避免默认生成出“节点选择”和自定义组互相引用的循环配置。
- `🚀 节点选择` 默认不再自动包含自定义代理组，减少代理组套娃导致配置异常或预览卡顿的风险。
- 新建普通自定义代理组默认只包含 `DIRECT`、`REJECT` 和真实节点，保留高级模式里的手动配置能力。
- 改进自部署安装和 `subboost update` 的版本来源处理，稳定版安装资产会默认固定到对应 release 版本。
- 改进自部署管理脚本的更新来源，减少从指定版本更新时意外跟随其它发布通道的风险。

### 升级说明

- 建议升级前备份 `/opt/subboost/.env` 和数据库，方便需要时回滚。
- 已安装 v2.5.0 的自部署实例可以继续使用 `subboost update` 更新。
- 普通订阅转换、模板和规则功能不需要手动改环境变量。
- 已经手动配置过的高级代理组不会被自动改写；本次主要改变新建和默认生成行为。

## English

### Highlights

SubBoost v2.5.1 is a patch release that fixes default custom proxy group membership and improves version-source stability for self-hosted install and update flows. v2.5.0 users are encouraged to upgrade.

### Main Changes

- Fixed overly broad default members for newly created custom proxy groups, preventing default configurations where node selection and custom groups reference each other in a loop.
- `🚀 节点选择` no longer automatically includes custom proxy groups by default, reducing the risk of nested proxy group loops causing invalid output or preview slowdowns.
- Newly created normal custom proxy groups now default to `DIRECT`, `REJECT`, and real nodes only, while manual advanced configuration remains available.
- Improved self-hosted install and `subboost update` version-source handling so stable release assets stay pinned to the matching release version by default.
- Improved the self-hosted manager update source to reduce the risk of a pinned-version update unexpectedly following another release channel.

### Upgrade Notes

- Back up `/opt/subboost/.env` and the database before upgrading so rollback is easier if needed.
- Existing v2.5.0 self-hosted installations can continue to update with `subboost update`.
- Normal subscription conversion, templates, and rules do not require manual environment-variable changes.
- Manually configured advanced proxy groups are not rewritten automatically; this release mainly changes new and default generated behavior.
