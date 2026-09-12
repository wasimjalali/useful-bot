type MarkTone = "dark" | "light";

/* Useful Bot mark: a rounded terminal/chat frame with a prompt caret.
   Geometrically simple, single ink, reads at 16px and at 512px. */

const FRAME =
  "M46 8h128a38 38 0 0 1 38 38v104a38 38 0 0 1-38 38H98l-34 30v-30H46a38 38 0 0 1-38-38V46A38 38 0 0 1 46 8Zm0 14A24 24 0 0 0 22 46v104a24 24 0 0 0 24 24h26a8 8 0 0 1 8 8v14l20-18a8 8 0 0 1 5.3-2H174a24 24 0 0 0 24-24V46a24 24 0 0 0-24-24Z";

const CARET =
  "M64 62h58a8 8 0 0 1 8 8v50a8 8 0 0 1-16 0V78H64a8 8 0 0 1 0-16Z";

const PROMPT =
  "M64 130h44a8 8 0 0 1 0 16H64a8 8 0 0 1 0-16Zm60 0h28a8 8 0 0 1 0 16h-28a8 8 0 0 1 0-16Z";

function markColors(tone: MarkTone) {
  const ink = tone === "dark" ? "#fafafa" : "#171717";
  return { ink };
}

export function UsefulBotMarkPaths({ ink }: { ink: string }) {
  return (
    <>
      <path fill={ink} fillRule="evenodd" d={FRAME} />
      <path fill={ink} d={CARET} />
      <path fill={ink} opacity={0.45} d={PROMPT} />
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
    <svg viewBox="0 0 220 226" fill="none" className={className} aria-hidden="true">
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
