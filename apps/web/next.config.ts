import type { NextConfig } from 'next';
import { resolve } from 'node:path';
// Only a real HTTPS deployment may pin HSTS; localhost and plain-HTTP demos must not.
const httpsOrigin = process.env.APP_ORIGIN?.startsWith('https://') ?? false;
const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: resolve(import.meta.dirname, '../..'),
  transpilePackages: ['@intelligrid/contracts', '@intelligrid/domain'],
  poweredByHeader: false,
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        ...(httpsOrigin
          ? [
              {
                key: 'Strict-Transport-Security',
                value: 'max-age=31536000; includeSubDomains',
              },
            ]
          : []),
        { key: 'X-Frame-Options', value: 'DENY' },
        // Keep same-origin form Origin headers: no-referrer makes Chrome send Origin: null.
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        // Embedding/base restrictions, not a complete script CSP. Next scripts remain enabled.
        {
          key: 'Content-Security-Policy',
          value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
        },
      ],
    },
  ],
};
export default config;
