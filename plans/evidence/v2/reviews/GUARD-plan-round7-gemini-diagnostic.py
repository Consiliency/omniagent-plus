import hashlib
import json
import tempfile
import time
import phase_loop_runtime.panel_invoker as native
from dataclasses import asdict
from pathlib import Path

from phase_loop_runtime.advisor_board.schema import Board, Seat
from phase_loop_runtime.panel_invoker import ReviewLandingPolicy, invoke_board

root = Path(__file__).resolve().parents[1]
run = root / ".phase-loop/guard-plan-round7-gemini-diagnostic"
run.mkdir(exist_ok=False)
source_run = root / ".phase-loop/guard-plan-round7"
paths = [root / "plans/phase-plan-v2-GUARD.md", root / "plans/evidence/v2/TRIAGE-closeout.json",
         root / ".phase-loop/guard-source-evidence.md",
         source_run / "review-bundle.md", source_run / "review-instructions.md"]
hashes = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
scratch = Path(tempfile.mkdtemp(prefix="guard-gemini-followup-"))
scratch.chmod(0o700)
tempfile.tempdir = str(scratch)
board = Board("guard-gemini-followup", "review-followup", (
    Seat("gemini-3.8-flash", "high", harness="gemini", lens="alternative-approach"),
))

parser_observations = []
original_parser = native._broker_gemini_stream_result


def observed_parser(raw, protocol):
    result = original_parser(raw, protocol)
    rc, text, detail, metadata = result
    categories = (
        "tool or subagent activity observed", "malformed stream event",
        "malformed stream step", "malformed terminal stream result",
        "unexpected stream event", "malformed chunk acknowledgement",
        "incomplete ingestion result sequence", "changed or omitted its conversation",
        "no successful terminal response", "reports truncation",
    )
    category = next((item for item in categories if item in detail), None)
    if rc and category is None:
        category = "other_native_rejection"
    parser_observations.append({
        "native_returncode": rc, "native_reason_category": category,
        "native_metadata": {key: metadata.get(key) for key in (
            "provider_stream_outcome", "provider_stream_result_count",
            "provider_stream_output_sha256", "provider_stream_output_bytes",
        )},
        "result_returned_unchanged": True,
    })
    return result


native._broker_gemini_stream_result = observed_parser

start = time.monotonic()
result = invoke_board(
    board, "", artifact_ref=str(source_run / "review-bundle.md"),
    brief_ref=str(source_run / "review-instructions.md"), repo_dir=root, stream_dir=run,
    review_policy=ReviewLandingPolicy(required_seats=("gemini",), requires_president=False),
)
report = {
    "schema": "guard-review-followup.v1", "input_sha256": hashes,
    "inputs_unchanged": hashes == {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
    "elapsed_s": time.monotonic() - start, "board": asdict(board),
    "reason": "Read-only observation of the unchanged native parser return; same exact material; no result mutation, rule waiver or other seat restart",
    "parser_observations": parser_observations,
    "installed_runtime_files_changed": False,
    "instrumentation": "read_only_native_parser_result_observer_v1",
    "acceptance": "One seat only; not a completed panel, phase acceptance or IF gate",
    "result": {**asdict(result), "legs": [
        {**asdict(leg), "harden_isolation_evidence": leg.harden_isolation_evidence}
        for leg in result.legs
    ]},
}
native._broker_gemini_stream_result = original_parser
(run / "result.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps({"result_path": str(run / "result.json"), "inputs_unchanged": report["inputs_unchanged"],
                  "legs": [{"leg": leg.leg, "status": leg.status, "text_bytes": len(leg.text.encode())}
                           for leg in result.legs]}), flush=True)
