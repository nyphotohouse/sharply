import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("gear and browse fallback policy", () => {
  it("uses a 3-day fallback for gear detail pages", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/[locale]/(pages)/gear/[slug]/page.tsx"),
      "utf8",
    );

    expect(source).toContain("export const revalidate = 259200;");
  });

  it("uses a daily fallback for the browse catch-all", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "src/app/[locale]/(pages)/browse/[[...segments]]/page.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("export const revalidate = 86400;");
  });
});
