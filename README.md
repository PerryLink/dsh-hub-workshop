# DSH Hub Workshop

The public catalog, review projection, and immutable feed authority for the OMDSH ecosystem. The production site is [hub.omdsh.dev](https://hub.omdsh.dev/), with [hub.0.org.cn](https://hub.0.org.cn/) as a byte-equivalent fallback.

The website is public and does not use visitor GitHub OAuth, a member allowlist, or a login session. Repository visibility is discovery evidence only: it never grants installation authority. Installable entries must be reviewed and emitted by `registry-v1.json` with an immutable source coordinate.

## Validate

```sh
npm ci
npm run validate
npm run deploy:dry-run
```

## Deploy

Production deployment replaces the existing `dsh-hub` Cloudflare Worker version for both hostnames. It requires only a Cloudflare deployment token and account ID; no GitHub visitor identity or OAuth secret is used by the Worker.

```sh
npm run deploy
```
