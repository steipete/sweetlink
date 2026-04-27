import type { SweetLinkScreenshotResultData } from "@sweetlink/shared";
import { loadDomToImage, recordScreenshotError } from "../utils.js";

export async function captureWithDomToImage(
  targetInfo: {
    base: HTMLElement;
    target: HTMLElement;
    clip?: { x: number; y: number; width: number; height: number };
  },
  quality: number,
): Promise<SweetLinkScreenshotResultData> {
  const domToImage = await loadDomToImage();
  if (typeof domToImage.toJpeg !== "function") {
    throw new TypeError("dom-to-image-more failed to expose toJpeg");
  }
  let dataUrl: string;
  try {
    dataUrl = await domToImage.toJpeg(targetInfo.target, {
      quality,
      cacheBust: true,
    });
  } catch (error) {
    recordScreenshotError("domToImage", error);
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (typeof dataUrl !== "string") {
    throw new TypeError("dom-to-image-more did not return a data URL");
  }
  const base64 = stripDataUrlPrefix(dataUrl);
  const { width, height } = await imageDimensionsFromDataUrl(dataUrl);
  return {
    mimeType: "image/jpeg",
    base64,
    width,
    height,
    renderer: "html-to-image",
  };
}

export function stripDataUrlPrefix(dataUrl: string): string {
  const prefix = "data:image/jpeg;base64,";
  if (dataUrl.startsWith(prefix)) {
    return dataUrl.slice(prefix.length);
  }
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1);
}

async function imageDimensionsFromDataUrl(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    });
    image.addEventListener("error", () => {
      reject(new Error("Failed to read screenshot dimensions"));
    });
    image.src = dataUrl;
  });
}
