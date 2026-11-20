/**
 * The microphone notice and privacy section 2.7 must describe who may receive
 * the audio without a closed list of companies. The screen accepts any
 * browser's speech recognition, so a fixed list ("Google or Apple") goes wrong
 * as soon as another browser sends audio elsewhere (Microsoft Edge sends it to
 * Azure: learn.microsoft.com/deployedge/microsoft-edge-policies/speechrecognitionenabled).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIRE_COPY } from "../copy";

const privacy = readFileSync(path.join(process.cwd(), "app/privacy/page.tsx"), "utf8").replace(/\s+/g, " ");
const section = privacy.slice(privacy.indexOf("2.7 On-site voice checklists"), privacy.indexOf("3. How we use"));

describe("microphone disclosure", () => {
  it("the notice says the browser MAY send audio to the company that makes it, naming examples only", () => {
    expect(FIRE_COPY.notice).toContain("your browser may send the audio to the company that makes it, such as");
    for (const name of ["Google", "Apple", "Microsoft"]) expect(FIRE_COPY.notice).toContain(name);
    expect(FIRE_COPY.notice).not.toMatch(/phone's browser|its maker|Google or Apple/);
  });

  it("privacy section 2.7 says the same, with each browser named as an example", () => {
    expect(section.length).toBeGreaterThan(100);
    expect(section).toContain("may send the audio to the company that makes it");
    expect(section).toContain("for example");
    for (const name of ["Google for Chrome", "Apple for Safari", "Microsoft for Edge"]) expect(section).toContain(name);
    expect(section).not.toMatch(/phone browser|its maker/);
  });
});
