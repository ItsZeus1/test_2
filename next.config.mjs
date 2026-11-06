/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    // Tree-shake icon imports so each page ships only the icons it uses.
    optimizePackageImports: ["lucide-react", "sonner"],
  },
};

export default nextConfig;
