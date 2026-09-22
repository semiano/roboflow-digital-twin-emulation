# Virtual Vision Cell — Master TODO

**Status legend:** `[x]` Completed · `[~]` Open (in progress) · `[ ]` Todo

**References:** [functional_spec.md](functional_spec.md) · [plan.md](plan.md)

**Last updated:** 2026-09-16

**Verification status:** `npm run lint` clean · `npm run typecheck` clean · `npm run test` 128 passed · `npm run build` succeeds

---

## Progress Summary

| Phase | Status | Notes |
|-------|--------|-------|
| F. Foundations | `[x]` Completed | Scaffold, lint boundaries verified firing, core utils |
| 1. Visual Simulation | `[x]` Completed | Verified in browser; bottles traverse the cell, CAM01 independent |
| 2. Product & Defect Model | `[x]` Completed | All 6 variants visually distinguishable in CAM01 |
| 3. Sensors & PLC | `[x]` Completed | Browser-verified: 48 units, 35.7% reject rate vs 30% configured |
| 4. HMI | `[x]` Completed | Event log strip closed it out |
| 5. Mock Vision | `[x]` Completed | **MVP gate: 12 of 15 §52 items; 13–15 need Phases 7–8** |
| 6. Roboflow Integration | `[x]` Completed | Workflow + model transports, live runtime switching, overlays, active learning |
| 7. Quality Metrics | `[~]` In Progress | Evaluation core complete; dashboard + acceptance tests remain |
| 8. Historian | `[ ]` Todo | Owns §52 item 15 |
| 9. Domain Shift | `[ ]` Todo | |
| 10. Dataset Generator | `[ ]` Todo | **Interview demo gate (spec §53)** |

---

