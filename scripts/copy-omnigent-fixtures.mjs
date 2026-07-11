#!/usr/bin/env node
import { cpSync, rmSync } from "node:fs";

const source = new URL("../fixtures/omnigent/", import.meta.url);
const target = new URL(
  "../packages/omnigent-transport/dist/fixtures/",
  import.meta.url,
);

rmSync(target, { force: true, recursive: true });
cpSync(source, target, { recursive: true });
