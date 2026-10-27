import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Κοστολόγηση · Παπαχρήστου',
  description: 'Κοστολόγηση πιάτων για το Ψητοπωλείο Παπαχρήστου',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#16202a' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Commissioner:wght@400;500;600;700&display=swap&subset=greek"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
