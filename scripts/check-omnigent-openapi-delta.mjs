#!/usr/bin/env node
import assert from "node:assert/strict";

const [baseTag = "v0.10.0", targetTag = "v0.11.0"] = process.argv.slice(2);
const expectedBaseTag = "v0.10.0";
const expectedTargetTag = "v0.11.0";
assert.equal(baseTag, expectedBaseTag);
assert.equal(targetTag, expectedTargetTag);

const documents = {};
for (const tag of [baseTag, targetTag]) {
  const url = `https://raw.githubusercontent.com/omnigent-ai/omnigent/${tag}/openapi.json`;
  const response = await fetch(url);
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
const operationCount = (document) =>
  Object.values(document.paths).reduce(
    (total, path) =>
      total + Object.keys(path).filter((key) => methods.has(key)).length,
    0,
  );
const eventTypes = (document) => {
  const union = document.components.schemas.ServerStreamEvent;
  const members = union.anyOf ?? union.oneOf;
  return members
    .map((member) => member.$ref.split("/").at(-1))
    .map((name) => document.components.schemas[name].properties.type.const)
    .sort();
};

const base = documents[baseTag];
const target = documents[targetTag];
const baseSchemas = names(base.components.schemas);
const targetSchemas = names(target.components.schemas);
const basePaths = names(base.paths);
const targetPaths = names(target.paths);
const baseEvents = eventTypes(base);
const targetEvents = eventTypes(target);
const changedSchemas = baseSchemas.filter(
  (name) =>
    name in target.components.schemas &&
    JSON.stringify(base.components.schemas[name]) !==
      JSON.stringify(target.components.schemas[name]),
);

assert.equal(operationCount(target), 100);
assert.equal(targetPaths.length, 72);
assert.equal(targetSchemas.length, 143);
assert.equal(targetEvents.length, 54);
assert.deepEqual(difference(targetPaths, basePaths), []);
assert.deepEqual(difference(basePaths, targetPaths), []);
assert.deepEqual(difference(targetSchemas, baseSchemas), [
  "BackgroundTaskInfo",
  "FailedResponseObject",
  "SessionPermissionModeEvent",
  "SessionTitleEvent",
]);
assert.deepEqual(difference(baseSchemas, targetSchemas), []);
assert.deepEqual(changedSchemas, [
  "FailedEvent",
  "ServerStreamEvent",
  "SessionModelEvent",
  "SessionProjectSummary",
  "SessionResponse",
  "SessionStatusEvent",
  "SessionUsage",
  "UpdateSessionRequest",
]);
assert.deepEqual(difference(targetEvents, baseEvents), [
  "session.permission_mode",
  "session.title",
]);
assert.deepEqual(difference(baseEvents, targetEvents), []);

const schemas = target.components.schemas;
assert.deepEqual(schemas.SessionPermissionModeEvent.required, [
  "type",
  "conversation_id",
  "permission_mode",
]);
assert.deepEqual(schemas.SessionTitleEvent.required, [
  "type",
  "conversation_id",
  "title",
]);
assert.deepEqual(schemas.FailedResponseObject.required, ["status"]);
assert.deepEqual(names(schemas.BackgroundTaskInfo.properties), [
  "command",
  "description",
  "id",
  "status",
  "type",
]);

console.log(
  JSON.stringify({
    base: baseTag,
    events: targetEvents.length,
    operations: operationCount(target),
    paths: targetPaths.length,
    schemas: targetSchemas.length,
    target: targetTag,
  }),
);
