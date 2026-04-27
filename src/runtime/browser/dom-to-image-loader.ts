"use client";

type DomToImageModule = { toJpeg: (node: HTMLElement, options?: unknown) => Promise<string> };

type GlobalDomToImageContext = Omit<typeof globalThis, "document" | "location"> & {
  document?: Document;
  location?: Location;
  domtoimage?: DomToImageModule;
  domToImage?: DomToImageModule;
  domtoImage?: DomToImageModule;
  __sweetlinkDomToImagePromise?: Promise<DomToImageModule>;
};

const resolveGlobal = (context: GlobalDomToImageContext): DomToImageModule | null =>
  context.domtoimage ?? context.domToImage ?? context.domtoImage ?? null;

const SCRIPT_URL = "/sweetlink/dom-to-image-more.global.js";

export async function loadDomToImageFromScript(): Promise<DomToImageModule> {
  const context = globalThis as GlobalDomToImageContext;
  const cachedLoader = context.__sweetlinkDomToImagePromise;
  if (cachedLoader) {
    return await cachedLoader;
  }

  const existing = resolveGlobal(context);
  if (existing) {
    context.__sweetlinkDomToImagePromise = Promise.resolve(existing);
    return existing;
  }

  if (!context.document) {
    throw new Error(
      "Unable to load dom-to-image-more: document is not available in this environment",
    );
  }

  const { document } = context;

  const loaderPromise = new Promise<DomToImageModule>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    const handleLoad = () => {
      const candidate = resolveGlobal(context);
      if (candidate) {
        resolve(candidate);
      } else {
        reject(new Error("dom-to-image-more loaded but did not register a global export"));
      }
    };
    const handleError = () => {
      reject(new Error(`Failed to load dom-to-image-more script from ${SCRIPT_URL}`));
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });

    document.head.append(script);
  });

  context.__sweetlinkDomToImagePromise = loaderPromise;
  try {
    return await loaderPromise;
  } catch (error) {
    if (context.__sweetlinkDomToImagePromise === loaderPromise) {
      context.__sweetlinkDomToImagePromise = undefined;
    }
    throw error;
  }
}
