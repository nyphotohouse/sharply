import { describe, expect, it } from "vitest";
import { getImageRenderRect } from "@/app/[locale]/(pages)/(tools)/instagram-post-builder/image-sizing";

const box = {
  boxX: 16,
  boxY: 24,
  boxWidth: 800,
  boxHeight: 1000,
};

describe("Instagram post builder image sizing", () => {
  it("centers a wide image inside the padded tile in fit mode", () => {
    expect(
      getImageRenderRect({
        ...box,
        imageWidth: 1600,
        imageHeight: 900,
        mode: "fit",
        position: { x: 0, y: 100 },
      }),
    ).toEqual({
      x: 16,
      y: 299,
      width: 800,
      height: 450,
    });
  });

  it("centers a tall image inside the padded tile in fit mode", () => {
    expect(
      getImageRenderRect({
        ...box,
        imageWidth: 400,
        imageHeight: 1000,
        mode: "fit",
        position: { x: 100, y: 0 },
      }),
    ).toEqual({
      x: 216,
      y: 24,
      width: 400,
      height: 1000,
    });
  });

  it("fills a matching-aspect tile without adding empty space", () => {
    expect(
      getImageRenderRect({
        ...box,
        imageWidth: 800,
        imageHeight: 1000,
        mode: "fit",
        position: { x: 25, y: 75 },
      }),
    ).toEqual({
      x: 16,
      y: 24,
      width: 800,
      height: 1000,
    });
  });

  it("retains horizontal crop positioning for wide images in fill mode", () => {
    expect(
      getImageRenderRect({
        ...box,
        imageWidth: 1600,
        imageHeight: 1000,
        mode: "fill",
        position: { x: 25, y: 50 },
      }),
    ).toEqual({
      x: -184,
      y: 24,
      width: 1600,
      height: 1000,
    });
  });

  it("retains vertical crop positioning for tall images in fill mode", () => {
    expect(
      getImageRenderRect({
        ...box,
        imageWidth: 800,
        imageHeight: 1600,
        mode: "fill",
        position: { x: 50, y: 75 },
      }),
    ).toEqual({
      x: 16,
      y: -426,
      width: 800,
      height: 1600,
    });
  });
});