## Decisions & Deviations From Spec

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | `Product` does **not** embed `groundTruth` (spec §8 shows it inline) | If ground truth rides on the Product, any module holding one can read it and spec §56 becomes unenforceable. Truth lives in `GroundTruthManager` keyed by unitId. |
| D2 | `DefectType` split out of `GroundTruth.ts` into `models/DefectType.ts` | Defect *names* are shared vocabulary the vision layer legitimately needs; per-unit *truth* is what must be isolated. Lets the C1 lint rule block the latter without blocking the former. |
| D3 | Label moved low on the bottle body (`labelCenterHeight` 0.05) | At the original proportions the label occluded the liquid surface, making UNDERFILL invisible to the camera. Regression-guarded by a test. |
| D4 | Inspection camera uses its own `WebGLRenderer` + canvas | Gives a real canvas for `captureStream()` in Phase 6 and guarantees the vision layer never sees the operator view or HMI overlays. |
| D5 | Inspection arch offset upstream; camera bracket behind the near plane | The original arch upright sat directly in the camera's line of sight, producing a black feed. |
| D6 | React `StrictMode` omitted | Double-mounting would create two WebGL contexts. |
| D7 | Vision results are **polled** by the PLC, not pushed (`VisionGateway.poll`) | A real inference call is async, but a PLC consumes it on a scan boundary like a message instruction's done bit. Polling keeps the simulation deterministic no matter when the promise settles. Phase 5's `VisionProvider` sits behind this port. |
| D8 | `StubVisionGateway` added in Phase 3, **removed in Phase 5** | It was scaffolding for plan.md §Phase 3's stubbed provider. `MockVisionProvider` + `ProviderVisionGateway` replace it, and the C1 lint exemption it needed is gone with it. |
| D9 | Reject station modelled as a fast cylinder (80/50/120 ms) that only imparts force while **extending** | With slower timings the rod was still out when the next unit arrived and pushed a good bottle into the bin. A retracting rod moves away from the belt, so it physically cannot push — modelling that correctly also fixes the bug. |
| D10 | `REJECT_STATION_FAULT` detected from missing extend feedback, not a magic "faulted" input | A real PLC has no "the cylinder is broken" bit; it infers the fault from the command/feedback mismatch. This makes the injected fault exercise real logic. |
| D11 | HMI toggles act on engine state, not `event.target.checked` | Controlled inputs fed by a 10 Hz snapshot desync from the DOM on a fast second click, sending the wrong value. Found in browser testing. |
| D12 | Fault reset lives in Machine Controls, not the alarm banner | Fault *conditions* auto-clear, so the banner vanishes while the state machine is still latched FAULTED — leaving no way to reset. Found in browser testing. |
| D13 | `MockVisionProvider` takes a **frame oracle** (`() => DefectType \| undefined`) instead of importing `GroundTruthManager` | Spec §48 permits the mock to use truth, but it only ever needs to know what is in front of the lens. A one-value oracle gives it exactly that and no unit id, so `src/vision` imports no truth at all and the C1 lint exemption could be **deleted** rather than documented. |
| D14 | The mock's three error knobs are non-overlapping | `falsePositiveProbability` = good called FAIL, `falseNegativeProbability` = bad called PASS, and `accuracy` governs only the *class* of a correct FAIL. Overlapping them would make the Phase 7 confusion matrix double-count its own inputs. |
| D15 | An outcome is released only when the promise has settled **and** sim time has passed the reported latency | Keeps the line deterministic and makes "50 ms inference" mean the same thing at 1x and 5x, while leaving `inspect()` genuinely async for Roboflow. Cost: engine-driving tests must `await` a microtask per tick. |
| D16 | HMI vision status reads `visionProviderConnected`, not the PLC's `visionConnected` tag | The tag is a copy taken on the last scan, and the clock is paused before the first START — so a freshly loaded page showed "Vision OFFLINE" with the fault-injection box ticked while the provider was healthy. Found in browser testing. |
| D17 | Default `VITE_RUNTIME_MODE` is `MOCK_VISION`, not `SIMULATION_ONLY` | Phase 5 makes the full loop work with no configuration; a fresh clone should demonstrate it. `ROBOFLOW` degrades to the mock with a logged warning until Phase 6, rather than running a line with no inspection. |
| D18 | `src/core/RealClock.ts` is a sanctioned second wall clock, exempted from C5 | A network round trip to Roboflow elapses while simulated time is frozen between fixed steps, so `SimulationClock` cannot measure it. C5's intent is that no module invents its own notion of time, so the wall-clock read is named, documented and confined to one file rather than scattered. |
| D19 | Roboflow is reached through a **dev-server proxy**, and that is the default runtime | Measured, not assumed: `serverless.roboflow.com` returns no `Access-Control-Allow-Origin` at all, so *every* browser-direct call is blocked regardless of content type or auth header (the Phase 5 spike tested the legacy `detect.roboflow.com` host, which did allow it). The proxy is also the correct answer on its own merits — the API key sits in a non-`VITE_` variable and is never inlined into the client bundle. |
| D20 | Workflow outputs are located by **shape**, not by configured name | Step output names are chosen by whoever builds the Workflow in the Roboflow editor. Making the operator mirror those names in `.env` would mean a Workflow edit silently breaks the line. The parser finds the detection payload and the visualization by structure instead, so the Workflow can be rebuilt freely. |
| D21 | Bounding boxes reach the HMI from `ProviderVisionGateway`, not through `VisionOutcome` | A PLC consumes a verdict, not geometry. Routing detections through the control layer would widen the input surface that `PlcBoundary.test.ts` pins, for a purely cosmetic feature. The gateway holds the last prediction and the engine reads it for the snapshot. |
| D22 | `VISION_OFFLINE` is filtered through a 1.5 s on-delay timer | Found in browser testing: selecting the ROBOFLOW mode faulted the line during the asynchronous connection handshake, then left it latched FAULTED with no condition present. A controller does not fault on one scan of a comms bit — debouncing it is both the fix and the more realistic behaviour. |
| D23 | Active learning triggers on **confidence only** | "This was an escape" requires ground truth, which the vision layer must never see (C1). Uncertainty is exactly what a real deployment has to work with, so the uploader uses that. Truth-aware triggers belong on the evaluation side in Phases 7–8. |
| D24 | `maxRetries` is deadline-bound and skips HTTP errors | A retry that lands after the PLC's 1000 ms inspection timeout is worse than no retry: the result arrives with no pending inspection and reads as a tracking error. Retries therefore share the first attempt's deadline, and an HTTP status is treated as the server's considered answer rather than something to repeat. |

---

## Phase F — Foundations  `[x]` COMPLETED

