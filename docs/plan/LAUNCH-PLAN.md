# Launch plan (macOS)

Written 2026-09-28, after PR #145 (first run, settings, feedback Worker). What's left before the
macOS app ships to users, split into one PR per session.

## How each session runs

1. Open the session with this file and the PR's section below.
2. Settle that PR's master prompt and master plan together with Wasim. The section below is a
   starting point, not a spec.
3. Build, verify live in the running app (screenshots, and 60 fps frame-by-frame review for
   anything that moves), review (SWE-2 plus one Opus 5.5 reviewer), fix, merge, install.
4. No `perf:check` per PR. It runs once, in PR 6.

The mobile app (its own worktree) waits until after launch.

## PR 1: Web app decision

**Decided 2026-09-28: removed.** The browser UI is gone, `/` returns a plain status, and Tailwind
went with it. The notes below are the question as it was asked.

- **What exists:** `web/` is two things. One is the Next.js API (`web/app/api`, 15 route groups,
  plus the eve proxy in `web/app/eve`). The Mac app talks to it, so it stays either way. The
  other is the browser UI (`web/app/page.tsx` and its components, about 5,500 lines of TSX plus
  1,280 of CSS).
- **Keep it:** making it pixel-identical to macOS means redoing every Mac screen in React, then
  keeping the two in step on every future change. That's several PRs now, plus a tax on every
  PR after.
- **Remove it (recommended):** delete the browser UI and keep the API service. The Mac app is the
  product, the phone app will use the same API, and nothing in launch needs a browser UI. Git
  history keeps it if it ever comes back.
