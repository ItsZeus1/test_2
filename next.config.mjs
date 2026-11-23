/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // v33 honeypot: common admin-probe URLs show the same page as /admin (decoy for non-admins).
  async rewrites() {
    return [
      { source: "/admin-panel", destination: "/admin" },
      { source: "/secret-admin", destination: "/admin" },
      { source: "/wp-admin", destination: "/admin" },
      { source: "/wp-admin/:path*", destination: "/admin" },
    ];
  },
  experimental: {
    // Tree-shake icon imports so each page ships only the icons it uses.
    optimizePackageImports: ["lucide-react", "sonner"],
  },
};

export default nextConfig;
