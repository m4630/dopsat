import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Dopsat. | Dopisování testů',
  description: 'Přehledná rezervace a správa termínů dopisování testů na ITG.',
  openGraph: {
    title: 'Dopsat. | Dopisování testů',
    description: 'Podívej se na volné termíny, přihlas se a přijď.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Dopsat. – dopisování testů' }],
  },
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="cs"><body>{children}</body></html>;
}
