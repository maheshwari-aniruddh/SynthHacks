import type { Metadata } from "next";
import { Playfair_Display, Inter, JetBrains_Mono } from 'next/font/google';
import "./globals.css";

const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-display', style: ['normal','italic'] });
const inter = Inter({ subsets: ['latin'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: "radpi",
  description: "Diagnostic Intelligence, At the Point of Care",
  icons: {
    icon: "/favicon-new.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${playfair.variable} ${inter.variable} ${mono.variable} font-body antialiased bg-surface-2 text-ink`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
