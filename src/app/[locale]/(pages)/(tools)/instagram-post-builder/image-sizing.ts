export type ImageFitMode = "fill" | "fit";

type ImageRenderRectInput = {
  imageWidth: number;
  imageHeight: number;
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  mode: ImageFitMode;
  position: { x: number; y: number };
};

export type ImageRenderRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export const getImageRenderRect = ({
  imageWidth,
  imageHeight,
  boxX,
  boxY,
  boxWidth,
  boxHeight,
  mode,
  position,
}: ImageRenderRectInput): ImageRenderRect => {
  const imageRatio = imageWidth / imageHeight;
  const boxRatio = boxWidth / boxHeight;

  let width: number;
  let height: number;

  if (mode === "fit") {
    if (imageRatio > boxRatio) {
      width = boxWidth;
      height = width / imageRatio;
    } else {
      height = boxHeight;
      width = height * imageRatio;
    }

    return {
      x: boxX + (boxWidth - width) / 2,
      y: boxY + (boxHeight - height) / 2,
      width,
      height,
    };
  }

  if (imageRatio > boxRatio) {
    height = boxHeight;
    width = height * imageRatio;
    return {
      x: boxX + (boxWidth - width) * (position.x / 100),
      y: boxY,
      width,
      height,
    };
  }

  width = boxWidth;
  height = width / imageRatio;
  return {
    x: boxX,
    y: boxY + (boxHeight - height) * (position.y / 100),
    width,
    height,
  };
};
