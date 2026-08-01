// Global CORS middleware — allow the official site (localhost:4321) and
// any localhost origin to call workbench APIs from the browser.
export default defineEventHandler((event) => {
  const origin = getRequestHeader(event, 'origin')
  const allowed = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

  if (origin && allowed.test(origin)) {
    setResponseHeaders(event, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Agent-Token, x-agent-token',
      'Access-Control-Max-Age': '86400',
    })
  }

  if (getMethod(event) === 'OPTIONS') {
    return null
  }
})
