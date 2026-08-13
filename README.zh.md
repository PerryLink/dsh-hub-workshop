# DSH Hub Workshop

OMDSH 生态的公开目录、审核投影和不可变 Feed 权威源。生产站点是 [hub.omdsh.dev](https://hub.omdsh.dev/)，[hub.0.org.cn](https://hub.0.org.cn/) 提供字节一致的备用入口。

网站完全公开，不使用访客 GitHub OAuth、成员白名单或登录会话。仓库公开只构成发现证据，不自动授予安装权限；可安装条目必须经过审核，并由 `registry-v1.json` 发布固定来源坐标。

## 验证

```sh
npm ci
npm run validate
npm run deploy:dry-run
```

## 部署

生产部署会同时替换两个域名使用的 `dsh-hub` Cloudflare Worker 版本。部署只需要 Cloudflare 部署令牌和账号 ID；Worker 不读取访客 GitHub 身份或 OAuth Secret。

```sh
npm run deploy
```
