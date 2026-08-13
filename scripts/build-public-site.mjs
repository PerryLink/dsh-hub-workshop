#!/usr/bin/env node

import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const TARGET = resolve(ROOT, '.public-site')
const FILES = [
  'api/v1/ecosystem.json',
  'api/v1/plugin-types.json',
  'api/v1/plugins.json',
  'assets/atlas-symbol.png',
  'assets/app.js',
  'assets/discovery.js',
  'assets/i18n.json',
  'assets/site.js',
  'assets/styles.css',
  'assets/workshop-hero-v2.webp',
  'candidates-v1.json',
  'catalog.json',
  'collections-v1.json',
  'community-v1.json',
  'configurations.html',
  'contributing.html',
  'developer-guide.html',
  'ecosystem-repositories.json',
  'index.html',
  'install.html',
  'plugins.html',
  'projects.html',
  'publish.html',
  'public-discovery.json',
  'recipes-v1.json',
  'registry-v1.json',
  'registry.html',
  'topic-repositories.json',
  'workshop-v1.json',
]

await rm(TARGET, { recursive: true, force: true })
for (const path of FILES) {
  const target = resolve(TARGET, path)
  await mkdir(dirname(target), { recursive: true })
  await cp(resolve(ROOT, path), target)
}
console.log(`built public site with ${FILES.length} allowlisted files`)