- [x] F1. Scaffold Vite + React 18 + TypeScript project in workspace root
- [x] F2. Install runtime deps (`three`, `zustand`, `idb`)
- [x] F3. Install dev deps (`@types/three`, `vitest`, `eslint`, `@typescript-eslint/*`, `@types/node`)
- [x] F4. `tsconfig.json` — strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `@/*` alias
- [x] F5. `vite.config.ts` — path alias + Vitest config + setup file
- [x] F6. ESLint layer-boundary rules enforcing C1 / C4 / C5 — **verified firing** with a throwaway probe file
- [x] F7. `.env.example` + `.gitignore` (`.env`, `dataset-output/`)
- [x] F8. `src/core/EventBus.ts` — typed pub/sub over `SystemEvent` union, contained handler errors
- [x] F9. `src/core/Logger.ts` — structured, level-gated, ring buffer for the HMI event log
- [x] F10. `src/utils/ids.ts` — monotonic serial generators
- [x] F11. `src/utils/rng.ts` — seeded mulberry32 PRNG with weighted pick
- [x] F12. `src/utils/math.ts`, `src/utils/timing.ts` (TON timer + edge detector)
- [x] F13. `src/config/simulation.config.ts`, `line.config.ts`, `vision.config.ts`
- [x] F14. State bridge: throttled 10 Hz engine snapshot → zustand store
- [x] F15. Verify `npm run build` / `lint` / `test` all green

---

## Phase 1 — Visual Simulation  `[x]` COMPLETED

**Acceptance:** A bottle moves smoothly through a recognizable production cell. **Verified in browser.**

- [x] 1.1 `SimulationClock` — fixed-step accumulator, elapsed/delta, speed `0/0.5/1/2/5`, pause/resume/reset
- [x] 1.2 `SceneManager` — renderer, lighting, resize, operator camera + OrbitControls
- [x] 1.3 Static geometry — floor, conveyor bed + rails + legs, guarding, spawn station, inspection arch, camera bracket, backdrop, reject station, reject bin, stack light, control cabinet
- [x] 1.4 `ConveyorSystem` — config (5.0m / 2.0 / 3.5 / 4.8), `positionToWorld()`
- [x] 1.5 `ProductFactory` + `ProductMeshFactory` — parametric bottle (body, shoulder, neck, cap, label, fill)
- [x] 1.6 `ProductManager` — spawn/advance/despawn, minimum spacing, infeed gate
- [x] 1.7 `InspectionCamera01` — dedicated renderer + canvas @ 20fps, `getMediaStream()` / `grabFrame()` ready for Phase 6
- [x] 1.8 `SimulationEngine` — deterministic tick order, **headless-constructible** (no GPU needed in CI)
- [x] 1.9 `AppShell` — 3D viewport, CAM01 panel, controls, metrics, alarm banner
- [x] 1.10 Tests — clock determinism under jitter, speed scaling, stall cap, kinematics, spacing, despawn, seed reproducibility

---

## Phase 2 — Product & Defect Model  `[x]` COMPLETED

**Acceptance:** Operator can manually inject each defect; all six variants visually distinguishable. **Verified in CAM01.**

- [x] 2.1 Models — `DefectType`, `ProductGroundTruth`, `Product` (see deviations D1/D2)
- [x] 2.2 `GroundTruthManager` — private store, returns copies, blocked from controls/vision by lint
- [x] 2.3 Defect rendering — MISSING_CAP, MISSING_LABEL, CROOKED_LABEL, WRONG_LABEL, UNDERFILL
- [x] 2.4 `ProductFactory` spawn APIs — good / with-defect / random / random-defect
- [x] 2.5 `ProductionRecipe` — units/min + weighted defect distribution, auto-spawn
- [x] 2.6 Injection buttons in Machine Controls
- [x] 2.7 Tests — ground-truth derivation per class, `expectedResult`, distribution convergence over 20k samples, underfill-visibility regression guard

---

## Phase 3 — Sensors & PLC  `[x]` COMPLETED

**Acceptance:** Mock results cause the *correct* units to be rejected (verified with adjacent good/bad pairs). **Verified in tests and in browser** — a 48-unit auto-production soak produced a 35.7% reject rate against a 30% configured defect rate, with no alarms and no tracking errors.

