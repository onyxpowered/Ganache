/** @type {import('next').NextConfig} */
export default {
  output: 'export',
  devIndicators: false,
  distDir: process.env.NODE_ENV === 'production' ? '../app' : '.next',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
}
