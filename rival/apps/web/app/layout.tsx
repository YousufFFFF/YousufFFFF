import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RIVAL — Your friends. Your PRs. Your competition.',
  description:
    'Track your workouts, beat your PRs, and compete with the gym friends you actually train with. Private, connection-based competition.',
  applicationName: 'RIVAL',
  openGraph: {
    title: 'RIVAL — Your friends. Your PRs. Your competition.',
    description: 'Your gym friends just became your rivals. Track every set. Break your PR. Don’t fall behind.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#08080b',
  width: 'device-width',
  initialScale: 1,
  // Never block zoom — some people need it to read a dark interface.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
