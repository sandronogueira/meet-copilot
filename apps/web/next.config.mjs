/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@meet-copilot/shared'],
  experimental: {
    serverActions: {
      // uploads das bases de conhecimento (PDF/DOCX/XLSX até 15MB) + avatar do clone
      bodySizeLimit: '20mb',
    },
  },
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
