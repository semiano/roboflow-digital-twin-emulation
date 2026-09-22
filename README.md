# Virtual Vision Cell

Browser-based industrial digital twin: a simulated bottling line where a computer vision
system inspects a rendered camera feed and a virtual PLC acts on the result.

See [functional_spec.md](functional_spec.md) for the system specification,
[plan.md](plan.md) for the implementation plan, and [TODO.md](TODO.md) for live build status.
The current Roboflow operational and accuracy baseline is documented in
[docs/roboflow-processing-audit.md](docs/roboflow-processing-audit.md).

## Quick start

```bash
npm install
npm run dev     # http://localhost:5173
```

It runs the full inspection loop out of the box against `MockVisionProvider` — no account
and no configuration needed.

### Connecting Roboflow

Copy `.env.example` to `.env.local` and fill in three values:

```bash
ROBOFLOW_API_KEY=...             # no VITE_ prefix — never enters the client bundle
VITE_ROBOFLOW_WORKSPACE=...      # both from "Deploy Workflow" in the Roboflow editor
VITE_ROBOFLOW_WORKFLOW_ID=...
```

Then pick **ROBOFLOW** in the Vision & Fault Injection panel. The Workflow needs an image
input, an object detection block, and (optionally) visualization blocks; its step output
names do not matter, because the response is parsed by shape.

Requests go through the dev server at `/rf-infer`, which forwards to Roboflow and attaches
the key. This is not a workaround for convenience: Roboflow's cloud endpoints send no
`Access-Control-Allow-Origin`, so a browser cannot call them directly — and an API key has
no business being in a client bundle regardless. The **SELF-HOSTED** runtime talks straight
to `inference server start` on `localhost:9001`, with no proxy involved.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server with HMR |
| `npm run test` | Vitest — headless, no GPU required |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, including architectural boundary rules |
| `npm run build` | Typecheck + production bundle |

## The architectural rule

The only connection from the simulated world to the vision system is **rendered pixels**.
The only connection back into the controls system is a **vision prediction**.

```
GROUND TRUTH ──┬──> evaluation / dataset generation
               └──X── vision / PLC        (blocked by ESLint layer rules)
```

`ProductGroundTruth` lives in `GroundTruthManager`, keyed by unit ID — deliberately *not*
on the `Product` record, so no module can reach it by accident. `npm run lint` fails the
build if `src/controls/**` or `src/vision/**` imports it.

## Layout

```
src/
  simulation/   physical world: clock, conveyor, products, sensors, cameras, scene
  controls/     virtual PLC: tags, state machine, reject queue, alarms
  vision/       the AI boundary: provider interface, mock provider, roboflow/ adapter
  historian/    inspection records, metrics, traceability
  dataset/      synthetic data generation and annotation export
  hmi/          React UI — reads engine snapshots only
  models/       shared domain types
  config/       all tunable values
  core/         event bus, logger, real clock
```

Simulation and controls logic never imports React, and the engine is constructible
headlessly so the full inspect → reject → record loop is testable in CI without a GPU.

## Current state

Phases F and 1–6 are complete. The cell renders, products flow with enforced spacing, all six
variants are distinguishable through the inspection camera, and the full automation chain
runs: photoeyes PE100–PE103 → virtual PLC on a 10 ms scan → inspection sequence with a
1000 ms timeout and fail-safe → unit-identity reject queue → animated pneumatic diverter.
Faults, interlocks and alarms are injectable from the HMI.

The PLC's entire input surface is `SimulationEngine.getPlcInputImage()`, and a test pins its
key set so ground truth cannot leak in.

Inference runs through `VisionProvider`. `MockVisionProvider` models accuracy, latency modes
and independent false-reject/escape rates, and `ProviderVisionGateway` adapts its async call
onto the PLC's polled scan boundary. The mock sees ground truth through a one-value oracle —
"what defect is in front of the camera right now" — so it never learns a unit id and no
module in `src/vision` imports the truth store. Both providers are held to one shared
behavioural contract suite.

### The Roboflow integration

One inference per unit, fired on the PE101 rising edge and consumed on a scan boundary, with
a comms watchdog behind it — Roboflow is wired in the way a plant wires a smart sensor.

- **Workflows first.** The primary transport is `POST /infer/workflows/{workspace}/{id}`, so
  the inspection recipe — model, thresholds, class filtering, visualization — stays
  versioned in Roboflow instead of compiled into the control system. Re-tuning the
  inspection is a Workflow edit, not a release. A direct model endpoint is the alternative.
- **Runtime is a live control.** The same request runs unchanged against Roboflow Cloud, a
  Dedicated Deployment, or self-hosted Inference; the HMI switches between them mid-run.
- **Both overlays.** Detections are drawn client-side on a canvas layered over CAM01, and if
  the Workflow includes a visualization block its own rendered frame can be shown instead.
  Neither is ever drawn into the camera buffer — the pixels sent for inference stay clean,
  which matters because those same frames feed active learning and the dataset generator.
- **Active learning closes the loop.** Frames the model was least sure about are pushed back
  into a Roboflow project for labelling. Confidence is the only trigger, by design: "this was
  an escape" needs ground truth, which this layer must never see.
- **It degrades like equipment.** Missing credentials, an unreachable endpoint, repeated
  failures, or a frozen camera feed all end as `VISION_OFFLINE` through the PLC's ordinary
  interlock path — debounced, so a connection handshake does not stop the line.

Next: Phase 7 — quality metrics. Ground truth and prediction are joined *after* the PLC has
acted, turning the existing pass/fail stream into a confusion matrix, false-reject and escape
rates, first-pass yield, and latency percentiles.
