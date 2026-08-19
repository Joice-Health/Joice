import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import Script from 'next/script';
import { Providers } from './providers';
import './globals.css';

const GTM_ID = 'GTM-TKJRXFML';

/**
 * The three Dinamo faces, Light only (the only cuts we license). Text and
 * labels are set in Ginto and Gaisyr Mono; Ginto Nord Condensed is the
 * uppercase display voice. `theme.css` maps them to font-sans/display/mono.
 */
const ginto = localFont({
  src: [
    { path: '../public/fonts/ABCGinto-Light.woff2', weight: '300', style: 'normal' },
    { path: '../public/fonts/ABCGinto-LightItalic.woff2', weight: '300', style: 'italic' },
  ],
  variable: '--font-ginto',
  display: 'swap',
});
const gintoNord = localFont({
  src: '../public/fonts/ABCGintoNordCondensed-Light.woff2',
  weight: '300',
  variable: '--font-ginto-nord',
  display: 'swap',
});
const gaisyr = localFont({
  src: '../public/fonts/ABCGaisyrMono-Light.woff2',
  weight: '300',
  variable: '--font-gaisyr',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Joice · The future of peptide medicine',
  description:
    'Join the Joice waitlist. AI-guided peptides and supplements, with real clinical governance. Refer friends to move up the line.',
  openGraph: {
    title: 'Joice · The future of peptide medicine',
    description: 'Join the waitlist for AI-guided peptides and supplements.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#f5f0e9',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${ginto.variable} ${gintoNord.variable} ${gaisyr.variable}`}>
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
