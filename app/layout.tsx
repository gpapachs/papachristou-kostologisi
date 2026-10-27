import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Κοστολόγηση · Παπαχρήστου',
  description: 'Κοστολόγηση πιάτων για το Ψητοπωλείο Παπαχρήστου',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#faf7f2' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body>{children}</body>
    </html>
  );
}
