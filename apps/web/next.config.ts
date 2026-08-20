import type { NextConfig } from 'next'
// In dev we proxy `/api`, `/.well-known`, `/auth`, `/mcp`, `/sse` to a separate
// API host so the browser can stay same-origin with the dev server. In
// production (next start) the proxy is unnecessary; the same server answers
// both the SPA and the API.
const apiUpstream = process.env.NEXT_DEV_API_UPSTREAM ?? 'http://localhost:3001'
const nextConfig:NextConfig={
  output:'standalone',
  transpilePackages:['@workmesh/ui'],
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return []
    return [{
      source: '/api/:path*',
      destination: `${apiUpstream}/api/:path*`,
    }, {
      source: '/.well-known/:path*',
      destination: `${apiUpstream}/.well-known/:path*`,
    }, {
      source: '/auth/:path*',
      destination: `${apiUpstream}/auth/:path*`,
    }, {
      source: '/mcp/:path*',
      destination: `${apiUpstream}/mcp/:path*`,
    }, {
      source: '/sse/:path*',
      destination: `${apiUpstream}/sse/:path*`,
    }]
  },
}
export default nextConfig
