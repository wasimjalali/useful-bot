type MarkTone = "dark" | "light";

/* Useful Bot mark: rounded command card + prompt caret.
   Same construction as Useful Brain (outline container, one interior glyph).
   Keep paths in sync with macos/assets/useful-bot-mark.svg and AppIcon.svg. */

const FRAME =
  "M20 0h180a20 20 0 0 1 20 20v202a20 20 0 0 1-20 20H20A20 20 0 0 1 0 222V20A20 20 0 0 1 20 0Zm0 14h180a6 6 0 0 1 6 6v202a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6Z";

const CARET = "M72 78 128 121 72 164l18 0 56-43-56-43z";

function markColors(tone: MarkTone) {
  const ink = tone === "dark" ? "#fafafa" : "#171717";
  return { ink };
}

export function UsefulBotMarkPaths({ ink }: { ink: string }) {
  return (
    <>
      <path fill={ink} fillRule="evenodd" d={FRAME} />
      <path fill={ink} d={CARET} />
    </>
  );
}

export function UsefulBotMark({
  tone = "light",
  className,
}: {
  tone?: MarkTone;
  className?: string;
}) {
  const colors = markColors(tone);
  return (
    <svg viewBox="0 0 220 242" fill="none" className={className} aria-hidden="true">
      <UsefulBotMarkPaths {...colors} />
    </svg>
  );
}

export function UsefulBotAvatar({ className }: { className?: string }) {
  return (
    <span
      className={["grid size-8 shrink-0 place-items-center rounded-xl bg-brand", className]
        .filter(Boolean)
        .join(" ")}
    >
      <UsefulBotMark tone="dark" className="h-[20px] w-auto" />
    </span>
  );
}

export function UsefulBotLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2" aria-label="Useful Bot">
      <UsefulBotMark tone="light" className="h-7 w-auto shrink-0" />
      {compact ? null : (
        <span className="translate-y-px text-[14px] font-bold leading-none tracking-[-0.03em] text-ink">
          Useful Bot
        </span>
      )}
    </div>
  );
}
