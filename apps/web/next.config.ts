import type { NextConfig } from 'next'
// `/api`, `/.well-known`, `/auth`, `/mcp`, `/sse` are proxied to the API host so
// the Browser stays same-origin with the Web server. That is not a dev-only
// convenience: the session cookie is set by the API, so when the Browser talks to
// a different origin the cookie becomes third-party, is not sent back, and every
// protected page bounces the Human to /login immediately after a successful
// sign-in - while the API logs stay clean. Proxying by default keeps the cookie
// first-party on whichever host the Human opened.
//
// Deployments that genuinely serve the SPA and the API from one origin keep the
// old behaviour by setting WORKMESH_WEB_SAME_ORIGIN_API=1.
const apiUpstream = process.env.NEXT_API_UPSTREAM ?? process.env.NEXT_DEV_API_UPSTREAM ?? 'http://localhost:3001'
const sameOriginApi = process.env.WORKMESH_WEB_SAME_ORIGIN_API === '1'
const nextConfig:NextConfig={
  output:'standalone',
  transpilePackages:['@workmesh/ui', '@workmesh/contracts'],
  webpack: config => {
    // Workspace packages ship TypeScript sources and use NodeNext-style
    // `.js` specifiers; teach webpack to resolve them to `.ts`/`.tsx`.
    config.resolve.extensionAlias = {
      '.js': ['.tsx', '.ts', '.jsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
  async rewrites() {
    if (sameOriginApi) return []
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
