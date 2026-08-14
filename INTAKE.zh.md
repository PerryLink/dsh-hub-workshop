# Workshop 插件入库与验证流程

这套流程把四件事分开记录：**接入类型、审核状态、验证状态、Registry 准入**。Catalog 收录或 Topic 命中都不会自动获得安装权限。

这套入库流程只适用于叶子插件层。生态基础设施和社区发行版通过 `market-layers.json` 单独策展，不进入插件验证库存，也不会仅因市场展示获得 Registry 准入。

当前官方公开基线为 `@deepseek-ai/dsh@0.1.0-rc.6`。它是官方当前公开版本，但仍是 RC，不是稳定 GA。每次官方基线改变，所有可安装条目都必须重新验证；旧证据只能保留为历史记录。

## 三种接入类型

| 类型 | 投稿契约 | 当前状态 | 必须通过的测试 | Registry |
|---|---|---|---|---|
| 事务安装 | `profile-bundle` / `harness-profile` | RC.6 有公开 Profile/Bundle 生命周期 | 固定来源、供应链、安装、就绪、功能、升级、禁用、移除、恢复 | 审核与当前基线验证均通过后可准入 |
| 配置接入候选 | `repository-plugin` / `harness-repository` | 当前公开 RC.6 未提供对应包、Schema 和 Loader | 保留静态证据；公共契约可核验后重跑完整生命周期 | 当前自动阻断 |
| 引导接入 | `guided` / `harness-cordis` 或 `third-party` | 只提供固定公开来源和说明 | 固定来源、许可、权限与供应链说明；不执行仓库代码 | 永不准入 |

`pending-review`（待审核）是审核状态，不是第四种安装方式。一个事务安装、配置安装或引导接入投稿都可以处于待审核状态。

## 入库状态机

```text
公开固定 commit 投稿
  → 产品边界筛选（排除主仓、基础设施、发行版、目录、模板）
  → 定位真正的根包或插件子包
  → 校验 Manifest、声明入口和 DSH 专属注册路径（不执行投稿代码）
  → 生成 pending-review Intake Record
  → 兼容性、权限与供应链审查（许可、原生代码、安装脚本、漏洞）
  → 分类型验证
      transactional → RC.6 完整生命周期
      managed       → 当前因官方公共契约缺失而 blocked
      guided        → 来源与说明验证，不运行安装
  → 对可执行接入明确断言一个能力已注册、已调用、结果已观察
  → 人工审核 approved / needs-fix / blocked
  → 只有 approved + current-baseline-passed 才能 eligible
  → 维护者显式 admission 后才进入 Registry
```

Topic、关键词和仓库自述只负责进入候选池。根目录没有可安装包时，必须继续定位真实插件子包；插件管理器、SDK、宿主、导航目录、模板或插件合集不能整体冒充一个插件。静态结构相似也不等于可用：运行验证必须写明目标工具、命令、服务、UI 扩展、事件或 Provider，实际调用并记录预期结果与观察结果。仅仅“进程启动成功、退出码为 0”只算加载冒烟，不算功能验证。

入库记录使用 `intake.schema.json`，运行证据使用 `intake-evidence.schema.json`，公开队列为 `intake-queue.json`，当前官方事实为 `official-baseline.json`。四个文件都由 CI 做 fail-closed 校验。

`verification-inventory.json` 对 Catalog 每一个项目给出当前接入处理、审核、官方基线验证和 Registry 状态。未知项目只能使用引导式公开处理；它们不会因为出现在 Catalog 就被视为完成测试。

## 本地命令

```bash
# 校验 Author Studio 清单，只读，不执行投稿仓库代码
npm run intake:validate -- /path/to/submission.json

# 生成待审核记录到标准输出；不会自动写入队列
npm run intake:prepare -- /path/to/submission.json

# 将 intake/records/*.json 确定性生成公开队列
npm run intake:build

# 把已保存的记录与运行证据合并成下一版记录（输出到标准输出）
npm run intake:evidence -- intake/records/project@version.json intake/evidence/project@version.json

# 校验当前队列、官方基线、admissions 与 Registry 一致性
npm run intake:check

# 联网核验 npm 上的官方版本、integrity 及未开放包状态
npm run baseline:verify

# 全量构建与测试
npm run validate
```

投稿 Issue 不会自动写仓库。维护者把确认过的记录保存到 `intake/records/`，把运行证据保存到 `intake/evidence/`，再生成队列并交给 PR/CI 审核。所有命令默认不克隆投稿仓库、不执行其脚本，也不自动写 Registry。正式入库仍须通过独立 admission 变更发布。

## 证据最低要求

- 来源必须是公开 GitHub 仓库和完整 40 位 commit；不接受 `main`、分支或浮动 tag。
- 测试必须记录精确 Runtime 包、版本与 integrity；只写“兼容最新版”无效。
- 供应链至少记录许可、权限、install scripts、native code、漏洞扫描和外部副作用。
- 静态证据必须分别说明清单、声明入口、DSH 专属注册路径、兼容区间与权限；不能只写“结构正确”。
- 可执行接入必须填写结构化 `capability` 断言，证明目标能力已注册、已调用且观察结果符合预期；仅加载成功不得通过。
- 事务安装与未来恢复的配置安装均须验证 install、ready、functional、update、disable、remove、recovery。
- 引导接入必须保持无可执行安装意图；只能显示固定来源和阅读说明。
- 一旦官方 baseline 改变，旧 `current-baseline-passed` 自动视为过期，不得继续进入 Registry。
