import type { Metadata } from 'next';
import { Fraunces, IBM_Plex_Mono } from 'next/font/google';
import { env } from '@/env';
import './globals.css';
import Script from 'next/script';
import Providers from './providers';

// Display: Fraunces — a high-contrast "old-style" serif with optical sizing,
// for the almanac/star-atlas headings. Data: IBM Plex Mono — ledger-grade,
// legible at small sizes for on-chain identifiers. (No Inter/Roboto/Geist.)
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'chainbard — on-chain stories',
  description: 'Every wallet, transaction, NFT, and token has a story.',
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  openGraph: {
    title: 'chainbard — on-chain stories',
    description: 'Every wallet, transaction, NFT, and token has a story.',
    siteName: 'chainbard',
    url: env.NEXT_PUBLIC_APP_URL,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'chainbard — on-chain stories',
    description: 'Every wallet, transaction, NFT, and token has a story.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexMono.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <head>
        {process.env.NODE_ENV === 'development' && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </head>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
