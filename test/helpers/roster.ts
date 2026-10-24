import { DEFAULT_BOT_ID, seedStore, type ShellBot, type ShellStore } from "../../shared/shell-store.ts";

let seq = 0;

/**
 * A roster with more bots than the app makes any more. `createBot` is gone, so
 * tests that need an earlier-build roster (a second bot, a group, an archived
 * bot) build it the way an old shell.json held it: a copy of the Generalist
 * under another id, with the given fields on top.
 */
export function withBot(
  store: ShellStore,
  name: string,
  patch: Partial<ShellBot> = {},
): { store: ShellStore; id: string } {
  seq += 1;
  const id = patch.id ?? `bot-test-${seq}`;
  const base = store.bots.find((bot) => bot.id === DEFAULT_BOT_ID) ?? seedStore().bots[0];
  const at = new Date().toISOString();
  const bot: ShellBot = {
    ...base,
    id,
    kind: "bot",
    name,
    petname: null,
    label: "",
    description: "",
    sessionId: null,
    lastPreview: "",
    lastAt: null,
    createdAt: at,
    updatedAt: at,
    avatarCustom: true,
    workspace: null,
    model: null,
    profileRevision: 0,
    ...patch,
  };
  return { store: { ...store, bots: [...store.bots, bot] }, id };
}
