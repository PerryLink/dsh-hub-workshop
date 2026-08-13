const PRIVATE_PATHS = new Set([
  '/access',
  '/api/session',
  '/__atlas_404_v2.shell',
  '/__atlas_access_v3.shell',
  '/__atlas_waiting_v3.shell',
])

function notFound() {
  return new Response(null, {
    status: 404,
    headers: { 'cache-control': 'public, max-age=0, must-revalidate' },
  })
}

function isPrivatePath(pathname) {
  return PRIVATE_PATHS.has(pathname) || pathname.startsWith('/auth/')
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
    "default-src 'self'; base-uri 'self'; connect-src 'self'; frame-ancestors 'none'; img-src 'self' https://github.com https://avatars.githubusercontent.com https://raw.githubusercontent.com data:; object-src 'none'; script-src 'self'; style-src 'self'",
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
    return withPublicHeaders(await env.ASSETS.fetch(request))
  },
}

export const __test = { isPrivatePath }
