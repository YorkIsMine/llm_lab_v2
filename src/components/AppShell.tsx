"use client";

import { ChatSidebar } from "./ChatSidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-[rgb(var(--cyber-bg))] relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(0,245,255,0.06),transparent)] pointer-events-none" />
      <ChatSidebar />
      <main className="flex-1 flex flex-col min-w-0 relative">
        {children}
      </main>
    </div>
  );
}
