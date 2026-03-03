export default function HomePage() {
  return (
    <div className="flex-1 flex items-center justify-center p-8 relative">
      <p className="text-[rgb(var(--cyber-muted))] text-center text-sm max-w-md leading-relaxed uppercase tracking-wider">
        Создайте новый чат или выберите существующий в списке слева.
      </p>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-32 h-px bg-gradient-to-r from-transparent via-[rgba(0,245,255,0.4)] to-transparent" />
    </div>
  );
}
