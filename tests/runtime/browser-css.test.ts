// @vitest-environment jsdom
import { expect, it } from "vitest";
import { normalizeOklchColors } from "../../src/runtime/browser/screenshot/utils.js";

it("keeps the original CSS getter callable during and after screenshot preparation", () => {
  const original = CSSStyleDeclaration.prototype.getPropertyValue;
  document.body.innerHTML = '<div style="color: rgb(1, 2, 3)">Synthetic screenshot fixture</div>';
  const target = document.body.firstElementChild as HTMLElement;
  try {
    const restore = normalizeOklchColors(target);
    expect(getComputedStyle(target).getPropertyValue("color")).toBe("rgb(1, 2, 3)");
    restore();
    expect(target.style.getPropertyValue("color")).toBe("rgb(1, 2, 3)");
  } finally {
    CSSStyleDeclaration.prototype.getPropertyValue = original;
  }
});
