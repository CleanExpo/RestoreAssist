import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CONSUMER_PAGES = [
  join(process.cwd(), "app/portal/[token]/page.tsx"),
  join(process.cwd(), "app/portal/page.tsx"),
  join(process.cwd(), "app/portal/reports/[id]/page.tsx"),
];

const CONSUMER_API_ROUTES = [
  join(process.cwd(), "app/api/portal/[token]/route.ts"),
  join(process.cwd(), "app/api/portal/reports/route.ts"),
  join(process.cwd(), "app/api/portal/reports/[id]/route.ts"),
  join(process.cwd(), "app/api/portal/[token]/pdf/route.ts"),
  join(process.cwd(), "app/api/portal/reports/[id]/download/route.ts"),
];

describe("consumer portal language boundary", () => {
  it.each(CONSUMER_PAGES)(
    "%s does not render technical water classifications",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/Water Classification/);
      expect(source).not.toMatch(/>Category:</);
      expect(source).not.toMatch(/` • Class \$\{/);
    },
  );

  it("keeps reviewer evidence outside the consumer-language guard", () => {
    const insurerPage = readFileSync(
      join(process.cwd(), "app/portal/insurer/[token]/page.tsx"),
      "utf8",
    );
    expect(insurerPage).toMatch(/waterCategory|category/i);
  });

  it.each(CONSUMER_API_ROUTES)(
    "%s does not expose raw technical evidence fields",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(
        /waterCategory|waterClass|moistureLevel|psychrometricReadings|detailedReport/,
      );
    },
  );
});
