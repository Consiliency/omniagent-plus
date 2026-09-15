import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runProcess } from "../tests/helpers/guard-process.ts";
import { checkoutInputs, PUBLIC_PACKAGES, sha256 } from "./verify-publish-artifacts.mjs";

export async function packVerified(root, destination, identity) {
  mkdirSync(destination, { recursive: true });
  if (readdirSync(destination).length) throw new Error("Artifact destination is not fresh");
  const inputs = await checkoutInputs(root);
  if (identity.tested_source_sha !== inputs.source_sha) throw new Error("Tested source mismatch");
  const packages = [];
  for (const [name, dir] of PUBLIC_PACKAGES) {
    const pkg = JSON.parse(readFileSync(resolve(root, dir, "package.json"), "utf8"));
    if (pkg.name !== name || pkg.private === true) throw new Error("Unexpected/private pack identity");
    const before = readdirSync(destination);
    await runProcess("pnpm", ["pack", "--pack-destination", destination], { cwd: resolve(root, dir) });
    const added = readdirSync(destination).filter((file) => !before.includes(file));
    const tarball = added[0];
    if (added.length !== 1 || !tarball || !tarball.endsWith(".tgz")) throw new Error("Pack must produce one tarball");
    packages.push({ name, version: pkg.version, tarball, sha256: sha256(readFileSync(resolve(destination, tarball))) });
  }
  const manifestPath = resolve(destination, "manifest.json");
  const bytes = JSON.stringify({ schema: "guard-artifacts.v1", ...inputs, identity, packages }, null, 2) + "\n";
  writeFileSync(manifestPath, bytes);
  return { manifestPath, digest: sha256(bytes), packages };
}
