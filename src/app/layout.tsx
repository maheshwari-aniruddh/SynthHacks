import type { Metadata } from "next";
import "./globals.css";
import { DnsRedirect } from "@/components/dns-redirect";

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
    <html lang="en">
      <body
        className="font-body antialiased bg-surface-2 text-ink"
      >
        <DnsRedirect />
        {children}
      </body>
    </html>
  );
}