- **Done when:** the decision is made. If it's removal: the UI is gone, `/` returns a plain
  status, `build:app` and the Mac app still work, and the rules in `CLAUDE.md` ("Surfaces and
  priority") are updated.

## PR 2: Bot character

The bots are the brand. Make them feel cute and premium.

- **Head shape:** a true circle.
- **Working animation:** redo the animation shown while a bot is working.
- **Rail:** motion for the bot in the sidebar.
- **Session shape:** Opus 5.5 first studies the current avatars (`NativeAvatar.swift`,
  `OperatorAvatar.swift`, `FacePalette.swift`, `BrandMotion.swift`) and proposes the shape and the
  motions as a design (a canvas is fine). Wasim picks, then it gets built.
- **Done when:**
  - Heads are circles at every size.
  - The animations pass 60 fps frame-by-frame review with reduced motion respected.
  - Idle CPU with a working bot stays near today's.

## PR 3: UX polish pass

- **What:** Opus 5.5 audits every user-facing surface of the Mac app and proposes subtle
  improvements (visuals, spacing, motion, copy, empty and error states) where it can do better
  than today. The surfaces are the rail, chat, composer, cards, settings, first run, popovers and
  the Library.
- **How:** the audit is a ranked list with a screenshot and a one-line why for each item. Wasim
  picks, then the picks are built.
- **Carried over from #145:**
  - Disabled buttons use 55% opacity instead of the mockup's sunken look.
  - The appearance switch is instant.
  - The entrance into a large existing chat drops frames.
- **Bug to fix in this PR (reported 2026-09-28): attached images show as a path, not a picture.**
  - **Seen:** attach an image in the composer and send it with a message. The sent user message
    shows the image's file name or path as text. It doesn't show the picture.
  - **Wanted:**
    - The composer shows a small preview of each attached image before sending.
    - The sent user message shows the image a bit larger, above the message text.
    - The picture stays after a relaunch or a chat replay.
    - No file path is ever shown to the user.
  - **Where to start:** `macos/Sources/UsefulBotCore/Attachments.swift`. `formatMessage` adds
    "Attached image: <name>" and `echoedMessage` adds `[file: <name> (<type>)]` lines to the
    stored text, and the pixels aren't kept after the send ("the pictures themselves are long
    gone"). The sent row therefore has only those lines to show. Also check `attachmentsRow` in
    `ComposerView.swift`, the user bubble in `ChatView.swift`, and how eve replays the turn
    (`transcript-lives-in-eve-not-durable-store` in memory). A local copy per sent image, for
    example beside the media store, is likely what lets the bubble draw it after a relaunch.
  - **Done when:** screenshots show the composer preview and the sent bubble for one and for
    several images, before and after a relaunch. The model still gets the pixels, and the
    `[file: …]` lines never show.
- **To decide and fix in this PR (reported 2026-09-28): how a bot hears back from its sub-agents.**
  - **Seen:** when a bot's background sub-agent finishes, its result lands in the chat as an
    owner message. It sits in the right-hand bubble and reads "Background task task_… (agent) is
    completed. Result: …". Visual Creator showed this on 2026-09-28.
  - **Wanted:** sub-agent traffic stays between the main agent and its sub-agents, out of the
    owner's side of the chat. The owner sees it only in the bot's working state: the working
    animation or step row says a sub-agent is running, and then that its result came back. The
    main agent then answers in its own bubble.
  - **Decide first, with Wasim:** how the result reaches the main agent (an internal eve event,
    a tool result or a hidden turn, rather than a user message), and what the UI shows. Options
    include a line in the working row, a small collapsible "sub-agent" step or nothing beyond
    the animation. Check how eve delivers background task completions and where the Mac app
    turns them into transcript rows before picking.
  - **Done when:** a live Test Bot turn that starts a sub-agent shows it only in the working
    state. No owner bubble appears for its result, before or after a relaunch or replay, and the
    main agent still uses the result.
- **Done when:** every picked item is built and verified by screenshot. If the list is long it
  splits in two, so that's one or two PRs.

## PR 4: Landing page on bot.usefulbuild.com

- **Page:**
  - A beautiful landing page for Useful Bot on the new subdomain `bot.usefulbuild.com`.
  - Its primary button is the macOS download:
    `https://github.com/wasimjalali/useful-bot-releases/releases/latest/download/Useful-Bot-macOS.zip`.
  - It also shows the one-line installer.
  - It uses real screenshots of the polished app, so it comes after PRs 2 and 3.
- **Privacy:** reuse the existing usefulbuild.com privacy page if it covers this product. If not,
  add `bot.usefulbuild.com/privacy`. It has to say what the app sends (feedback form only, plus an
  anonymous install ID) and that chats go to the model provider the user connects.
- **Hosting:** Cloudflare, following how the two existing usefulbuild.com subdomains are set up.
  Settle in session whether the site's code lives in this repo (for example `site/`) or its own.
- **App wiring:**
  - Set `ReleaseLinks.privacy` in `AppSettingsView.swift`.
  - Point Contact rows at the page if useful.
- **Done when:** the page is live on the subdomain (desktop and phone widths checked), the privacy
  link opens from Settings > About, and the download link resolves. It resolves after PR 5
  publishes.

## PR 5: Release readiness and live verification

- **Clean-Mac check:** install and update E2E on a clean Mac, from `devin-dist-prompt.md` (the
  Devin macOS VM).
- **PR #144 lows:** fix every open low listed in its description.
- **Release repo:** create the public repo `wasimjalali/useful-bot-releases` and publish v1.0.0
  (`npm run release:mac`), only on Wasim's go. Then turn on `ReleaseLinks.releasesRepoLive`
  (What's new, Report a bug on GitHub).
- **Live checks left from #145:**
  - "Install update" on a real update.
  - Back during the device-code fetch.
  - A Feedback send from the installed app (Idea, "[test]").
- **Wasim's own switch:** Wasim moves to the installed release as a clean first-time user. Back up
  `~/.useful-bot` and the repo `.eve` first.
- **Done when:** a fresh Mac installs from the landing page, runs first run end to end, and takes
  an update.

## PR 6: Pre-launch performance check

- **What:** `npm run perf:check` on `main` and on the newest open branch, each on its own
  `build:app`, on a quiet Mac. Compare against the 2026-09-27 pass
  (`evals/results/2026-09-27-perf-check-2000-c450c11`). Sparkle is linked into every build since
  #144.
- **After a breach:** fix it, or raise the budget in `perf/budgets.json` in a reviewed edit that
  says why.
- **Done when:** both runs pass and their records are committed. Then launch.

## Order

PR 1, 2, 3, 4, 5, 6: six sessions, seven if the polish pass splits.

- **Web first:** its decision decides whether PRs 2 and 3 touch the web.
- **Landing page after the polish:** it needs screenshots of the polished app.
- **Perf last:** it measures what ships.
