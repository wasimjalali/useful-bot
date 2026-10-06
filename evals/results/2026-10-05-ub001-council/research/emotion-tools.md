# Remotion tooling for the Useful Bot launch video (research as of 2026-10-05)

Note: the owner asked about REMOTION (dictation misheard "emotion"). Remotion is the main body. Research only, nothing installed. Anything from outside the machine must pass skill-scanner first.
Method caveat: facts come from vendor pages and GitHub pages fetched today; star counts are as shown on the page at fetch time. Items marked (unverified) were seen only in search snippets.

## 1. Official Remotion tooling

| Item | Detail |
|---|---|
| Agent skills | https://github.com/remotion-dev/skills , docs https://www.remotion.dev/docs/ai/skills . Maker: Remotion. ~4.8k stars, 540 forks. Install: `npx skills add remotion-dev/skills` (the MCP-deprecation page also mentions `npx remotion skills add`). Free. License not shown on the repo page (check LICENSE before relying on it). |
| Skills inside (12 listed) | remotion-best-practices (umbrella), remotion-create (new project/composition), remotion-markup (React markup: compositions, animation, layout, typography, media, effects, audio, fonts, timing), remotion-studio (preview), remotion-render (render video/stills), remotion-maps, remotion-captions (subtitles), remotion-saas (architecture for Remotion-powered apps), remotion-interactivity (Studio editability), remotion-docs (look up current API/props/guides before coding), remotion-upgrade, remotion-multimedia (browser media via Mediabunny). A third-party mirror lists 15 skills / 39 rule files, so the count drifts. |
| Official Claude Code plugin | https://www.remotion.dev/docs/ai/claude-code-plugin . `claude plugin marketplace add remotion-dev/claude-code-plugin` then `claude plugin install remotion@remotion`, restart Claude Code. Bundles the same skills; loads them automatically when you ask for a Remotion video. Free. Best single install. |
| Remotion MCP | https://www.remotion.dev/docs/ai/mcp . DEPRECATED. Hosted server shuts down no earlier than 2026-08-31 (so may already be gone). Remotion says use the /remotion-docs skill instead. Do not install. There is no official Remotion MCP for render or Lambda. Rendering goes through the CLI (`npx remotion render`) which the agent runs itself. Remotion Lambda/cloud render is a package (@remotion/lambda), not an MCP; unnecessary for one 90 s video, local render is fine. |
| Prompting guide | https://www.remotion.dev/docs/ai/coding-agents (how Remotion suggests driving agents). |

### Official templates (https://www.remotion.dev/templates)
Free: Blank, Hello World, Next.js, Next.js (Vercel Sandbox), Recorder (JS video production tool: record webcam/screen, captions, music), Prompt to Motion Graphics SaaS Starter Kit, Render Server (Express), Electron, React Router 7, 3D (React Three Fiber), Stills, Audiogram, Music Visualization, Prompt to Video, Skia, Overlay, Code Hike, Stargazer, TikTok (word-by-word captions).
Paid (prices unlisted on the page): Editor Starter (custom video editor boilerplate), Watercolor Map, Timeline Component.
For us: Blank + the skills is the right base. Recorder is for recording, not needed (we have real recordings). Editor Starter is not relevant.

### Official helper packages relevant to emotion and polish
- @remotion/transitions: scene transitions (fade, slide, wipe, flip) between sequences. Core for pacing.
- @remotion/motion-blur: Trail and CameraMotionBlur components. Makes fast pans and zooms feel physical, not digital.
- spring() and interpolate() (core): the main tool for natural, weighted motion.
- @remotion/captions: word-timed captions from the TTS/transcript (also fits Deepgram timing data).
- @remotion/three (React Three Fiber): 3D scenes. Use sparingly; the UI must stay real.
- @remotion/lottie: play Lottie JSON (LottieFiles or After Effects). Good for small non-UI flourishes.
- @remotion/layout-utils, @remotion/media-utils / Mediabunny: text fitting, audio data. Audio data allows sound effects to sync to frames.

### License (https://www.remotion.pro/license , https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)
- Free for individuals, nonprofits and for-profit organisations with up to 3 employees, commercial use allowed. This covers Useful Bot if the team is 3 or fewer; confirm headcount against the FAQ https://www.remotion.dev/docs/license/faq .
- Company license if not eligible: Creators $25/month per seat (low volume, "through coding and prompting"); Automators $100/month minimum + $0.01 per render; Enterprise from $500/month.

## 2. Claude Code plugins and skills that wrap Remotion (community, all need skill-scanner)

