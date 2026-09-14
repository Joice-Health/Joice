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
 * The files live in apps/web/fonts, outside public/, so the licensed fonts are
 * only ever served hashed by next/font, never as raw downloads.
 */
const ginto = localFont({
  src: [
    { path: '../fonts/ABCGinto-Light.woff2', weight: '300', style: 'normal' },
    { path: '../fonts/ABCGinto-LightItalic.woff2', weight: '300', style: 'italic' },
  ],
  variable: '--font-ginto',
  display: 'swap',
});
const gintoNord = localFont({
  src: '../fonts/ABCGintoNordCondensed-Light.woff2',
  weight: '300',
  variable: '--font-ginto-nord',
  display: 'swap',
});
const gaisyr = localFont({
  src: '../fonts/ABCGaisyrMono-Light.woff2',
  weight: '300',
  variable: '--font-gaisyr',
  display: 'swap',
});

// Site-wide default, matching what the site sells today (sc-275 replaced the
// stale waitlist-era copy): prescription glutathione through the storefront.
// Pages with their own story (the waitlist, /states, the product pages)
// override it.
export const metadata: Metadata = {
  title: 'Joice · Clinician-guided peptide care',
  description:
    'Clinician-guided peptide care, priced near cost, on purpose. Prescription glutathione, reviewed by an independent licensed physician and compounded by a licensed 503A pharmacy.',
  openGraph: {
    title: 'Joice · Clinician-guided peptide care',
    description:
      'Clinician-guided peptide care, priced near cost, on purpose. Prescription glutathione, reviewed by an independent licensed physician and compounded by a licensed 503A pharmacy.',
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
        {/* Attentive's enhanced tag (sign-up units, returning-subscriber
            recognition), loaded the way Attentive ships it: async from the branded
            first-party host, with the CDN copy as the fallback when that request
            errors. Nothing from our code is pushed into it; what it collects is
            configured in the Attentive dashboard (docs/marketing/01-attentive.md). */}
        <Script
          id="attentive-tag"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(d){var s=d.createElement('script');s.async=true;s.src='https://cqvtq.joicehealth.com/joice/load';s.onerror=function(){var f=d.createElement('script');f.src='https://cdn.attn.tv/joice/dtag.js';d.head.appendChild(f);};d.head.appendChild(s);})(document);`,
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
