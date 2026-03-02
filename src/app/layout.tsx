import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Lab — Chat",
  description: "Chat with LLM and memory (short / working / long-term)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased bg-zinc-950 text-zinc-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