- [x] 3.1 `VirtualSensor` + `SensorManager` — PE100/101/102/103, edge detection, `SensorEvent`; a unit pushed off the belt no longer breaks downstream beams
- [x] 3.2 `PlcTags` store (spec §18 verbatim tag names)
- [x] 3.3 `ControlStateMachine` — STOPPED/STARTING/RUNNING/STOPPING/FAULTED
- [x] 3.4 `Interlocks` + fault set (VISION_OFFLINE, CAMERA_OFFLINE, REJECT_STATION_FAULT, PRODUCT_TRACKING_ERROR, JAM_DETECTED)
- [x] 3.5 `VirtualPLC` — 10ms scan cycle, read → interlocks → state machine → inspection → reject → write
- [x] 3.6 Inspection sequence (spec §20) + `VISION_TIMEOUT_MS=1000` + all three fail-safe modes
- [x] 3.7 `RejectQueue` — unit-identity keyed, never time-based
- [x] 3.8 `RejectStation` — RETRACTED/EXTENDING/EXTENDED/RETRACTING, animated rod, unit physically pushed and slid into the bin (no teleport)
- [x] 3.9 `AlarmManager` — six initial alarms, severity, acknowledge, auto-clear on condition reset
- [x] 3.10 Tests — 8 of the 10 cases from spec §49 (the two confusion-matrix cases belong to Phase 7)
- [x] 3.11 Boundary test — `getPlcInputImage()` asserted free of ground truth, key set pinned

**Engine tick order (physical):** transport → sense → PLC scan → actuate.

---

## Phase 4 — HMI  `[x]` COMPLETED

**Acceptance:** Entire line operable without developer tools.

- [x] 4.1 Layout grid per spec §46, dark industrial theme
- [x] 4.2 `StatusHeader` — machine state, camera, vision, mode, reject queue, sim clock
- [x] 4.3 `ProductionPanel` — START/STOP/RESET FAULTS/RESET, line speed, sim speed, auto production, defect injection
- [x] 4.4 `FaultInjectionPanel` — equipment faults + inference latency (environmental faults move to Phase 9 domain shift)
- [x] 4.5 `PlcTagMonitor` — grouped live tags with change highlight
- [x] 4.6 `AlarmBanner` — active alarms sorted by severity + acknowledge
- [x] 4.7 `VisionPanel` — CAM01 feed + live result/defect/confidence/latency readout
- [x] 4.8 Event log strip — bounded engine ring, newest first, photoeye chatter filtered out
- [x] 4.9 Reset statistics (covered by RESET)

---

## Phase 5 — Mock Vision  `[x]` COMPLETED ← **MVP GATE**

**Acceptance:** End-to-end inspection loop operates without Roboflow. **Verified in tests and
in browser** — a 103-unit soak at 30% configured defects with 5% false-reject and 5% escape
rates produced a 30.2% reject rate, no alarms, no tracking errors and a draining queue.

- [x] 5.1 `VisionTypes` — `VisionInput` / `VisionDetection` / `VisionPrediction` (pixels + frame metadata only, C2)
- [x] 5.2 `VisionProvider` interface (spec §14), adapted onto the polled `VisionGateway` port by `ProviderVisionGateway` (D7/D15)
- [x] 5.3 `MockVisionProvider` — accuracy, six latency modes + RANDOM, independent FP/FN rates, disconnect; replaces `StubVisionGateway` (D8/D13/D14)
- [x] 5.4 `RuntimeMode` switch — live segmented control; ROBOFLOW/DATASET disabled until their phases (D17)
- [x] 5.5 `VISION MODE: MOCK` badge on CAM01 + header chip
- [x] 5.6 DI wiring — engine owns provider construction, PLC consumes only the port
- [x] 5.7 **Spike:** Roboflow browser transport + `captureStream` quality — see findings below
- [x] 5.8 MVP checklist run — 12 of 15 items in spec §52 pass; 13–15 are owned by Phases 7–8

### 5.7 Spike findings (measured in-browser, 512×512 CAM01 canvas)

| Question | Result |
|----------|--------|
| `canvas.captureStream(20)` | Live track, 512×512 @ 20 fps, `active: true` |
| `track.requestFrame()` | **Available** — a frame can be forced on the PE101 edge instead of waiting for cadence |
| WebRTC viability | `RTCPeerConnection.addTrack()` of the canvas track succeeds; `MediaRecorder` VP8 supported |
| JPEG encode cost | ~3 ms (q0.85 and q0.92 alike) |
| Frame size | 10.1 KB @ q0.85 · 12.7 KB @ q0.92 · 67 KB PNG |
| Base64 for the frame API | 1.8 ms, 17.4 k chars |
| `createImageBitmap` | 3.3 ms |
| Frame is not blank | Luma min 26 / mean 95.9 / max 255 with a unit at the station |
| `https://detect.roboflow.com` | **200, CORS clean from localhost** — no proxy needed |
| `http://localhost:9001` | Connection refused (inference server not running; expected) |

