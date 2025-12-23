export const getBrowserWindow = () => {
    if (typeof window === 'undefined') {
        return null;
    }
    return window;
};
export const getDocument = () => {
    if (typeof document === 'undefined') {
        return null;
    }
    return document;
};
//# sourceMappingURL=environment.js.map