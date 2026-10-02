import { defineTool } from "eve/tools";
import { webFetch } from "eve/tools/web_fetch";
import { fenceWebFetch } from "../lib/web-fetch-fence.ts";

// eve's own web_fetch, with the page text fenced as untrusted data
// (UB-009 PR A). Same input, same limits, same SSRF checks.
export default defineTool({
  ...webFetch,
  execute(input, ctx) {
    return fenceWebFetch(webFetch.execute(input, ctx));
  },
});
