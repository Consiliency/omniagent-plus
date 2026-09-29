import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";
import { checkBoundaries } from "../../scripts/check-dependency-boundaries.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "guard-boundaries-"));
  const write = (path: string, value: string) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), value); };
  for (const pkg of ["identity-isolation", "omnigent-transport", "core-contracts", "other"]) {
    write(`packages/${pkg}/package.json`, JSON.stringify({ name: `@test/${pkg}`, exports: { ".": "./src/index.ts" } }));
    // Synthetic programs must not load the workspace's ambient dependency types.
    write(`packages/${pkg}/tsconfig.json`, JSON.stringify({ compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", noLib: true, types: [] }, include: ["src/**/*.ts"] }));
    write(`packages/${pkg}/src/index.ts`, "export const publicValue = 1;");
  }
  for (const name of ["process-profile.ts", "omnigent-isolation-policy.ts", "types.ts"]) write(`packages/identity-isolation/src/${name}`, 'import type { OmnigentProviderMode } from "../../omnigent-transport/src/types.js";');
  write("packages/omnigent-transport/src/types.ts", 'export type OmnigentProviderMode = "http";');
  write("packages/core-contracts/src/coordination-contract.ts", readFileSync("packages/core-contracts/src/coordination-contract.ts", "utf8"));
  return { root, write, close: () => rmSync(root, { recursive: true, force: true }) };
}
it("accepts the exact three type edges and existing contract loader", () => {
  const f = fixture();
  try { expect(checkBoundaries(f.root)).toEqual({ exceptions: 3, computedLoaders: 1 }); }
  finally { f.close(); }
});
it.each([
  'import { x } from "../../omnigent-transport/src/types.js";',
  'export * from "../../omnigent-transport/src/types.js";',
  'import("../../omnigent-transport/src/types.js");',
  'require("../../omnigent-transport/src/types.js");',
  'import x = require("../../omnigent-transport/src/types.js");',
  'type X = import("../../omnigent-transport/src/types.js").OmnigentProviderMode;',
  'type X = typeof import("../../omnigent-transport/src/types.js");',
  '/// <reference path="../../omnigent-transport/src/types.ts" />',
  'const path = "../../omnigent-transport/src/types.js"; require(path);',
  'const path = "../../omnigent-transport/src/types.js"; import(path);',
  'import {createRequire} from "node:module"; const load=createRequire(import.meta.url); load("../../omnigent-transport/src/types.js");',
  'import {createRequire as cr} from "node:module"; const load=cr(import.meta.url); const alias=load; alias("../../omnigent-transport/src/types.js");',
  'import {createRequire} from "node:module"; const load=createRequire(import.meta.url); load(`@consiliency/contract/${path}`);',
  'import * as mod from "node:module"; const load=mod.createRequire(import.meta.url); load("../../omnigent-transport/src/types.js");',
  'import {createRequire} from "module"; const load=createRequire(import.meta.url); load("../../omnigent-transport/src/types.js");',
  'import * as mod from "module"; const load=mod.createRequire(import.meta.url); load("../../omnigent-transport/src/types.js");',
  'import mod from "node:module"; const load=mod.createRequire(import.meta.url); load("../../omnigent-transport/src/types.js");',
  'import mod from "module"; const load=mod.createRequire(import.meta.url); load("../../omnigent-transport/src/types.js");',
  'import {default as mod} from "module"; const load=mod.createRequire(import.meta.url); load("../../omnigent-transport/src/types.js");',
  'import mod = require("node:module"); const load=mod.createRequire(import.meta.url); load("../../omnigent-transport/src/types.js");',
  'import * as mod from "module"; const {createRequire: make}=mod; const load=make(import.meta.url); load("../../omnigent-transport/src/types.js");',
  'import * as mod from "module"; const make=mod.createRequire; const load=make(import.meta.url); load("../../omnigent-transport/src/types.js");',
  'import {createRequire} from "node:module"; const cr=createRequire; const load=cr(import.meta.url); load("../../omnigent-transport/src/types.js");',
  'module.require("../../omnigent-transport/src/types.js");',
  'module["require"]("../../omnigent-transport/src/types.js");',
])("rejects recursive source/loader escape: %s", (code) => {
  const f = fixture();
  try { f.write("packages/other/src/escape.ts", code); expect(() => checkBoundaries(f.root)).toThrow(); }
  finally { f.close(); }
});
it.each(["@consiliency/contract/ ", "@consiliency/contract/other/", "../../other/src/"])("pins computed loader literal bytes: %s", (prefix) => {
  const f = fixture();
  try {
    f.write("packages/core-contracts/src/coordination-contract.ts", readFileSync("packages/core-contracts/src/coordination-contract.ts", "utf8").replace("@consiliency/contract/${path}", `${prefix}\${path}`));
    expect(() => checkBoundaries(f.root)).toThrow("Computed");
  } finally { f.close(); }
});
it("rejects stale, renamed, value-kind and duplicate type exceptions", () => {
  const f = fixture();
  try {
    for (const code of ["", 'import { OmnigentProviderMode } from "../../omnigent-transport/src/types.js";', 'import type { Other } from "../../omnigent-transport/src/types.js";', 'import type { OmnigentProviderMode } from "../../omnigent-transport/src/types.js";\nimport type { OmnigentProviderMode } from "../../omnigent-transport/src/types.js";']) {
      f.write("packages/identity-isolation/src/types.ts", code);
      expect(() => checkBoundaries(f.root)).toThrow();
    }
  } finally { f.close(); }
});
it("pins the original createRequire binding while allowing unrelated line shifts", () => {
  const f = fixture();
  const original = readFileSync("packages/core-contracts/src/coordination-contract.ts", "utf8");
  try {
    f.write("packages/core-contracts/src/coordination-contract.ts", "\n// unrelated line shift\n" + original);
    expect(checkBoundaries(f.root).computedLoaders).toBe(1);
    f.write("packages/core-contracts/src/coordination-contract.ts", original.replace("createRequire(import.meta.url)", 'createRequire("/tmp/changed.cjs")'));
    expect(() => checkBoundaries(f.root)).toThrow("Computed");
  } finally { f.close(); }
});
it.each(['export * from "./bridge.test.js";', 'import("./bridge.test.js");', 'require("./bridge.test.js");'])("rejects production-to-test source relays: %s", (code) => {
  const f = fixture();
  try {
    f.write("packages/other/src/index.ts", code);
    f.write("packages/other/src/bridge.test.ts", 'export * from "../../omnigent-transport/src/types.js";');
    expect(() => checkBoundaries(f.root)).toThrow("Production import of test source");
  } finally { f.close(); }
});
it("rejects path aliases, import maps, symlinks and unsupported extensions", () => {
  for (const kind of ["paths", "imports", "symlink", "extension"]) {
    const f = fixture();
    try {
      if (kind === "paths") { f.write("packages/other/tsconfig.json", JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@escape": ["../omnigent-transport/src/types.ts"] } } })); f.write("packages/other/src/index.ts", 'import type {X} from "@escape";'); }
      if (kind === "imports") { f.write("packages/other/package.json", JSON.stringify({ name: "@test/other", imports: { "#escape": "../omnigent-transport/src/types.ts" } })); f.write("packages/other/src/index.ts", 'import type {X} from "#escape";'); }
      if (kind === "symlink") symlinkSync(join(f.root, "packages/omnigent-transport/src/types.ts"), join(f.root, "packages/other/src/link.ts"));
      if (kind === "extension") f.write("packages/other/src/escape.jsx", "export const x=1;");
      expect(() => checkBoundaries(f.root)).toThrow();
    } finally { f.close(); }
  }
});
