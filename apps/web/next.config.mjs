/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@meet-copilot/shared'],
  async headers() {
    return [
      {
        // /panel é carregado em iframe pelo side panel da extensão Chrome
        source: '/panel/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' chrome-extension://*",
          },
        ],
      },
    ]
  },
}

export default nextConfig
