import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { format } from "oxfmt";

const write = process.argv.includes("--write");
const directoryTargets = ["src", "shared/src", "daemon/src", "tests"];
const fileTargets = [
  "scripts/format.mjs",
  "package.json",
  "tsconfig.json",
  "tsconfig.build.json",
  "tsconfig.base.json",
  "vitest.config.ts",
];
const supportedExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

const collectFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(target)));
    } else if (supportedExtensions.has(path.extname(entry.name))) {
      files.push(target);
    }
  }
  return files;
};

const files = [
  ...(await Promise.all(directoryTargets.map((directory) => collectFiles(directory)))).flat(),
  ...fileTargets,
].sort();
const different = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const result = await format(file, source);
  if (result.errors.length > 0) {
    throw new Error(`${file}: ${result.errors.map((error) => error.message).join("; ")}`);
  }
  if (result.code === source) {
    continue;
  }
  if (write) {
    await writeFile(file, result.code);
  } else {
    different.push(file);
  }
}

if (different.length > 0) {
  console.error("Formatting differs in:");
  for (const file of different) {
    console.error(file);
  }
  process.exitCode = 1;
} else {
  console.log(`${write ? "Formatted" : "Checked formatting for"} ${files.length} files.`);
}
