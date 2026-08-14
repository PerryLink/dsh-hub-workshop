# DSH Hub Workshop

OMDSH 生态的公开市场、插件目录、审核投影和不可变 Feed 权威源。生产站点是 [hub.omdsh.dev](https://hub.omdsh.dev/)，[hub.0.org.cn](https://hub.0.org.cn/) 提供字节一致的备用入口。

网站完全公开，不使用访客 GitHub OAuth、成员白名单或登录会话。仓库公开只构成发现证据，不自动授予安装权限；可安装条目必须经过审核，并由 `registry-v1.json` 发布固定来源坐标。

市场分为三个独立层级：叶子插件仍由 `catalog.json` 管理；生态基础设施和社区发行版由 `market-layers.json` 人工策展；安装权限仍只来自 `registry-v1.json`。所以基础设施和发行项目可以进入市场展示，但不能被标成插件或直接安装。Awesome 清单、纯文档仓、模板、占位项目以及只有热度或 Topic 的仓库仍不进入任何市场层。

这套架构把生产分散给作者、把信任事实集中到 Workshop：源码、Issue 与 Release 仍由作者仓库持有；Workshop 只记录不可变来源、分类、审核状态和验证证据。市场可见、插件资格、当前基线验证、Registry 准入是四个独立状态。

`dsh-plugin` Topic 只是候选发现源，不等于 Catalog。`topic-plugin-audit.json` 要求文件级插件证据，并从插件层排除主产品、生态基础设施、发行版、awesome 清单、文档、模板、独立应用、占位仓、不可用的私有来源以及只有 Topic 没有插件契约的仓库。运行 `npm run topic:audit` 刷新证据报告，运行 `npm run topic:apply` 把结果应用到现有 Catalog 快照。

`registry-admissions.json` 是审核源。`npm run feeds:build` 会核对每份证据的摘要，并确定性地重新生成 Catalog、Registry、Workshop、Run Record、Recipe、Collection 和 Agent 生态投影。公开 Registry 构建产物可复现但不带签名；远端消费端仍必须校验生产 Ed25519 签名，只有随消费端一起锁定的内置快照才可显式接受无签名构建产物。

## 验证

```sh
npm ci
npm run feeds:build
npm run validate
npm run deploy:dry-run
```

## 部署

生产部署会同时替换两个域名使用的 `dsh-hub` Cloudflare Worker 版本。部署只需要 Cloudflare 部署令牌和账号 ID；Worker 不读取访客 GitHub 身份或 OAuth Secret。

```sh
npm run deploy
```