**Conclusion for Phase 6:** implement `FrameApiTransport` first. It is CORS-clean, the
per-inspection cost is ~5 ms of encoding against a 1000 ms PLC timeout, and one frame per
unit matches how the PLC already consumes results. `WebRTCTransport` is viable and stays
second on the list.

**Risk found:** a hidden or backgrounded tab throttles `requestAnimationFrame` to **zero**
and tasks to ~1 Hz, which starves the frame pipeline (it also inflated `toBlob` timings to a
flat ~1010 ms until measured synchronously). The demo must run in a visible tab, and Phase 6
should treat a stalled feed as a camera fault rather than a silent hang.

### Spec §52 MVP checklist

| # | Item | Status |
|---|------|--------|
| 1 | Conveyor visually operates | `[x]` |
| 2 | Products have unique IDs | `[x]` |
| 3 | At least three defect types | `[x]` six |
| 4 | Inspection camera shows an independent view | `[x]` |
| 5 | Operator can start/stop the line | `[x]` |
| 6 | Operator can inject a defect | `[x]` |
| 7 | Mock vision can inspect the product | `[x]` |
| 8 | PLC associates the result with the correct product | `[x]` pinned by test |
| 9 | Failed product reaches the reject station | `[x]` |
| 10 | Reject actuator removes the correct failed product | `[x]` |
| 11 | Good product continues | `[x]` |
| 12 | HMI updates production counters | `[x]` |
| 13 | Ground truth is compared to prediction | `[ ]` Phase 7 |
| 14 | False rejects and escapes are tracked | `[ ]` Phase 7 — the mock already *produces* both on demand |
| 15 | Traceability record is generated | `[ ]` Phase 8 |

---

## Phase 6 — Roboflow Integration  `[x]` COMPLETED

**Acceptance (spec §51):** actual rendered camera images are evaluated by Roboflow, and
live predictions drive PLC reject decisions. **Verified in browser** — the proxy reaches
the live Roboflow Workflow endpoint (`/info` identifies *Roboflow Inference Server
1.6.0-post1*; an unauthenticated Workflow call returns a real `401 Unauthorized api_key`),
and a stubbed-upstream run reproduces spec §53 exactly: **FAIL · MISSING_CAP · 98.2%**,
correct unit rejected, boxes drawn on CAM01.

### Design intent

The cell treats Roboflow the way a plant treats a smart sensor: one inference per unit,
fired on the PE101 rising edge, answered on a scan boundary, with a comms watchdog behind
it. The integration is built around **Workflows** rather than a raw model endpoint because
that is where the inspection *recipe* belongs — thresholds, filtering, aggregation and
visualization are versioned on the Roboflow side, not compiled into the PLC. The same
request body runs unchanged against Serverless Cloud, a Dedicated Deployment, or a
self-hosted Inference server, and the HMI can switch between them live — that portability
is the point, so it is a first-class control rather than an env var.

### Roboflow surface exercised

| Capability | Where it shows up |
|------------|-------------------|
| Workflows HTTP API (`POST /infer/workflows/{ws}/{id}`) | Primary transport |
| Model API (`POST /{project}/{version}`) | Secondary transport, same client |
| Serverless Cloud / Dedicated / self-hosted Inference | Live runtime selector, one base URL swap |
| Workflow visualization block output | Roboflow-rendered frame shown beside our own overlay |
| `supervision`-style client-side rendering | `DetectionOverlay` on CAM01 |
| Active learning dataset upload | Low-confidence frames pushed back to a Roboflow project |
| `Authorization: Bearer` auth | Default; legacy `?api_key=` retained as a CORS escape hatch |

### Tasks

