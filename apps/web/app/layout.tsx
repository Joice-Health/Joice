import type { Metadata, Viewport } from 'next';
import { Yantramanav, Geist_Mono } from 'next/font/google';
import Script from 'next/script';
import { Providers } from './providers';
import './globals.css';

const GTM_ID = 'GTM-TKJRXFML';

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
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        <Script
          id="gtm"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
