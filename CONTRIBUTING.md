# Contributing

Submit a public repository URL, an immutable 40-character commit, the exact plugin path, license, declared compatibility, and risk facts. A public repository or `dsh-plugin` topic does not automatically enter the install Registry.

Before opening a pull request, run:

```sh
npm ci
npm run validate
npm run deploy:dry-run
```
