import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { expect, it } from "vitest";
import { IMAGE, PLATFORM } from "../../scripts/prepare-test-postgres.mjs";

function workflows() {
  return Object.fromEntries(["ci", "verify", "publish"].map((name) => [name, parse(readFileSync(`.github/workflows/${name}.yml`, "utf8"))]));
}
function policy(w: ReturnType<typeof workflows>) {
  const sha = "${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}";
  for (const name of ["ci", "verify", "publish"]) {
    expect(w[name].permissions).toEqual({ contents: "read" });
    expect(w[name].on).not.toHaveProperty("pull_request_target");
    expect(JSON.stringify(w[name])).not.toContain("secrets");
  }
  expect(w.ci.on.push.branches).toEqual(["main"]);
  expect(w.ci.on).toHaveProperty("pull_request");
  for (const caller of [w.ci, w.publish]) {
    expect(caller.jobs.verify.uses).toBe("./.github/workflows/verify.yml");
    expect(caller.jobs.verify.with).toBeUndefined();
    expect(caller.jobs.verify.permissions).toEqual({ contents: "read" });
  }
  expect(w.verify.on.workflow_call.inputs).toBeUndefined();
  const job = w.verify.jobs.verify;
  expect(job.timeoutMinutes ?? job["timeout-minutes"]).toBe(20);
  expect(job.env.TESTED_SOURCE_SHA).toBe(sha);
  expect(job.services.postgres.image).toBe(IMAGE);
  expect(job.services.postgres.options).toBe(`--platform ${PLATFORM}`);
  expect(job.services.postgres.ports).toEqual(["127.0.0.1::5432"]);
  expect(job.steps.filter((step: { run?: string }) => step.run?.startsWith("pnpm verify"))).toHaveLength(1);
  expect(job.steps.find((step: { id?: string }) => step.id === "gate").env.GUARD_FIXTURE_PORT).toBe("${{ job.services.postgres.ports['5432'] }}");
  expect(job.outputs.artifact_manifest_sha256).toBe("${{ steps.gate.outputs.artifact_manifest_sha256 }}");
  expect(w.ci.jobs["guard-required"].needs).toBe("verify");
  expect(w.ci.jobs["guard-required"].if).toBe("${{ always() }}");
  expect(w.ci.jobs["guard-required"].steps[0].run).toBe('test "${{ needs.verify.result }}" = success');
  expect(w.publish.on.workflow_dispatch.inputs.mode.default).toBe("dry-run");
  expect(w.publish.on.release.types).toEqual(["published"]);
  for (const name of ["rehearsal", "publish-npm"]) {
    const consumer = w.publish.jobs[name];
    expect(consumer.needs).toBe("verify");
    expect(consumer.env.TESTED_SOURCE_SHA).toBe(sha);
    expect(consumer.steps[0].with.ref).toBe("${{ env.TESTED_SOURCE_SHA }}");
    expect(consumer.steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/download-artifact")).with["artifact-ids"]).toBe("${{ needs.verify.outputs.artifact_id }}");
    const serialized = JSON.stringify(consumer);
    expect(serialized).not.toMatch(/NPM_CLI|pnpm (install|pack|build)|secrets/);
    expect(serialized).toContain("needs.verify.outputs.artifact_manifest_sha256");
    const calls = consumer.steps.at(-1).run.trim().split("\n");
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(call).toContain("--verified-artifact");
  }
  expect(w.publish.jobs.rehearsal.permissions).toEqual({ contents: "read" });
  expect(w.publish.jobs.rehearsal.steps.at(-1).env.NPM_PUBLISH_DRY_RUN).toBe("1");
  expect(w.publish.jobs["publish-npm"].permissions).toEqual({ contents: "read", "id-token": "write" });
  expect(w.publish.jobs["publish-npm"].if).toBe("${{ github.event_name == 'release' || (github.event_name == 'workflow_dispatch' && inputs.mode == 'publish' && github.ref == format('refs/heads/{0}', github.event.repository.default_branch) && github.ref_protected == true) }}");
  expect(w.publish.jobs.rehearsal.if).toBe("${{ github.event_name == 'pull_request' || (github.event_name == 'workflow_dispatch' && inputs.mode != 'publish') }}");
}
it("binds shared CI/release gate, source, artifacts and publication-only OIDC", () => { policy(workflows()); });
it.each(["token", "secrets", "ref", "artifact", "binding", "service", "required", "dispatch"])("rejects workflow topology falsifier %s", (change) => {
  const w = workflows();
  if (change === "token") w.verify.permissions["id-token"] = "write";
  if (change === "secrets") w.publish.jobs.verify.secrets = "inherit";
  if (change === "ref") w.ci.jobs.verify.with = { ref: "main" };
  if (change === "artifact") w.publish.jobs.rehearsal.steps.find((step: { uses?: string }) => step.uses?.startsWith("actions/download-artifact")).with["artifact-ids"] = "123";
  if (change === "binding") w.publish.jobs.rehearsal.env.TESTED_SOURCE_SHA = "${{ github.sha }}";
  if (change === "service") w.verify.jobs.verify.services.postgres.ports = ["5432:5432"];
  if (change === "required") w.ci.jobs["guard-required"].if = "success()";
  if (change === "dispatch") w.publish.jobs["publish-npm"].if = "${{ inputs.mode == 'publish' }}";
  expect(() => policy(w)).toThrow();
});
