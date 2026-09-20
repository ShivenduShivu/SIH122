import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@intelligrid/contracts', '@intelligrid/domain'],
  poweredByHeader: false,
};
export default config;
