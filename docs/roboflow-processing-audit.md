# Roboflow Processing Audit

Recorded: 2026-09-17  
Baseline data: [roboflow-baseline-2026-09-17.json](../benchmarks/roboflow-baseline-2026-09-17.json)

Live image evidence: [2026-09-17 screenshot catalog](../benchmarks/roboflow-captures/2026-09-17_workflow_stephen-miano_bottle-inspection_coco-3/README.md)

## Current Screenshot Catalog

A controlled live run now records one Workflow-rendered screenshot for each simulator truth
class. All six requests completed successfully at 1x simulation speed in 258-434 ms. Every
normalized result was `UNKNOWN` at 0.0% confidence. The Workflow showed a `bottle` box for the
good, missing-cap, wrong-label, and underfill images; it showed no boxes for missing-label and
crooked-label; and it additionally labeled the underfill image as `cup`.

These screenshots catalog current behavior but are not a statistically meaningful accuracy
benchmark: there is one sample per class, and the active generic COCO model has no configured
defect classes.

## Conclusion

The Roboflow integration is operational, defensive, and correctly isolated from simulator
ground truth. Its accuracy is not currently measurable. The prior live run retained aggregate
connectivity and latency observations, but no labeled per-unit predictions or image corpus from
which to calculate a confusion matrix.

The only model-quality evidence currently available is that the generic `coco/3` model detected
synthetic bottles at 31-41% confidence. Those detections fell below the application's 50%
evidence threshold, so the mapper returned `UNKNOWN` and the configured fail-safe rejected the
units. This is expected out-of-distribution behavior, not evidence of a trained defect model.

## Processing Path

1. PE101 triggers one inspection request for a unit.
2. CAM01 captures a JPEG at quality 0.85 and sends pixels only.
3. The Vite proxy attaches the API key server-side and posts the base64 frame to the configured
   Workflow. A raw model transport is also available.
4. The response parser locates detections by payload shape, independent of Workflow step names.
5. Detections below 0.50 are excluded from decision evidence.
6. Any surviving mapped defect produces `FAIL`; the configured severity order selects the defect
   code when several defects survive.
7. A surviving `bottle` or `good` detection produces `PASS`; otherwise the result is `UNKNOWN`.
8. The PLC consumes the settled prediction on a scan boundary. Repeated transport failures,
   timeouts, or frozen frames fail safely through the existing interlock path.

## Operational Findings

| Area | Current result |
|---|---|
| Upstream reachability | Reachable on 2026-09-17 |
| Server identity | Roboflow Inference Server 1.6.0-post1 |
| Prior live volume | More than 100 successful inference requests; exact count not retained |
| Prior round trip | 144-617 ms; mean and P95 not retained |
| Browser security | Cloud calls correctly use the same-origin proxy; key remains server-side |
| Watchdog | Link drops after three consecutive inference failures |
| Frozen feed | Rejected after two repeated inspection frames |
| Active learning | Disabled in the current local configuration |
| Automated verification | Blocked: approved npm feed lacks required transitive tarballs |

## Accuracy Findings

No TP, TN, false-reject, or escape counts can be calculated from existing records. The HMI's
accepted/rejected counters are physical sensor counts and do not join predictions to ground truth.
`QualityEvaluation` types exist, but Phase 7 evaluation and Phase 8 historian storage have not been
implemented.

Two threshold details matter when comparing future runs:

- The 0.35 whole-unit unknown threshold is currently lower than the 0.50 detection floor. For
  mapped detections it is therefore effectively redundant: evidence cannot survive at a confidence
  low enough to trigger the second threshold.
- Unmapped classes are visible to the operator but ignored as decision evidence. A class-name
  mismatch can therefore turn confident model output into `UNKNOWN`.

The Workflow parser takes the first detection-shaped output. Because an empty array is accepted as
a valid detection result, an unrelated empty-array step appearing before the real prediction step
could mask later detections. This should be covered with a representative Workflow fixture before
changing the live Workflow shape.

## Required Comparison Protocol

Use a fixed, retained corpus with at least 30 images for each of the six truth classes. Run the
same images through both the baseline and candidate Workflows without changing application
thresholds. Retain every raw response, normalized verdict, confidence, latency, model/Workflow
version, and ground-truth label.

Report binary precision, recall, accuracy, unknown rate, false-reject rate, escape rate, per-defect
recall, defect-class accuracy, mean latency, and P95 latency. Treat `UNKNOWN` as its own outcome and
also report the production action caused by the configured fail-safe. Do not fold fail-safe rejects
into model true positives.