| Name | Maker / URL | What it does | Install | Cost / license | Maturity | Fit |
|---|---|---|---|---|---|---|
| EveryInc/product-launch-video | https://github.com/EveryInc/product-launch-video | Skill plus Remotion scaffold for 15-30 s launch videos. Flow: brief and screen recordings, storyboard, scenes, render loop, multi-agent review (design, readability, pacing, brand), MP4/GIF + social copy. No music mentioned. | git clone, `npm install`, skill auto-loads from .claude/skills (or symlink to ~/.claude/skills) | Free, MIT | 55 stars, 4 commits | Best fit: uses real screen recordings, review loop covers pacing. Short length, so extend to 75-90 s. Cleanest to read and scan. |
| Vincentwei1021/video-shotcraft | https://github.com/Vincentwei1021/video-shotcraft | Remotion motion-design skill: 152 shot recipe cards, 209 motion previews, template, 2.5D "real-page camera" moves, beat sync, sound-design guidance. Includes 149 SFX in 16 categories and 5 BGM options. | `npx skills add Vincentwei1021/video-shotcraft` | Free, Apache-2.0 | 10.4k stars, 101 commits | Strong for camera and shot craft. WARNING: ships BGM and uses beat sync; riser/scifi/crowd SFX may be tonal. Must strip BGM and beat-sync rules and audit every SFX file by ear. Star count is very high for a niche repo, so scan it carefully. |
| DojoCodingLabs/remotion-superpowers | https://github.com/DojoCodingLabs/remotion-superpowers | Plugin: voiceover, Suno music, ElevenLabs SFX via KIE API, stock footage, captions, transitions, auto review loop, 5 bundled MCPs (remotion-media, TwelveLabs, Pexels, ElevenLabs, Replicate). | `/plugin marketplace add DojoCodingLabs/remotion-superpowers` | Free, MIT; the generation APIs cost money | 128 stars, v2.1.0 | AVOID or use only as reference: music generation built in, five third-party MCPs and a KIE API middleman (large attack and cost surface), stock footage is not our real UI. |
| Anann99/launch-film-skill | https://github.com/Anann99/launch-film-skill | Website + live product to launch film: storyboard, parallel Remotion build, "original synced score", multi-agent QA. | git/skill | unverified | unverified | Score generation conflicts with no-music rule. Reference for QA structure only. |
| uxmohamed/launch-film | https://github.com/uxmohamed/launch-film | Production manual reverse-engineered from 59 real launch films: playbook, shot taxonomy, case studies, storyboard and evaluate-against-playbook modes. Needs playwright-core, Chromium, ffmpeg. Page does not say it uses Remotion. | git clone to ~/.claude/skills/launch-film | Free, MIT | 1 star | Useful as story and structure reference. Read the playbook text rather than installing. |
| AbubakrChan/product-launch-motion | https://github.com/AbubakrChan/product-launch-motion | Launch motion design with HTML/CSS/GSAP (not Remotion), word-locked voiceover sync, camera moves, loudness mastering. | git | unverified | unverified | Different stack. Ideas on voiceover sync and loudness only. |
| Others seen (unverified): Zane-0x5a/remotion-director (critic loop judged on rendered frames), haidrrrry/claude-remotion-skill (mentions sound design), AKCodez/promo-video-skill, StanCosmin28/product-film-skill (builds from real UI, 13 s), anudeepadi/launch-video-skills | github | | | Skim only. |

## 3. Showcases
- Remotion's own launch of Agent Skills (Jan 2026) went viral with agent-made videos: https://www.startuphub.ai/ai-news/artificial-intelligence/2026/remotion-ai-video-makes-production-code-from-plain-prompts
- Guides: https://snapcn.dev/claude-code-remotion-videos , https://o-mega.ai/articles/remotion-video-generation-with-ai-agents-claude-code-2026
- Remotion blog and showcase: https://www.remotion.dev/blog , resources list https://www.remotion.dev/docs/resources
- No named, verified big-brand launch video was confirmed in this pass; the above are guides, not case studies.

