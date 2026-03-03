"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function MemoryRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  useEffect(() => {
    router.replace(`/chat/${id}?memory=1`);
  }, [id, router]);

  return (
    <div className="flex items-center justify-center flex-1 min-h-0">
      <span className="text-slate-500 text-xs">Открытие Memory Inspector…</span>
    </div>
  );
}
