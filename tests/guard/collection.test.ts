import { relative } from "node:path";
import { expect, it } from "vitest";
import { runProcess } from "../helpers/guard-process.js";

it("collects every tracked package test once without dependency or build trees", async () => {
  const output = await runProcess("pnpm", ["exec", "vitest", "list", "--filesOnly", "--json"], { timeout: 15_000 });
  const listed = JSON.parse(output) as { file: string }[];
  const files = listed.map((entry) => relative(process.cwd(), entry.file));
  const tracked = (await runProcess("git", ["ls-files", "packages/**/*.test.ts"])).split("\n").filter(Boolean).sort();
  expect(files.filter((file) => file.startsWith("packages/")).sort()).toEqual(tracked);
  expect(new Set(files).size).toBe(files.length);
  expect(files.some((file) => /(^|\/)(node_modules|dist)\//.test(file))).toBe(false);
  expect(files.some((file) => file.endsWith(".db.test.ts"))).toBe(false);
}, 20_000);
