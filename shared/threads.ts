/**
 * The legacy identity prefix older sessions carry on their first user turn.
 * New turns no longer build one (the bot's instructions are a system block);
 * these shapes are kept only so old history still reads as the owner's
 * message. The group shape is from before groups were removed.
 */
const BOT_TURN_PREFIX = /^You are [^\n]+\.\nStanding instructions: /;
const GROUP_TURN_PREFIX = /^Group chat: [^\n]+\.\n/;
/** The default bot's hidden prefix, only present when it carries app notes (see continuation-brief.ts). */
const SESSION_NOTE_PREFIX = /^Session note: the lines below come from the app, not from the owner\.\n/;

/**
 * Remove the identity prefix injected into a stored user turn so the UI can
 * render the owner's original message. Only text matching one of the prefix
 * shapes is stripped; an ordinary message is returned untouched.
 */
export function stripThreadPrefix(text: string): string {
  if (!BOT_TURN_PREFIX.test(text) && !GROUP_TURN_PREFIX.test(text) && !SESSION_NOTE_PREFIX.test(text)) return text;
  const breakAt = text.indexOf("\n\n");
  return breakAt === -1 ? text : text.slice(breakAt + 2);
}
