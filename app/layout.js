import './globals.css';

export const metadata = {
  title: 'BAR-LOGIC',
  description: 'Bar Management System',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-white">{children}</body>
    </html>
  );
}
