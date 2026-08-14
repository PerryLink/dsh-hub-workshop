const PRIVATE_PATHS = new Set([
  '/access',
  '/api/session',
  '/__atlas_404_v2.shell',
  '/__atlas_access_v3.shell',
  '/__atlas_waiting_v3.shell',
])

const ANALYTICS_BEACON_URL = 'https://static.cloudflareinsights.com/beacon.min.js'

function notFound() {
  return new Response(null, {
    status: 404,
    headers: { 'cache-control': 'public, max-age=0, must-revalidate' },
  })
}

function isPrivatePath(pathname) {
  return PRIVATE_PATHS.has(pathname) || pathname.startsWith('/auth/')
}

function analyticsTokenFor(hostname, env) {
  const token = hostname.toLowerCase() === 'hub.0.org.cn'
    ? env?.CF_WEB_ANALYTICS_TOKEN_ZERO_ORG_CN
    : null
  return typeof token === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(token) ? token : null
}

async function withWebAnalytics(request, response, env) {
  const contentType = response.headers.get('content-type') || ''
  const token = analyticsTokenFor(new URL(request.url).hostname, env)
  if (!contentType.includes('text/html') || !token) return response

  const html = await response.text()
  if (!/<\/head>/i.test(html) || html.includes(ANALYTICS_BEACON_URL)) {
    return new Response(html, response)
  }

  const beacon = `<script defer src="${ANALYTICS_BEACON_URL}" data-cf-beacon='${JSON.stringify({ token })}'></script>`
  const headers = new Headers(response.headers)
  headers.delete('content-encoding')
  headers.delete('content-length')
  headers.delete('etag')

  return new Response(html.replace(/<\/head>/i, `  ${beacon}\n</head>`), {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function withPublicHeaders(response) {
  const secured = new Response(response.body, response)
  secured.headers.set('x-content-type-options', 'nosniff')
  secured.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  secured.headers.set('x-frame-options', 'DENY')
  secured.headers.set('cross-origin-opener-policy', 'same-origin')
  secured.headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()')
  secured.headers.set(
    'content-security-policy',
    "default-src 'self'; base-uri 'self'; connect-src 'self' https://cloudflareinsights.com; frame-ancestors 'none'; img-src 'self' https://github.com https://avatars.githubusercontent.com https://raw.githubusercontent.com data:; object-src 'none'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'",
  )

  const contentType = secured.headers.get('content-type') || ''
  if (contentType.includes('text/html')) {
    secured.headers.set('cache-control', 'public, max-age=0, must-revalidate')
  }
  return secured
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (isPrivatePath(url.pathname)) return withPublicHeaders(notFound())
    const asset = await env.ASSETS.fetch(request)
    return withPublicHeaders(await withWebAnalytics(request, asset, env))
  },
}

export const __test = { analyticsTokenFor, isPrivatePath }
