#!/usr/bin/env node
import assert from "node:assert/strict";

const [baseTag = "v0.11.0", targetTag = "v0.12.0"] = process.argv.slice(2);
const expectedBaseTag = "v0.11.0";
const expectedTargetTag = "v0.12.0";
assert.equal(baseTag, expectedBaseTag);
assert.equal(targetTag, expectedTargetTag);

const upstreamRoot = "https://raw.githubusercontent.com/omnigent-ai/omnigent";
const documents = {};
for (const tag of [baseTag, targetTag]) {
  const response = await fetch(`${upstreamRoot}/${tag}/openapi.json`);
  assert.equal(response.ok, true, `${tag} OpenAPI fetch failed: ${response.status}`);
  documents[tag] = await response.json();
}

const methods = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
]);
const names = (value) => Object.keys(value).sort();
const difference = (left, right) => left.filter((value) => !right.includes(value));
const operationNames = (document) =>
  Object.entries(document.paths)
    .flatMap(([path, operations]) =>
      Object.keys(operations)
        .filter((method) => methods.has(method))
        .map((method) => `${method.toUpperCase()} ${path}`),
    )
    .sort();
const eventTypes = (document) => {
  const union = document.components.schemas.ServerStreamEvent;
  const members = union.anyOf ?? union.oneOf;
  return members
    .map((member) => member.$ref.split("/").at(-1))
    .map((name) => document.components.schemas[name].properties.type.const)
    .sort();
};

const annotationKeys = new Set(["description", "format", "title"]);
const stripAnnotations = (value, preserveKeys = false) => {
  if (Array.isArray(value)) {
    return value.map((child) => stripAnnotations(child));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => preserveKeys || !annotationKeys.has(key))
      .map(([key, child]) => [key, stripAnnotations(child, key === "properties")]),
  );
};

const base = documents[baseTag];
const target = documents[targetTag];
const baseSchemas = names(base.components.schemas);
const targetSchemas = names(target.components.schemas);
const basePaths = names(base.paths);
const targetPaths = names(target.paths);
const baseOperations = operationNames(base);
const targetOperations = operationNames(target);
const baseEvents = eventTypes(base);
const targetEvents = eventTypes(target);
const changedSchemas = baseSchemas.filter(
  (name) =>
    name in target.components.schemas &&
    JSON.stringify(stripAnnotations(base.components.schemas[name])) !==
      JSON.stringify(stripAnnotations(target.components.schemas[name])),
);

assert.equal(targetOperations.length, 101);
assert.equal(targetPaths.length, 73);
assert.equal(targetSchemas.length, 146);
assert.equal(targetEvents.length, 54);
assert.deepEqual(difference(targetOperations, baseOperations), [
  "POST /v1/imports/local",
]);
assert.deepEqual(difference(baseOperations, targetOperations), []);
assert.deepEqual(difference(targetPaths, basePaths), ["/v1/imports/local"]);
assert.deepEqual(difference(basePaths, targetPaths), []);
assert.deepEqual(difference(targetSchemas, baseSchemas), [
  "ImportedSessionRef",
  "LocalImportRequest",
  "LocalImportResponse",
]);
assert.deepEqual(difference(baseSchemas, targetSchemas), []);
assert.deepEqual(changedSchemas, [
  "AutomaticSessionRenameRequest",
  "ElicitationResolvedEvent",
  "ImportSessionRequest",
  "SessionForkRequest",
  "SessionGitOptions",
  "UpdateSessionRequest",
]);
assert.deepEqual(difference(targetEvents, baseEvents), []);
assert.deepEqual(difference(baseEvents, targetEvents), []);

