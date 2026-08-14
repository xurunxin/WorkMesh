import type { NextConfig } from 'next'
const nextConfig:NextConfig={
  output:'standalone',
  transpilePackages:['@workmesh/ui'],
}
export default nextConfig
