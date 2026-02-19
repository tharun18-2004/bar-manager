import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'BAR-LOGIC',
  description: 'Bar Management System',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white">{children}</body>
    </html>
  );
}