const schemas = target.components.schemas;
assert.deepEqual(schemas.ElicitationResolvedEvent.required, [
  "type",
  "elicitation_id",
]);
assert.deepEqual(schemas.ElicitationResolvedEvent.properties.action.anyOf, [
  { enum: ["accept", "decline", "cancel"], type: "string" },
  { type: "null" },
]);
assert.equal(schemas.ElicitationResolvedEvent.properties.action.default, null);
assert.deepEqual(
  difference(
    names(schemas.ImportSessionRequest.properties),
    names(base.components.schemas.ImportSessionRequest.properties),
  ),
  ["project_id", "title"],
);
assert.deepEqual(schemas.ImportSessionRequest.required, [
  "source",
  "external_session_id",
  "items",
]);
assert.deepEqual(
  stripAnnotations(schemas.ImportSessionRequest.properties.project_id),
  { anyOf: [{ type: "string" }, { type: "null" }] },
);
assert.deepEqual(stripAnnotations(schemas.ImportSessionRequest.properties.title), {
  anyOf: [{ maxLength: 512, type: "string" }, { type: "null" }],
});
assert.deepEqual(
  difference(
    names(schemas.SessionForkRequest.properties),
    names(base.components.schemas.SessionForkRequest.properties),
  ),
  [
    "codex_bypass_sandbox",
    "model_override",
    "reasoning_effort",
    "terminal_launch_args",
  ],
);
assert.equal(schemas.SessionForkRequest.properties.codex_bypass_sandbox.default, false);
assert.deepEqual(stripAnnotations(schemas.SessionForkRequest.properties.model_override), {
  anyOf: [{ type: "string" }, { type: "null" }],
});
assert.deepEqual(stripAnnotations(schemas.SessionForkRequest.properties.reasoning_effort), {
  anyOf: [{ type: "string" }, { type: "null" }],
});
assert.deepEqual(
  stripAnnotations(schemas.SessionForkRequest.properties.terminal_launch_args),
  {
    anyOf: [
      { items: { type: "string" }, type: "array" },
      { type: "null" },
    ],
  },
);
assert.equal(schemas.SessionGitOptions.properties.existing_branch.default, false);
assert.equal(schemas.SessionGitOptions.properties.existing_branch.type, "boolean");
assert.deepEqual(names(schemas.LocalImportRequest.properties), [
  "host_id",
  "limit",
  "source",
]);
assert.deepEqual(schemas.LocalImportRequest.required, ["host_id", "source"]);
assert.deepEqual(stripAnnotations(schemas.LocalImportRequest.properties.source), {
  anyOf: [
    {
      enum: ["claude", "codex", "kimi", "kiro", "opencode", "pi", "qwen"],
      type: "string",
    },
    { const: "all", type: "string" },
  ],
});
assert.deepEqual(stripAnnotations(schemas.LocalImportRequest.properties.limit), {
  default: 10,
  maximum: 100,
  minimum: 1,
  type: "integer",
});
assert.deepEqual(schemas.LocalImportResponse.required, [
  "imported",
  "already_imported",
  "failed",
  "sessions",
]);
assert.deepEqual(schemas.ImportedSessionRef.required, ["session_id"]);
assert.deepEqual(names(schemas.ImportedSessionRef.properties), ["session_id", "title"]);
assert.equal(schemas.AutomaticSessionRenameRequest.properties.title.maxLength, 100);
assert.equal(schemas.UpdateSessionRequest.properties.title.anyOf[0].maxLength, 200);

const sourcePaths = [
  "omnigent/server/routes/sessions/routes_core.py",
  "omnigent/server/schemas.py",
  "omnigent/cli.py",
];
const sources = {};
for (const path of sourcePaths) {
  const response = await fetch(`${upstreamRoot}/${targetTag}/${path}`);
  assert.equal(response.ok, true, `${targetTag} source fetch failed for ${path}`);
  sources[path] = await response.text();
}

const routesSource = sources[sourcePaths[0]];
const schemasSource = sources[sourcePaths[1]];
const cliSource = sources[sourcePaths[2]];
assert.match(
  routesSource,
  /ProjectSessionCreateRequest\s+if[\s\S]{0,180}payload\.get\("project_id"\) is not None[\s\S]{0,180}else SessionCreateRequest/,
);
assert.match(
  schemasSource,
  /class SessionCreateRequest\(_SessionCreateRequestBase\):[\s\S]{0,180}?agent_id: str\n/,
);
assert.match(
  schemasSource,
  /class ProjectSessionCreateRequest\(_SessionCreateRequestBase\):[\s\S]{0,500}?agent_id: str \| None = None\n/,
);
assert.match(cliSource, /@server\.command\("stop"\)/);
assert.match(cliSource, /@server\.command\("status"\)/);
assert.match(cliSource, /if background:[\s\S]{0,300}?_run_background_server\(\)/);

console.log(
  JSON.stringify({
    base: baseTag,
    events: targetEvents.length,
    operations: targetOperations.length,
    paths: targetPaths.length,
    schemas: targetSchemas.length,
    structuralSchemaChanges: changedSchemas,
    target: targetTag,
  }),
);
