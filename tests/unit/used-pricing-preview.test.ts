import { describe, expect, it } from "vitest";
import {
  getUsedPricingMode,
  getUsedPricingPreview,
} from "~/lib/pricing/used-pricing-preview";

const projection = {
  US: {
    typical: 89_900,
    status: "current" as const,
  },
};

describe("used pricing admin preview", () => {
  it("prioritizes active automatic mappings over manual mappings", () => {
    expect(getUsedPricingMode(["manual", "mpb"])).toBe("ACTIVE");
    expect(getUsedPricingMode(["manual"])).toBe("MANUAL");
    expect(getUsedPricingMode([])).toBe("NONE");
  });

  it("formats the preferred US typical price with its management mode", () => {
    expect(getUsedPricingPreview(projection, "ACTIVE", "en-US")).toEqual({
      price: "$899",
      modeLabel: "Active",
    });
    expect(getUsedPricingPreview(projection, "MANUAL", "en-US")).toEqual({
      price: "$899",
      modeLabel: "Manual",
    });
  });

  it("falls back to no pricing when there is no usable projection", () => {
    expect(getUsedPricingPreview(null, "NONE", "en-US")).toEqual({
      price: null,
      modeLabel: null,
    });
  });
});
