import { describe, expect, it } from "vitest";

import {
  loadOmnigentCapabilityMatrix,
  loadOmnigentFakeServerScenarios,
  loadOmnigentHttpSurface,
  loadOmnigentSourceMetadata,
} from "./contract-fixtures.js";
import { mapOmnigentEventSequence } from "./event-mapper.js";
import { FakeOmnigentServer } from "./fake-omnigent-server.js";
import { mapOmnigentHistory } from "./history-mapper.js";
import { omnigentStreamEventTypes, type OmnigentHistoryItem, type OmnigentRawEvent, type OmnigentSessionSnapshot } from "./types.js";

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function readRawEvents(response: Response): Promise<OmnigentRawEvent[]> {
  const body = await response.text();
  return body
    .split("\n\n")
    .map((block) => block.trim())
    .filter((block) => block.startsWith("data: ") && block !== "data: [DONE]")
    .map((block) => JSON.parse(block.slice(6)) as OmnigentRawEvent);
}

describe("fake omnigent conformance", () => {
  it("covers the frozen scenario catalog and session lifecycle flows", async () => {
    const scenarios = loadOmnigentFakeServerScenarios();
    const sourceMetadata = loadOmnigentSourceMetadata();
    const capabilityMatrix = loadOmnigentCapabilityMatrix();
    const httpSurface = loadOmnigentHttpSurface();
    const server = await FakeOmnigentServer.start();

    try {
      const createResponse = await fetch(`${server.baseUrl}/v1/sessions`, {
        body: JSON.stringify({
          idempotencyKey: "conformance",
          targetHarness: "codex",
          title: "Conformance session",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const snapshot = await readJson<OmnigentSessionSnapshot>(createResponse);
      const turnResponse = await fetch(
        `${server.baseUrl}/v1/sessions/${snapshot.id}/events`,
        {
          body: JSON.stringify({
            data: { message: "hello transport" },
            type: "message",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      );

      expect(turnResponse.ok).toBe(true);
      expect(
        scenarios.scenarios.map((scenario) => scenario.name),
      ).toEqual(
        expect.arrayContaining([
          "create_send_stream_success",
          "interrupt_cancel",
          "reconnect_snapshot_dedupe",
          "malformed_sse_skip",
          "terminal_marker_deduplication",
          "v0_4_harness_catalog_and_read_state",
        ]),
      );
      expect(sourceMetadata.freeze_target.tag).toBe("v0.4.0");
      expect(sourceMetadata.freeze_target.commit).toBe(
        "31669e1b413216c865d0ed7dfb469fb142c889f5",
      );
      expect(httpSurface.stream_contract.official_v0_4_event_count).toBe(
        omnigentStreamEventTypes.length,
      );
      expect(capabilityMatrix.capabilities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "harness_catalog",
            status: "supported",
          }),
          expect.objectContaining({
            name: "harness_override",
            status: "blocked",
          }),
          expect.objectContaining({
            name: "child_session",
            status: "blocked",
          }),
        ]),
      );

      const historyResponse = await fetch(
        `${server.baseUrl}/v1/sessions/${snapshot.id}/items`,
      );
      const historyItems = await readJson<OmnigentHistoryItem[]>(historyResponse);
      const mappedHistory = mapOmnigentHistory(snapshot.id, historyItems);
      const streamResponse = await fetch(
        `${server.baseUrl}/v1/sessions/${snapshot.id}/stream`,
      );
      const rawEvents = await readRawEvents(streamResponse);
      const runtimeEvents = mapOmnigentEventSequence(snapshot.id, rawEvents);

      expect(mappedHistory.history.events.some((event) => event.type === "runtime.turn.started")).toBe(
        true,
      );
      expect(runtimeEvents.filter((event) => event.type === "runtime.turn.completed")).toHaveLength(
        1,
      );
      expect(runtimeEvents.some((event) => event.type === "runtime.text.delta")).toBe(true);

      await fetch(`${server.baseUrl}/v1/sessions/${snapshot.id}/events`, {
        body: JSON.stringify({
          data: {},
          type: "interrupt",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const cancelledHistory = await readJson<OmnigentHistoryItem[]>(
        await fetch(`${server.baseUrl}/v1/sessions/${snapshot.id}/items`),
      );
      const cancelledEvents = mapOmnigentHistory(snapshot.id, cancelledHistory).history.events;

      expect(cancelledEvents.some((event) => event.type === "runtime.turn.cancelled")).toBe(
        true,
      );
    } finally {
      await server.stop();
    }
  });
});
