import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

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
      <body className={`${inter.className} min-h-screen text-[rgb(var(--cyber-text))]`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
