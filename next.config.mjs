// Στατική εφαρμογή για GitHub Pages.
// Το NEXT_PUBLIC_BASE_PATH το βάζει αυτόματα το GitHub Actions (π.χ. /papachristou-kostologisi).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
