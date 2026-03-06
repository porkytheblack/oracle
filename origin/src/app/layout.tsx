import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Oracle — by dterminal",
  description: "VASP regulation research agent. Catalog-driven QA, no RAG.",
  openGraph: {
    title: "Oracle — by dterminal",
    description: "VASP regulation research agent. Catalog-driven QA, no RAG.",
    images: [{ url: "/og-data.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Oracle — by dterminal",
    description: "VASP regulation research agent. Catalog-driven QA, no RAG.",
    images: ["/og-data.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
