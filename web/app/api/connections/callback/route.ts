import { completeConnectionOAuth } from "../../../../../shared/connection-flow.ts";
import { requestIsLoopback } from "../../../../../shared/origin.ts";
import { runtimeConfig } from "../../../../lib/auth";

export const runtime = "nodejs";

const PAGE = (ok: boolean, detail: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Useful Bot</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f5f2; color: #1b1a17; font: 16px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; }
  main { text-align: center; padding: 32px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px; }
  p { margin: 0; color: #6b675f; }
  @media (prefers-color-scheme: dark) { body { background: #141311; color: #f1efe9; } p { color: #a7a29a; } }
</style>
</head>
<body>
<main>
  <h1>${ok ? "Connected" : "Sign-in failed"}</h1>
  <p>${detail}</p>
</main>
</body>
</html>
`;

function html(ok: boolean, detail: string, status = 200) {
  return new Response(PAGE(ok, detail), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    },
  });
}

/**
 * The OAuth return lands on loopback for the desktop, or on the configured
 * tailnet origin for a phone-driven flow (S6): Serve forwards to this same
 * route with the original https origin in the request URL. Nothing else is
 * trusted with the completion code.
 */
function callbackOriginAllowed(requestUrl: string): boolean {
  if (requestIsLoopback(requestUrl)) return true;
  const tailnet = runtimeConfig()?.tailnet;
  if (!tailnet || runtimeConfig()?.phoneEnabled !== true) return false;
  try {
    return new URL(requestUrl).origin === tailnet.httpsOrigin;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  if (!callbackOriginAllowed(request.url)) {
    return html(false, "The sign-in could not finish. You can close this tab and use Reopen.", 403);
  }
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const error = url.searchParams.get("error");
  if (error) {
    return html(false, "The server refused sign-in. You can close this tab and use Reopen.", 400);
  }
  if (!code || !state) {
    return html(false, "The sign-in reply was missing. You can close this tab and use Reopen.", 400);
  }
  try {
    await completeConnectionOAuth(code, state);
    return html(true, "You can close this tab and return to Useful Bot.");
  } catch {
    return html(false, "The sign-in could not finish. You can close this tab and use Reopen.", 400);
  }
}
