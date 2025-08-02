/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  transpilePackages: ['@agentmark/agentmark-core', '@agentmark/shared-utils'],
}

module.exports = nextConfig