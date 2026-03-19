#!/usr/bin/env node
/**
 * Workspace wrapper for the `paperclip-plugin-dev-server` bin.
 *
 * When the SDK is published to npm, `publishConfig.bin` replaces this entry
 * with `./dist/dev-cli.js` (pre-compiled). In a workspace / development
 * context this wrapper forwards to the compiled dist when it exists, or
 * falls back to running the TypeScript source via `tsx` (if available), or
 * as a last resort compiles via `tsc` first.
 *
 * This file intentionally has no build step so that the bin symlink can be
 * created by pnpm during `pnpm install` before the SDK has been compiled.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sdkRoot = resolve(__dirname, "..");
const distCli = resolve(sdkRoot, "dist", "dev-cli.js");

if (existsSync(distCli)) {
  // Happy path: SDK has already been compiled — delegate to the dist entry.
  await import(distCli);
} else {
  // SDK not yet compiled — try tsx so the TypeScript source can run directly.
  const tsxCandidates = [
    resolve(sdkRoot, "node_modules", ".bin", "tsx"),
    resolve(sdkRoot, "..", "..", "..", "node_modules", ".bin", "tsx"),
  ];
  const tsx = tsxCandidates.find(existsSync);

  if (tsx) {
    const srcCli = resolve(sdkRoot, "src", "dev-cli.ts");
    const { status } = spawnSync(tsx, [srcCli, ...process.argv.slice(2)], {
      stdio: "inherit",
    });
    process.exit(status ?? 0);
  }

  // Last resort: build the SDK with tsc then re-run the compiled entry.
  const tscCandidates = [
    resolve(sdkRoot, "node_modules", ".bin", "tsc"),
    resolve(sdkRoot, "..", "..", "..", "node_modules", ".bin", "tsc"),
  ];
  const tsc = tscCandidates.find(existsSync);

  if (!tsc) {
    console.error(
      "paperclip-plugin-dev-server: SDK is not compiled and neither tsx nor " +
        "tsc could be found.\n" +
        "Run `pnpm --filter @paperclipai/plugin-sdk build` first.",
    );
    process.exit(1);
  }

  const build = spawnSync(tsc, ["-p", resolve(sdkRoot, "tsconfig.json")], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (build.status !== 0) {
    process.exit(build.status ?? 1);
  }

  await import(distCli);
}
