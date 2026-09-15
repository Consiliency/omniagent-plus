import { ESLint } from "eslint";
import { expect, it } from "vitest";

it("type-aware tooling lint rejects floating promises and accepts awaited ones", async () => {
  const eslint = new ESLint();
  const path = "tests/guard/lint.test.ts";
  const floating = await eslint.lintText('Promise.resolve("floating");\n', { filePath: path });
  const awaited = await eslint.lintText('await Promise.resolve("awaited");\n', { filePath: path });
  expect(floating[0]!.messages.some((message) => message.ruleId === "@typescript-eslint/no-floating-promises")).toBe(true);
  expect(awaited[0]!.messages).toEqual([]);
}, 15_000);