- [x] 6.1 `CameraStreamAdapter` interface (spec §13) — `InspectionCamera` implements it; `captureStream(20)` + `grabFrame(): Blob`
- [x] 6.2 `RoboflowClient` — base-URL resolution, auth transport, `AbortSignal.timeout`, bounded retry, HTTP error mapping
- [x] 6.3 `WorkflowTransport` — `POST {base}/infer/workflows/{workspace}/{workflowId}`, base64 image input
- [x] 6.4 `ModelTransport` — `POST {base}/{project}/{version}`, raw base64 body
- [x] 6.5 `RoboflowProvider` implementing `VisionProvider` — reachability probe, comms watchdog, stale-feed detection, request cancellation
- [x] 6.6 `PredictionMapper` — tolerant workflow-output parsing, class→defect map, severity aggregation, UNKNOWN rule, unmapped-class reporting
- [x] 6.7 `DetectionOverlay` on CAM01 (overlay layer only — the captured stream stays clean) + Roboflow visualization passthrough
- [x] 6.8 `RoboflowPanel` — runtime/transport selectors, endpoint, credential state, request/error counters, round-trip vs server time
- [x] 6.9 Active learning — `RoboflowDatasetUploader`, low-confidence auto-upload + manual send, session cap
- [x] 6.10 Engine wiring — `ROBOFLOW` runtime mode enabled; missing/failed credentials degrade to `VISION_OFFLINE`, never a crash
- [x] 6.11 Tests — mapper fixtures, transport abort/retry/error mapping, uploader policy, shared `VisionProvider` contract suite run against both providers
- [x] 6.12 Browser verification — proxy path proven against live Roboflow; closed loop proven with a stubbed upstream
- [x] 6.13 Live run against Roboflow Cloud — real key, real Workflow (`stephen-miano/bottle-inspection`, `coco/3` + visualization blocks). 100+ inferences, 144–617 ms round trip, boxes and `label_visualization` both rendering on CAM01.

### Live-run findings

- The connect-time `/info` probe shared `requestTimeoutMs` (850 ms, sized for the PLC's
  inspection deadline). A cold TLS handshake to the cloud exceeded it, so the first
  connection always reported OFFLINE while a manual `fetch` succeeded. Split out as
  `probeTimeoutMs` — the probe is not on the PLC's critical path.
- A COCO model is out of distribution on these synthetic renders: it does find the
  bottle, but at 31–41% confidence, under `minimumDetectionConfidence`. The line
  correctly reports UNKNOWN and rejects under the fail-safe rather than trusting it.
  This is the Phase 9 domain-shift story, observed for real.
- The overlay box lags the unit by the round trip, because it is drawn at the
  coordinates the model returned for the frame it was sent.

### CORS finding (measured in-browser, supersedes the Phase 5 spike)

| Attempt | Result |
|---------|--------|
| `POST serverless.roboflow.com` + `Authorization: Bearer` | Preflight rejected — no `Access-Control-Allow-Origin` |
| `POST serverless.roboflow.com?api_key=` + `application/json` | Preflight rejected |
| `POST serverless.roboflow.com?api_key=` + `text/plain` | Simple request, but **response** blocked — no ACAO header |
| `POST serverless.roboflow.com?api_key=` + `x-www-form-urlencoded` | Same — blocked |
| `GET serverless.roboflow.com/info` | 200 (simple GET, but still no ACAO for credentialed use) |
| **Via dev-server proxy** | `/info` → 200 identity, workflow → real `401`, dataset upload → real `401` |

Roboflow's cloud endpoints are not CORS-enabled, so no browser-direct call can work
whatever headers it sends. The Phase 5 spike tested the **legacy** `detect.roboflow.com`
host, which did allow it; that host is now deprecated. The proxy is the correct route
anyway — see D19.

### Roboflow setup required for a live model

1. Create a project with classes `bottle`, `missing_cap`, `missing_label`, `crooked_label`, `wrong_label`, `underfill` (the map in `vision.config.ts` accepts hyphen or underscore forms).
2. Build a Workflow: image input → Object Detection block → Bounding Box + Label visualization blocks. Output names do not matter (D20).
3. Put the API key in `ROBOFLOW_API_KEY` (no `VITE_` prefix — it stays server-side) and the workspace slug and workflow ID in `VITE_ROBOFLOW_WORKSPACE` / `VITE_ROBOFLOW_WORKFLOW_ID` in `.env.local`, then pick the ROBOFLOW runtime mode.

---

## Phase 7 — Quality Metrics

**Accuracy recovery priority:** complete 7.1-7.3 first so the current model and every candidate
use the same math. Then execute Phase 10, train the six-class model, update the Workflow, and
rerun the screenshot catalog before spending time on dashboard polish, historian UI, or domain
shift. Generic `coco/3` has no knowledge of this application's defect classes; threshold tuning
is not a substitute for training data.

