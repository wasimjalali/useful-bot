export function UsefulBotLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2" aria-label="Useful Bot">
      <img
        src="/brand/useful-bot-mark.svg"
        alt=""
        width={32}
        height={32}
        className="size-8 shrink-0 rounded-sm bg-black"
      />
      {compact ? null : (
        <span className="text-[14px] font-semibold leading-none tracking-[-0.03em] text-ink">
          Useful Bot
        </span>
      )}
    </div>
  );
}
