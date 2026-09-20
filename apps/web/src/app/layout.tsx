import type { Metadata } from 'next';
import './globals.css';
import { brand } from '../lib/brand';

export const metadata: Metadata = {
  title: { default: `${brand.name} | Project execution`, template: `%s | ${brand.name}` },
  description: 'A synthetic demonstration of a field-to-schedule bridge by BITS Pilani.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
