/** Delay helper returning a promise that resolves after the specified milliseconds. */
export function delay(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
//# sourceMappingURL=time.js.map