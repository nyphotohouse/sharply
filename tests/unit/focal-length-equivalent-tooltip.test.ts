import { describe, expect, it } from "vitest";
import {
  buildFocalLengthEquivalentTooltip,
  formatSensorFormatNameForSentence,
  indefiniteArticleForFormatName,
} from "~/lib/mapping/focal-length-map";

describe("focal length equivalent tooltip copy", () => {
  it("lowercases plain format names and keeps APS-C casing", () => {
    expect(formatSensorFormatNameForSentence("Medium Format (44x33)")).toBe(
      "medium format (44x33)",
    );
    expect(formatSensorFormatNameForSentence("APS-C")).toBe("APS-C");
    expect(formatSensorFormatNameForSentence("Canon APS-C")).toBe(
      "Canon APS-C",
    );
    expect(formatSensorFormatNameForSentence("4/3")).toBe("4/3");
  });

  it("picks a/an from pronunciation", () => {
    expect(indefiniteArticleForFormatName("APS-C")).toBe("an");
    expect(indefiniteArticleForFormatName("medium format (44x33)")).toBe("a");
    expect(indefiniteArticleForFormatName("4/3")).toBe("a");
  });

  it("builds the agreed FOV explanation", () => {
    expect(
      buildFocalLengthEquivalentTooltip({
        formatName: "Medium Format (44x33)",
        equivalent: "19mm",
      }),
    ).toBe(
      "On a medium format (44x33) camera, this lens has a field of view similar to a 19mm lens on a full-frame camera.",
    );

    expect(
      buildFocalLengthEquivalentTooltip({
        formatName: "APS-C",
        equivalent: "35mm",
      }),
    ).toBe(
      "On an APS-C camera, this lens has a field of view similar to a 35mm lens on a full-frame camera.",
    );

    expect(
      buildFocalLengthEquivalentTooltip({
        formatName: "Canon APS-C",
        equivalent: "29-72mm",
      }),
    ).toBe(
      "On a Canon APS-C camera, this lens has a field of view similar to a 29-72mm lens on a full-frame camera.",
    );
  });
});
