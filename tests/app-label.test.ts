import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_LABEL,
  describeAppForPrompt,
  formatAppLabel,
  normalizeAppLabel,
} from "../src/util/app-label";

describe("app label utilities", () => {
  it("normalizes values by trimming whitespace and rejecting non-strings", () => {
    expect(normalizeAppLabel("  Sweetistics  ")).toBe("Sweetistics");
    expect(normalizeAppLabel("")).toBeNull();
    expect(normalizeAppLabel("   ")).toBeNull();
    expect(normalizeAppLabel(42)).toBeNull();
  });

  it("falls back to the default label when formatting invalid values", () => {
    expect(formatAppLabel("  Insights Portal  ")).toBe("Insights Portal");
    expect(formatAppLabel(undefined)).toBe(DEFAULT_APP_LABEL);
    expect(formatAppLabel("")).toBe(DEFAULT_APP_LABEL);
  });

  it("describes labels for prompt strings without duplicating leading articles", () => {
    expect(describeAppForPrompt("Insights Hub")).toBe('the "Insights Hub" application');
    expect(describeAppForPrompt("Your Control Room")).toBe("Your Control Room");
    expect(describeAppForPrompt("the Admin Console")).toBe("the Admin Console");
    expect(describeAppForPrompt(null)).toBe(DEFAULT_APP_LABEL);
  });
});
