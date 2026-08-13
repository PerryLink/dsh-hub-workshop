# DSH Hub Workshop

The public catalog, review projection, and immutable feed authority for the OMDSH ecosystem. The production site is [hub.omdsh.dev](https://hub.omdsh.dev/), with [hub.0.org.cn](https://hub.0.org.cn/) as a byte-equivalent fallback.

The website is public and does not use visitor GitHub OAuth, a member allowlist, or a login session. Repository visibility is discovery evidence only: it never grants installation authority. Installable entries must be reviewed and emitted by `registry-v1.json` with an immutable source coordinate.

The `dsh-plugin` Topic is a candidate source, not the Catalog. `topic-plugin-audit.json` requires file-level plugin evidence and excludes core products, ecosystem infrastructure, distributions, awesome lists, documentation, templates, standalone applications, placeholders, unavailable private sources, and Topic-only repositories. Run `npm run topic:audit` to refresh the evidence report and `npm run topic:apply` to apply it to an existing Catalog snapshot.

`registry-admissions.json` is the review source. `npm run feeds:build` verifies each evidence digest and regenerates the Catalog, Registry, Workshop, Run Record, Recipe, Collection, and Agent ecosystem projections deterministically. The public Registry artifact is unsigned and reproducible; a remote consumer must still verify the production Ed25519 signature, while a bundled consumer snapshot may explicitly accept the unsigned build artifact.

## Validate

```sh
npm ci
npm run feeds:build
npm run validate
npm run deploy:dry-run
```

## Deploy

Production deployment replaces the existing `dsh-hub` Cloudflare Worker version for both hostnames. It requires only a Cloudflare deployment token and account ID; no GitHub visitor identity or OAuth secret is used by the Worker.

```sh
npm run deploy
```
