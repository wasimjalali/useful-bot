import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";
import { selectSandbox } from "../../shared/sandbox.ts";

const decision = selectSandbox();
if (decision.backend !== "just-bash") {
  throw new Error(
    `sandbox backend ${decision.backend} is present but S3 has not certified a VM; refuse silent upgrade`,
  );
}

export default defineSandbox({
  backend: justbash({ autoInstall: false }),
});