- [x] 7.1 `EvaluationService` — TP/TN/FP/FN joined *after* PLC action
- [x] 7.2 Manufacturing terms — FP = False Reject, FN = Escape
- [x] 7.3 `MetricsEngine` — spec §29 counters, precision/recall/accuracy, FPY, mean + P95 latency, coverage + unknown rate
- [ ] 7.4 `QualityDashboard` — confusion matrix, KPI tiles, defect Pareto, latency histogram
- [ ] 7.5 The last two spec §49 tests — false negative recorded as an escape, false positive recorded as a false reject

---

## Phase 8 — Historian

- [ ] 8.1 `InspectionRecord` (spec §30) + `InspectionRepository` on IndexedDB
- [ ] 8.2 Bounded retention + purge (default 10k)
- [ ] 8.3 `TraceabilityTable` — virtualized, filters, row select → detail drawer
- [ ] 8.4 Optional downscaled JPEG frame capture per record
- [ ] 8.5 Review/retraining queue + `reviewPolicy` thresholds (spec §32)
- [ ] 8.6 CSV/JSON export

---

## Phase 9 — Domain Shift

- [ ] 9.1 `EnvironmentController` — lighting, camera pose, exposure, materials, colors, background
- [ ] 9.2 Post-process — blur, noise, temporary occluder
- [ ] 9.3 `DOMAIN SHIFT` toggle + intensity slider
- [ ] 9.4 Metrics annotated with active domain profile

---

## Phase 10 — Dataset Generator

- [x] 10.1 `DATASET_GENERATION` mode — PLC/conveyor disabled, scenario-stepped
- [ ] 10.2 `DomainRandomizer` + seed reproducibility
- [x] 10.3a Six-class dataset contract — `bottle`, `missing_cap`, `missing_label`, `crooked_label`, `wrong_label`, `underfill`
- [x] 10.3b `AnnotationGenerator` foundation — projected whole-product YOLO box, clamping, visibility and camera-frustum rejection
- [x] 10.3c Annotation QA against the real bottle meshes and training camera poses
- [~] 10.4 `DatasetGenerator` — deterministic balanced preview + progress complete; production mix, large batches, and cancel remain
- [x] 10.5 `DatasetExporter` — ZIP with split `images/` + `labels/`, `data.yaml`, `dataset.json`
- [x] 10.6 Camera-pose split — training A–D, demo E excluded (spec §37)
- [x] 10.7 Annotation QA overlay mode + in-app training-set browser
- [ ] 10.8 Generate at least 5,000 images with at least 500 examples per class
- [~] 10.9 Roboflow ZIP upload, version generation, and confirmed training API handoff implemented; production dataset generation, annotation-health review, completed training verification, and active Workflow model selection remain
- [ ] 10.10 Rerun the six-image screenshot catalog and retained evaluation set under a new versioned directory

---

## Post-MVP / Optional

- [ ] O1. MQTT adapter (spec §40), feature-flagged
- [ ] O2. OPC UA bridge architecture note — keep `PlcTags` flat/serializable
- [ ] O3. Extra defect classes (DAMAGED_CAP, FOREIGN_OBJECT, WRONG_BOTTLE_COLOR, OVERFILL, SURFACE_DAMAGE)
- [ ] O4. COCO export
- [ ] O5. External persistence backends

---

## Standing Constraints (checked every phase gate)

- [x] C1. Ground truth never reaches `vision/` or `controls/` — ESLint rule active and verified firing
- [x] C2. Roboflow receives pixels only — `InspectionCamera.getMediaStream()` / `grabFrame()` are the only outlets
- [x] C3. Vision never mutates the scene — the vision layer only answers `VisionGateway.poll`; every actuator command originates in `VirtualPLC`
- [x] C4. No React imports in engine layers — ESLint rule active
- [x] C5. Single clock — ESLint rule active; rAF timestamp is the only real-time input
- [x] C6. No magic numbers — all tunables in `src/config/`
- [x] C7. TS strict, no `any` — `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` on

---

## Commands

```bash
npm run dev        # dev server at http://localhost:5173
npm run test       # vitest, headless, no GPU required
npm run typecheck  # tsc --noEmit
npm run lint       # eslint incl. architectural boundary rules
npm run build      # typecheck + production bundle
```
