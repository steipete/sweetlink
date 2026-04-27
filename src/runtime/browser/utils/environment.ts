export const getBrowserWindow = (): Window | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return window;
};

export const getDocument = (): Document | null => {
  if (typeof document === "undefined") {
    return null;
  }
  return document;
};
