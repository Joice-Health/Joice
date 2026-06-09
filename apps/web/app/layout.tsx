import type { Metadata, Viewport } from 'next';
import { Yantramanav, Geist_Mono } from 'next/font/google';
import { Providers } from './providers';
import { AmbientBackground } from '@/components/ambient-background';
import './globals.css';

const yantramanav = Yantramanav({
  variable: '--font-yantramanav',
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
});
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Joice — The future of peptide medicine',
  description:
    'Join the Joice waitlist. AI-guided peptides and supplements, with real clinical governance. Refer friends to move up the line.',
  openGraph: {
    title: 'Joice — The future of peptide medicine',
    description: 'Join the waitlist for AI-guided peptides and supplements.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#fbfbf8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${yantramanav.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        <AmbientBackground />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
