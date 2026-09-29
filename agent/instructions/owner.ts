import { defineDynamic, defineInstructions } from "eve/instructions";
import { ownerName } from "../../shared/operator.ts";

/**
 * Who owns this Mac, by the account's own name, so every install's bots know
 * their own owner rather than a name written into the prompt.
 */
let cached: string | undefined;

export function ownerContext(): string {
  // The account name doesn't change while the service runs.
  cached ??= ownerName();
  const name = cached;
  return [
    "# Your owner",
    "",
    `Your owner is ${name}, the person signed in to this Mac. "The owner" in these instructions means them. Call them by their first name when it reads naturally.`,
  ].join("\n");
}

export default defineDynamic({
  events: {
    "turn.started": () => {
      try {
        return defineInstructions({ content: ownerContext() });
      } catch (error) {
        // Naming the owner is a courtesy; it must never fail a turn.
        console.error("[instructions] owner context unavailable", error);
        return null;
      }
    },
  },
});
