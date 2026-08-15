# Hub 自动化与加载器适配

Hub 使用一条轻量的状态链：Topic 增量发现 → 静态分类 → 固定提交 Intake → 分级 Harness → Admission → 确定性 Feed → Ed25519 签名 → 本地 staging 冒烟 → production 环境批准 → Cloudflare 上线与在线检查。

Topic、README、星标、加载器声明和整合包引用都不是安装授权。安装授权只来自固定 Release、完整 Harness 证据和 Admission。整合包不能提升组件权限。

## 不耦合加载器

Hub 核心只理解四种稳定对象：

1. harness-plan：固定来源、运行时、权限、能力目标和必须执行的生命周期步骤。
2. loader-adapter：把统一生命周期翻译给一个具体加载器。
3. harness-report：只记录观察到的事实，不能自行授予 Verified。
4. registry-admission：在事实和信任门禁之后单独授予安装权限。

加载器绑定集中在 loader-adapters.json。主验证器按 install.adapter 加 integration.protocol 解析唯一适配器，并只允许加载 scripts/loader-adapters 目录中经仓库审阅的模块。插件不能指定任意 Adapter 代码或任意本机命令。

内置协议保留严格配对；中间加载器使用反向域名风格的 ID，例如 `dev.omdsh.mygo-v1` 与 `dev.omdsh.mygo-loader`。核心只校验安全 ID 和通用事实，不保存加载器类型枚举。提交使用 `management.method=loader-adapter`，但只有注册表中唯一匹配、版本固定的受信 Adapter 才能形成运行计划；无匹配、重复匹配或不可用都会 fail closed。

一个新的中间加载器只需提供：

- 一条 Adapter Registry 记录；
- 一个实现 run(step) 与 cleanup() 的小模块；
- 对 inspect、candidate install、ready、invoke、failure、remove、rollback 的契约测试；
- 固定加载器版本、权限与兼容范围；调度器从注册记录推导静态或受信执行边界，作者声明不能降低门禁；
- Registry v1 只认官方 Profile Bundle 边界。中间加载器可以把“加载器本身”封装成 Profile Bundle 获得安装权；它管理的下游插件保持 Catalog-only，不能借加载器身份提升权限。未来扩展安装权时仍须完整支持 candidate、故障隔离、升级、卸载、回滚和清理。

加载器缺能力时返回 blocked。不得把缺失步骤记作 skipped，也不得用加载成功代替真实能力调用。

## 版本矩阵

Profile Bundle 和受信中间加载器运行“作者精确声明版本 + 当前官方基线”。旧版本结果只进入兼容矩阵；只有当前官方基线结果能支持 Admission。Skill 走静态检查；MCP 走独立进程协议测试并保持 Catalog-only；Repository Plugin 在官方公共契约缺失时保持 blocked。

矩阵按固定源码、Adapter 版本、DSH 版本和 Harness 版本生成内容地址。只有这些输入变化时重跑，避免对全部 Topic 仓库反复执行。

## 人工门禁

- admission：只用于会执行固定第三方代码的 MCP/Profile。批准范围是一个精确 Release 和已展示的风险事实；通过后可自动形成证据 PR。
- production：提升同一份已签名 staging 制品到线上。

静态 Skill 不需要执行信任门禁。Topic 刷新和普通元数据更新不能触发 Admission。
