import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SCRIPTS_DIR = resolve(SKILL_DIR, "scripts");
export const SAMPLE_DIR = resolve(SKILL_DIR, "examples", "today-windvane");

export function makeTmpDir(prefix = "d2s-test-") {
  return mkdtempSync(resolve(tmpdir(), prefix));
}

export function runNodeScript(script, args) {
  const scriptPath = resolve(SCRIPTS_DIR, script);
  return spawnSync(process.execPath, [scriptPath, ...args], { encoding: "utf8" });
}

export function generateSample(outDir) {
  return runNodeScript("generate-output.js", [
    "--ui",
    resolve(SAMPLE_DIR, "contracts", "ui-schema.yaml"),
    "--api",
    resolve(SAMPLE_DIR, "contracts", "api-schema.yaml"),
    "--mapping",
    resolve(SAMPLE_DIR, "contracts", "mapping-logic.yaml"),
    "--out-dir",
    outDir,
  ]);
}

export function validateSampleOutput(outDir, capability = "today-windvane") {
  return runNodeScript("validate-output.js", [
    "--strict",
    "--ui",
    resolve(outDir, "contracts", "ui-schema.yaml"),
    "--api",
    resolve(outDir, "contracts", "api-schema.yaml"),
    "--mapping",
    resolve(outDir, "contracts", "mapping-logic.yaml"),
    "--notes",
    resolve(outDir, "notes.md"),
    "--data-fetching",
    resolve(outDir, "data-fetching.md"),
    "--spec",
    resolve(outDir, "specs", capability, "spec.md"),
  ]);
}
