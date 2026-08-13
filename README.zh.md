# DSH Hub Workshop

OMDSH 生态的公开目录、审核投影和不可变 Feed 权威源。生产站点是 [hub.omdsh.dev](https://hub.omdsh.dev/)，[hub.0.org.cn](https://hub.0.org.cn/) 提供字节一致的备用入口。

网站完全公开，不使用访客 GitHub OAuth、成员白名单或登录会话。仓库公开只构成发现证据，不自动授予安装权限；可安装条目必须经过审核，并由 `registry-v1.json` 发布固定来源坐标。

`dsh-plugin` Topic 只是候选发现源，不等于 Catalog。`topic-plugin-audit.json` 要求文件级插件证据，并排除主产品、生态基础设施、发行版、awesome 清单、文档、模板、独立应用、占位仓、不可用的私有来源以及只有 Topic 没有插件契约的仓库。运行 `npm run topic:audit` 刷新证据报告，运行 `npm run topic:apply` 把结果应用到现有 Catalog 快照。

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
