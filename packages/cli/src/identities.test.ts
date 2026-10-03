import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { IdentityProfileStatusStore } from "@omniagent-plus/identity-isolation";

import { COMMAND_REGISTRY } from "./command-registry.js";
import { executeCli } from "./runtime.js";

function readFixture<T>(name: string): T {
  return JSON.parse(
    readFileSync(
      new URL(`../../../fixtures/cli/identities/${name}`, import.meta.url),
      "utf8",
    ),
  ) as T;
}

const profilesDir = new URL("../../../fixtures/identity/profiles", import.meta.url).pathname;

describe("identity commands", () => {
  it("uses only injected allowlisted environment presence and persists no values", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "cli-env-presence-"));
    const argv = ["identities", "preflight", "--profile-id", "profile-codex-dev", "--profiles-dir", profilesDir, "--state-root", stateRoot, "--json"];
    const hostEnv = { OPENAI_ORG: "synthetic-private-org", UNLISTED_SETTING: "synthetic-private-unlisted" };
    const result = await executeCli(argv, COMMAND_REGISTRY, { hostEnv });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).result.environment.launchEnvKeys).toEqual(["OPENAI_ORG"]);
    expect(result.stdout).not.toContain("synthetic-private");
    expect(result.stdout).not.toContain("UNLISTED_SETTING");
    const store = await IdentityProfileStatusStore.open({ rootDir: stateRoot });
    expect(JSON.stringify(await store.listByProfileId("profile-codex-dev"))).not.toContain("synthetic-private");
    const noInjection = await executeCli(argv, COMMAND_REGISTRY);
    expect(JSON.parse(noInjection.stdout).result.environment.launchEnvKeys).toEqual([]);
  });
  it("lists metadata_only identity profiles", async () => {
    const fixture = readFixture<{
      count: number;
      ids: string[];
    }>("list.json");

    const result = await executeCli(
      ["identities", "list", "--profiles-dir", profilesDir, "--json"],
      COMMAND_REGISTRY,
    );
    const parsed = JSON.parse(result.stdout) as {
      readonly result: {
        readonly count: number;
        readonly profiles: Array<{ readonly id: string }>;
      };
    };

    expect(result.exitCode).toBe(0);
    expect(parsed.result.count).toBe(fixture.count);
    expect(parsed.result.profiles.map((profile) => profile.id)).toEqual(fixture.ids);
  });

  it("records identity preflight status through the selected state-root", async () => {
    const fixture = readFixture<{
      profileId: string;
      readiness: string;
      allowed: boolean;
      status: string;
    }>("preflight.json");
    const stateRoot = await mkdtemp(join(tmpdir(), "cli-identities-"));

    const result = await executeCli(
      [
        "identities",
        "preflight",
        "--profile-id",
        fixture.profileId,
        "--profiles-dir",
        profilesDir,
        "--state-root",
        stateRoot,
        "--json",
      ],
      COMMAND_REGISTRY,
    );
    const parsed = JSON.parse(result.stdout) as {
      readonly result: {
        readonly profileId: string;
        readonly readiness: string;
        readonly allowed: boolean;
        readonly status: {
          readonly status: string;
        };
        readonly persistedRecord: {
          readonly recordId: string;
        };
      };
    };
    const store = await IdentityProfileStatusStore.open({
      rootDir: stateRoot,
    });
    const statuses = await store.listByProfileId(fixture.profileId);

    expect(result.exitCode).toBe(0);
    expect(parsed.result.profileId).toBe(fixture.profileId);
    expect(parsed.result.readiness).toBe(fixture.readiness);
    expect(parsed.result.allowed).toBe(fixture.allowed);
    expect(parsed.result.status.status).toBe(fixture.status);
    expect(parsed.result.persistedRecord.recordId.length).toBeGreaterThan(0);
    expect(statuses).toHaveLength(1);
  });
});
