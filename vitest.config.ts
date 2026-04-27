import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

const sweetLinkAliasPlugin = {
  name: "sweetlink-alias",
  enforce: "pre" as const,
  resolveId(source: string) {
    if (source === "@sweetlink-app") {
      return path.resolve(rootDirectory, "src/index.ts");
    }
    if (source.startsWith("@sweetlink-app/")) {
      const rest = source.slice("@sweetlink-app/".length);
      return path.resolve(rootDirectory, "src", `${rest}.ts`.replace(/\.ts\.ts$/, ".ts"));
    }
    return null;
  },
};

export default defineConfig({
  test: {
    include: ["tests/**/*.{test,spec}.{ts,tsx,js}"],
    environment: "node",
    root: rootDirectory,
    globals: true,
    coverage: {
      provider: "v8",
      exclude: ["src/index.ts", "examples/**"],
    },
  },
  plugins: [sweetLinkAliasPlugin],
});
