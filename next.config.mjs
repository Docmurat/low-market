/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  experimental: {
    // Загрузка фото модераторами идёт через server action — по умолчанию лимит 1 МБ.
    serverActions: { bodySizeLimit: '10mb' },
  },
};
export default nextConfig;
