import type { Metadata } from 'next';
import { Inter, Poppins, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const poppins = Poppins({
  weight: ['400', '500', '600', '700', '800'],
  subsets: ['latin'],
  variable: '--font-heading',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Soberania AI · Appliance Educacional On-Premises',
  description:
    'Plataforma educacional com tutoria socrática por Inteligência Artificial, RAG híbrido e 100% de soberania de dados on-premises.',
  openGraph: {
    title: 'Soberania AI · Appliance Educacional On-Premises',
    description:
      'Plataforma educacional com tutoria socrática por Inteligência Artificial, RAG híbrido e 100% de soberania de dados on-premises.',
    url: 'https://soberania.local',
    siteName: 'Soberania AI',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Soberania AI · Appliance Educacional On-Premises',
    description:
      'Plataforma educacional com tutoria socrática por Inteligência Artificial, RAG híbrido e 100% de soberania de dados on-premises.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`h-full ${inter.variable} ${poppins.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-full flex flex-col antialiased bg-brand-canvas text-brand-ink font-sans">
        {children}
      </body>
    </html>
  );
}
