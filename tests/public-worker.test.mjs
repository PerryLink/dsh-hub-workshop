import assert from 'node:assert/strict'
import test from 'node:test'

import publicWorker, { __test } from '../worker/public.js'

function env() {
  return {
    ASSETS: {
      fetch: async (request) => new Response(`asset:${new URL(request.url).pathname}`, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    },
  }
}

test('the public catalog is anonymous and indexable', async () => {
  const response = await publicWorker.fetch(new Request('https://hub.omdsh.dev/'), env())
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'asset:/')
  assert.equal(response.headers.get('cache-control'), 'public, max-age=0, must-revalidate')
  assert.equal(response.headers.get('x-robots-tag'), null)
})

test('retired login and private session endpoints remain unavailable', async () => {
  for (const path of ['/access', '/api/session', '/auth/github', '/auth/callback', '/auth/logout']) {
    assert.equal(__test.isPrivatePath(path), true, path)
    const response = await publicWorker.fetch(new Request(`https://hub.omdsh.dev${path}`), env())
    assert.equal(response.status, 404, path)
    assert.equal(await response.text(), '', path)
  }
})

test('public feeds, project directory, and repository mappings require no session', async () => {
  for (const path of ['/catalog.json', '/registry-v1.json', '/recipes-v1.json', '/api/v1/ecosystem.json', '/ecosystem-repositories.json', '/public-discovery.json', '/topic-repositories.json', '/projects.html']) {
    const response = await publicWorker.fetch(new Request(`https://hub.omdsh.dev${path}`), env())
    assert.equal(response.status, 200, path)
    assert.equal(await response.text(), `asset:${path}`, path)
  }
})
