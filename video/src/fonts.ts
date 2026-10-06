import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Inter Semibold, SIL OFL 1.1 (brand/source/fonts/LICENSE.txt).
export const fontsReady = loadFont({ family: "Inter", url: staticFile("fonts/Inter-SemiBold.ttf"), weight: "600" });