## 4. Voice emotion (short)
- Deepgram: MCP exists only community-made (reddheeraj/Deepgram-MCP, Aura default aura-asteria-en, speed param, no emotion). Real emotion control is Deepgram Flux TTS: `expressivity` integer -2 (calm) to 2 (animated), beta as of Aug 2026, only on `/v2/speak` WebSocket, not Aura-2 `/v1/speak`; Deepgram says only the default is validated for production, extremes raise word errors. Source: https://deepgram.com/learn/tts-emotion-control-live-voice-agents . Pricing not stated. Action: if the owner keeps Deepgram, test Flux at expressivity 0 and +1, and write emotion into the script rhythm (short sentences, pauses) rather than the knob.
- ElevenLabs: local MCP https://github.com/elevenlabs/elevenlabs-mcp (MIT, 1.5k stars) is ARCHIVED/deprecated 2026-08-20; hosted MCP at https://api.elevenlabs.io/v1/mcp with OAuth. Free tier 10k credits/month. Strong emotion range (voice design, audio tags in v3, unverified here). Probably the best-sounding option but a second vendor.
- Hume Octave: acting instructions give the best explicit emotion steering, MCP server exists, but Hume is SUNSETTING TTS and EVI APIs on 2026-11-13 (https://dev.hume.ai/docs/text-to-speech-tts/overview). Avoid.

## 5. Non-musical sound effects (short)
- Hard rule: no music. Many generators and "SFX" packs include tonal risers, drones, stingers and loops. Audit by ear and reject anything with pitch or beat.
- ElevenLabs Sound Effects API: text to SFX, up to 30 s, WAV 48 kHz, 40 credits per second, looping option. It also accepts prompts for drum loops and melodic samples, so keep prompts strictly literal ("soft single mouse click", "short air whoosh"). Commercial terms not on the docs page; check ToS. Hosted MCP above.
- Stable Audio 2.5 (Stability): licensed-data model, $0.20 per generation, commercial needs a paid tier. Music-first model, so poor fit; skip.
- Libraries (all free): Freesound, filter license CC0 only (no attribution, commercial OK; other CC licences need credit); Pixabay sound effects (Pixabay License, commercial OK, no attribution, cannot resell as-is; verify per file, site also hosts music, do not browse music); Sonniss GDC Game Audio Bundle (https://sonniss.com/gameaudiogdc/ , royalty free, commercial, no attribution, media production OK, AI training banned; very large, has many tonal game sounds). Apple built-in macOS sounds: licence not verified, do not ship them; Apple's EULA is not a clear redistribution grant.
- Ambience: Freesound CC0 "room tone" recordings.

## 6. Video/motion AI (short; none replaces real UI)
- Higgsfield MCP (https://higgsfield.ai/mcp): no key, 30+ image/video models (Veo 3.1, Sora 2, Kling 3.0...). Generated footage, so it fakes UI. Use at most for an abstract non-UI opener, otherwise skip.
- Runway official MCP (runwayml/runway-api-mcp-server, MIT, last commit Aug 2026): generate/upscale/edit clips. Same objection. Upscaling or cleaning a real recording is the only legitimate use.
- Veo MCPs: community wrappers only (dayongd1/mcp-veo3 etc.). Skip.
- LottieFiles Creator MCP (official): `claude mcp add lottiefiles-creator -- npx -y @lottiefiles/creator-mcp@latest`; needs Node 18+ and Creator open in a browser tab (https://docs.lottiefiles.com/en/creator/13_ai-tools/lottie-creator-mcp). Good for small vector flourishes (checkmark, pulse, sparkle) played with @remotion/lottie. Optional.
- Rive and Spline: not researched in detail; skip, Remotion springs and @remotion/three cover it.

## 7. Story and emotion craft
No official Anthropic skill for launch-video storytelling found. Community: uxmohamed/launch-film (59-film playbook), EveryInc/product-launch-video (storyboard + review loop), video-shotcraft (shot recipes). Pacing guidance there is worth reading, but treat as opinion.

## Ranked: what to connect
1. Official Remotion plugin (remotion-dev/claude-code-plugin). Why: official, free, loads all 12 skills including remotion-docs (current API) and remotion-captions. Cost: free (license free while team is 3 or fewer; else Creators $25/mo/seat). Install: `claude plugin marketplace add remotion-dev/claude-code-plugin` then `claude plugin install remotion@remotion`. Equivalent: `npx skills add remotion-dev/skills`.
2. EveryInc/product-launch-video as a pattern (read, scan, then copy its brief/storyboard/review-loop structure into our own skill; extend 30 s to 90 s). Why: built on real screen recordings, includes pacing and readability review. Free, MIT. Install: clone, skill-scanner, symlink to ~/.claude/skills.
3. A sound source that is strictly non-musical: Freesound CC0 + Pixabay SFX + Sonniss, hand-picked and auditioned (free, no install). Optional add: ElevenLabs hosted MCP only for custom literal SFX (free tier 10k credits; 40 credits/s, so ~250 s of SFX per month free). Install: add hosted MCP with OAuth after reviewing ToS.
4. Voice: stay on Deepgram Aura-2 for now and A/B test Flux `expressivity` (0, +1) on the script's key lines; if neither feels human enough, ElevenLabs is the fallback. No MCP needed; call the API from a script.
5. Optional: video-shotcraft for camera/shot recipes only, after skill-scanner, with BGM, beat-sync and any tonal SFX removed. And Lottie Creator MCP for tiny vector accents.

## Avoid
- Remotion's own MCP (deprecated, may be offline).
- remotion-superpowers (built-in Suno music, five third-party MCPs, KIE API middleman).
- launch-film-skill's synced score, video-shotcraft's BGM and beat sync (violate the no-music rule).
- Hume (API ends 2026-11-13).
- Higgsfield, Runway, Veo generation for anything showing the app: fake UI.
- Stable Audio (music-first). Apple system sounds (unclear licence).
- Any of the community skills without skill-scanner first; several have only 1 to 55 stars.
