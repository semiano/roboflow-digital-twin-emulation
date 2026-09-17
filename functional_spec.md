# Virtual Vision Cell

## Simulated Industrial Computer Vision Inspection System

**Document type:** System Specification
**Primary implementation target:** GitHub Copilot coding environment
**Primary stack:** TypeScript, React, Vite, Three.js
**Primary external platform:** Roboflow
**Project goal:** Create an interactive simulated manufacturing cell where Roboflow observes a rendered camera feed, makes visual inspection decisions, and those decisions are consumed by a simulated industrial controls system.

---

# 1. Executive Summary

Virtual Vision Cell is a browser-based industrial digital twin used to demonstrate computer vision inspection, synthetic data generation, manufacturing controls integration, quality traceability, and closed-loop automation.

The application will simulate a production line containing:

* a conveyor
* manufactured units
* configurable defects
* an inspection station
* an industrial camera
* photoeyes and virtual sensors
* a reject mechanism
* a virtual PLC
* a production HMI
* a lightweight MES/historian
* a Roboflow computer vision integration

The simulator must maintain a strict separation between:

1. **Simulator ground truth**
2. **What the computer vision system can visually observe**

Roboflow must receive only rendered camera imagery or video.

Roboflow must not directly receive internal simulator state such as:

* whether a cap exists
* whether a label is missing
* defect type
* object coordinates
* expected inspection result
* internal asset IDs

This separation is fundamental to the project.

The simulator therefore acts as both:

* a digital twin of an industrial process
* an independent ground-truth system for evaluating the vision model

The high-level closed loop is:

```text
Virtual Manufacturing Process
        ↓
Rendered Inspection Camera
        ↓
Roboflow Vision Model / Workflow
        ↓
Inspection Result
        ↓
Virtual PLC
        ↓
Reject / Accept Decision
        ↓
Production Historian / MES
        ↓
Quality Metrics + Retraining Queue
```

The finished product should look and behave like a credible manufacturing automation POC rather than a game.

---

# 2. Primary Demo Scenario

The initial process will inspect bottles traveling along a conveyor.

Each unit may contain configurable visual defects.

MVP defect classes:

* GOOD
* MISSING_CAP
* MISSING_LABEL
* CROOKED_LABEL
* WRONG_LABEL
* UNDERFILL

Optional later defect classes:

* DAMAGED_CAP
* FOREIGN_OBJECT
* WRONG_BOTTLE_COLOR
* OVERFILL
* SURFACE_DAMAGE

The production sequence is:

1. Unit spawns upstream.
2. Unit travels along conveyor.
3. Entry photoeye detects unit.
4. Unique serial number is assigned.
5. Unit enters camera inspection zone.
6. Camera renders the product.
7. Roboflow evaluates the image/video.
8. Roboflow returns detections or inspection result.
9. Virtual PLC records the decision against the unit.
10. Unit continues down the conveyor.
11. If failed, PLC tracks the unit to reject station.
12. Reject actuator fires only when the correct failed unit arrives.
13. MES/historian stores the completed inspection.
14. Simulator ground truth is compared with CV prediction.
15. False positives, false negatives, and low-confidence examples may enter the review/retraining queue.

The CV system must never directly cause a product to disappear from the conveyor.

The PLC/control layer owns process actions.

---

# 3. Core Product Principles

## 3.1 Simulation must behave like automation

Use industrial control concepts where practical:

* sensors
* actuators
* state machines
* PLC tags
* timers
* queued reject decisions
* alarm states
* communications health
* process interlocks

Avoid game-centric abstractions.

---

## 3.2 Vision is a sensor

Treat Roboflow similarly to an intelligent industrial sensor.

The vision system should return observations such as:

```json
{
  "inspectionId": "INS-0001284",
  "timestamp": "2026-09-16T19:30:02.492Z",
  "result": "FAIL",
  "defectCode": "MISSING_CAP",
  "confidence": 0.982
}
```

The controls layer decides what to do with the observation.

---

## 3.3 Ground truth is independent

Every simulated unit has private internal ground truth.

Example:

```json
{
  "unitId": "UNIT-001284",
  "sku": "BOTTLE-500ML",
  "capPresent": false,
  "labelPresent": true,
  "labelRotation": 0.7,
  "fillLevel": 0.96,
  "actualResult": "FAIL",
  "actualDefect": "MISSING_CAP"
}
```

This object must never be passed to Roboflow.

---

## 3.4 Camera output is the AI boundary

The AI boundary begins at the simulated camera.

Roboflow receives:

```text
pixels
```

It does not receive:

```text
simulator state
object metadata
ground-truth labels
Three.js scene graph references
product coordinates
```

---

## 3.5 Observability is part of the product

The demo should visibly expose:

* line speed
* machine status
* camera status
* Roboflow status
* current inspection
* last defect
* reject count
* first-pass yield
* prediction accuracy
* latency
* false rejects
* escaped defects

---

# 4. Target Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                     WEB APPLICATION                      │
│                                                          │
│  ┌────────────────────┐        ┌──────────────────────┐  │
│  │ THREE.JS SIMULATOR │        │ HMI / DASHBOARD      │  │
│  │                    │        │                      │  │
│  │ Conveyor           │        │ Start / Stop         │  │
│  │ Products           │        │ Speed                │  │
│  │ Camera             │        │ Fault Injection      │  │
│  │ Sensors            │        │ PLC Tags             │  │
│  │ Reject mechanism   │        │ Metrics              │  │
│  └─────────┬──────────┘        └──────────┬───────────┘  │
│            │                              │              │
│            └──────────────┬───────────────┘              │
│                           ▼                              │
│                 ┌───────────────────┐                    │
│                 │ VIRTUAL PLC       │                    │
│                 │                   │                    │
│                 │ Tags              │                    │
│                 │ Timers            │                    │
│                 │ State machines    │                    │
│                 │ Reject queue      │                    │
│                 └─────────┬─────────┘                    │
└───────────────────────────┼──────────────────────────────┘
                            │
                            │ rendered video
                            ▼
                  ┌────────────────────┐
                  │ CAMERA BRIDGE      │
                  │                    │
                  │ Browser MediaStream│
                  │ or RTSP / OBS      │
                  └─────────┬──────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ ROBOFLOW      │
                    │               │
                    │ Model         │
                    │ Workflow      │
                    │ Detection     │
                    │ Tracking      │
                    │ QC Logic      │
                    └───────┬───────┘
                            │
                       prediction
                            │
                            ▼
                  ┌───────────────────┐
                  │ INFERENCE ADAPTER │
                  └─────────┬─────────┘
                            │
                            ▼
                      VIRTUAL PLC
                            │
            ┌───────────────┴───────────────┐
            ▼                               ▼
      Reject actuator                  MES / Historian
```

---

# 5. Suggested Repository Structure

```text
virtual-vision-cell/
│
├── README.md
├── SYSTEM_SPEC.md
├── package.json
├── vite.config.ts
├── tsconfig.json
│
├── src/
│   │
│   ├── app/
│   │   ├── App.tsx
│   │   ├── routes.tsx
│   │   └── AppShell.tsx
│   │
│   ├── simulation/
│   │   ├── SimulationEngine.ts
│   │   ├── SimulationClock.ts
│   │   ├── SceneManager.ts
│   │   ├── ConveyorSystem.ts
│   │   ├── ProductManager.ts
│   │   ├── ProductFactory.ts
│   │   ├── SensorManager.ts
│   │   ├── RejectStation.ts
│   │   ├── InspectionCamera.ts
│   │   └── GroundTruthManager.ts
│   │
│   ├── controls/
│   │   ├── VirtualPLC.ts
│   │   ├── PlcTags.ts
│   │   ├── ControlStateMachine.ts
│   │   ├── RejectQueue.ts
│   │   ├── AlarmManager.ts
│   │   └── Interlocks.ts
│   │
│   ├── vision/
│   │   ├── VisionProvider.ts
│   │   ├── RoboflowAdapter.ts
│   │   ├── MockVisionProvider.ts
│   │   ├── CameraStreamAdapter.ts
│   │   ├── PredictionMapper.ts
│   │   └── VisionTypes.ts
│   │
│   ├── historian/
│   │   ├── Historian.ts
│   │   ├── InspectionRepository.ts
│   │   ├── MetricsEngine.ts
│   │   └── TraceabilityService.ts
│   │
│   ├── dataset/
│   │   ├── DatasetGenerator.ts
│   │   ├── DomainRandomizer.ts
│   │   ├── AnnotationGenerator.ts
│   │   └── DatasetExporter.ts
│   │
│   ├── hmi/
│   │   ├── OverviewScreen.tsx
│   │   ├── ProductionPanel.tsx
│   │   ├── VisionPanel.tsx
│   │   ├── FaultInjectionPanel.tsx
│   │   ├── PlcTagMonitor.tsx
│   │   ├── AlarmBanner.tsx
│   │   ├── TraceabilityTable.tsx
│   │   └── QualityDashboard.tsx
│   │
│   ├── models/
│   │   ├── Product.ts
│   │   ├── Inspection.ts
│   │   ├── GroundTruth.ts
│   │   ├── Alarm.ts
│   │   └── ProductionOrder.ts
│   │
│   ├── config/
│   │   ├── simulation.config.ts
│   │   ├── line.config.ts
│   │   └── vision.config.ts
│   │
│   └── utils/
│       ├── ids.ts
│       ├── timing.ts
│       └── math.ts
│
├── public/
│   ├── textures/
│   ├── models/
│   └── sounds/
│
└── tests/
    ├── simulation/
    ├── controls/
    ├── vision/
    └── integration/
```

---

# 6. Simulation Engine

## 6.1 Rendering

Use Three.js.

The main scene should contain:

* factory floor
* conveyor
* guides/rails
* product spawn station
* inspection station
* camera
* reject mechanism
* reject bin
* stack light
* simple control cabinet
* machine guarding where appropriate

Visual realism is desirable but secondary to process realism.

Prefer:

* clean geometry
* realistic proportions
* believable industrial colors/materials
* clear animation

Avoid spending excessive development time on visual decoration.

---

# 7. Simulation Clock

The simulation must use a centralized clock.

Do not allow every component to independently depend on browser wall-clock time.

Required interface:

```typescript
interface SimulationClock {
  elapsedSeconds: number;
  deltaSeconds: number;
  speedMultiplier: number;

  pause(): void;
  resume(): void;
  reset(): void;
  setSpeed(multiplier: number): void;
}
```

Support:

```text
0x
0.5x
1x
2x
5x
```

This will later allow accelerated production tests.

---

# 8. Product Model

Each simulated product must have a persistent identity.

```typescript
type DefectType =
  | "NONE"
  | "MISSING_CAP"
  | "MISSING_LABEL"
  | "CROOKED_LABEL"
  | "WRONG_LABEL"
  | "UNDERFILL";

interface ProductGroundTruth {
  defectType: DefectType;

  capPresent: boolean;
  labelPresent: boolean;
  labelRotationDegrees: number;

  fillLevel: number;

  expectedResult: "PASS" | "FAIL";
}

interface Product {
  unitId: string;
  sku: string;

  positionMeters: number;
  velocityMetersPerSecond: number;

  createdAt: number;

  groundTruth: ProductGroundTruth;

  inspection?: InspectionDecision;

  rejected?: boolean;
}
```

---

# 9. Product Generation

Create `ProductFactory`.

Support:

```typescript
spawnGoodProduct()
spawnProductWithDefect(defect)
spawnRandomProduct()
```

HMI controls must allow:

```text
Inject Good Product
Inject Missing Cap
Inject Missing Label
Inject Crooked Label
Inject Wrong Label
Inject Underfill
Inject Random Defect
```

Also support automatic production.

Example:

```typescript
interface ProductionRecipe {
  sku: string;

  unitsPerMinute: number;

  defectProbability: number;

  defectDistribution: {
    MISSING_CAP: number;
    MISSING_LABEL: number;
    CROOKED_LABEL: number;
    WRONG_LABEL: number;
    UNDERFILL: number;
  };
}
```

---

# 10. Conveyor System

The conveyor is a deterministic transport system.

Configuration:

```typescript
interface ConveyorConfig {
  lengthMeters: number;
  speedMetersPerSecond: number;

  inspectionPositionMeters: number;
  rejectPositionMeters: number;
  exitPositionMeters: number;
}
```

Suggested defaults:

```text
Length: 5.0 meters
Inspection point: 2.0 meters
Reject station: 3.5 meters
Exit point: 4.8 meters
```

Objects should maintain physical spacing.

Initial MVP does not require a full physics engine.

Products may move using deterministic kinematics.

---

# 11. Sensors

At minimum create:

```text
PE100 Entry photoeye
PE101 Inspection photoeye
PE102 Reject photoeye
PE103 Exit photoeye
```

Sensor interface:

```typescript
interface VirtualSensor {
  id: string;
  active: boolean;
  positionMeters: number;

  evaluate(products: Product[]): boolean;
}
```

Sensors should generate rising/falling events.

Example:

```typescript
interface SensorEvent {
  sensorId: string;
  state: boolean;
  simulationTime: number;
  unitId?: string;
}
```

---

# 12. Inspection Camera

Use a dedicated Three.js camera.

Do not use the same camera that the user uses to navigate the scene.

Required cameras:

```text
OperatorCamera
InspectionCamera01
```

The operator can orbit around the factory.

The inspection camera remains mounted at the inspection station.

Provide a UI panel showing:

```text
CAM01 LIVE
```

with the exact output of `InspectionCamera01`.

---

# 13. Camera Video Output

The inspection camera must render to its own canvas or render target.

Preferred initial implementation:

```typescript
const stream = inspectionCanvas.captureStream(20);
```

Create an abstraction:

```typescript
interface CameraStreamAdapter {
  getMediaStream(): MediaStream;
}
```

This prevents the rest of the application from depending on how Roboflow consumes the video.

Later implementations may expose:

```text
Browser MediaStream
OBS Virtual Camera
RTSP
WebRTC
```

---

# 14. Vision Provider Abstraction

Roboflow must not be hardcoded throughout the app.

Create:

```typescript
interface VisionProvider {
  connect(): Promise<void>;

  disconnect(): Promise<void>;

  isConnected(): boolean;

  inspect(input: VisionInput): Promise<VisionPrediction>;
}
```

Implement:

```text
RoboflowAdapter
MockVisionProvider
```

`MockVisionProvider` is required for development before Roboflow is configured.

---

# 15. Roboflow Integration

Initial integration may use any supported Roboflow inference approach that works reliably with the simulated camera.

Preferred priority:

1. Browser/WebRTC integration
2. direct frame API
3. local Roboflow inference
4. RTSP pipeline

Do not structurally couple the application to only one method.

Store configuration using environment variables.

Example:

```text
VITE_ROBOFLOW_API_KEY=
VITE_ROBOFLOW_WORKFLOW_ID=
VITE_ROBOFLOW_WORKSPACE=
```

Do not commit API keys.

---

# 16. Vision Prediction Model

Normalize all Roboflow responses into an internal interface.

```typescript
interface VisionDetection {
  className: string;
  confidence: number;

  x: number;
  y: number;
  width: number;
  height: number;
}

interface VisionPrediction {
  timestamp: number;

  detections: VisionDetection[];

  inspectionResult:
    | "PASS"
    | "FAIL"
    | "UNKNOWN";

  defectCode?: string;

  confidence: number;

  inferenceLatencyMs?: number;
}
```

---

# 17. Virtual PLC

The Virtual PLC is responsible for automation decisions.

The PLC must not directly access product ground truth.

This is a hard architectural constraint.

The PLC may receive:

```text
sensor states
line status
operator commands
vision prediction
equipment status
```

The PLC may not receive:

```text
groundTruth.defectType
groundTruth.expectedResult
```

except inside test harnesses.

---

# 18. PLC Tags

Implement tags similar to:

```typescript
interface PlcTags {
  // Machine
  lineRunCommand: boolean;
  lineStopCommand: boolean;
  lineRunning: boolean;
  lineSpeed: number;

  // Sensors
  pe100Entry: boolean;
  pe101Inspection: boolean;
  pe102Reject: boolean;
  pe103Exit: boolean;

  // Vision
  visionConnected: boolean;
  visionReady: boolean;
  visionBusy: boolean;

  visionResult: "PASS" | "FAIL" | "UNKNOWN";
  visionDefectCode: string;
  visionConfidence: number;

  // Reject system
  rejectCommand: boolean;
  rejectExtended: boolean;

  // Production
  totalCount: number;
  goodCount: number;
  rejectCount: number;

  // Machine state
  machineState:
    | "STOPPED"
    | "STARTING"
    | "RUNNING"
    | "STOPPING"
    | "FAULTED";
}
```

---

# 19. PLC State Machine

Implement:

```text
STOPPED
  ↓ start
STARTING
  ↓ ready
RUNNING
  ↓ stop
STOPPING
  ↓
STOPPED
```

Fault conditions move machine to:

```text
FAULTED
```

Possible faults:

```text
VISION_OFFLINE
CAMERA_OFFLINE
REJECT_STATION_FAULT
PRODUCT_TRACKING_ERROR
JAM_DETECTED
```

---

# 20. Inspection Sequence

When PE101 detects a product:

```text
1. Capture unit ID internally
2. Set Vision.Busy
3. Request inference
4. Wait for prediction
5. Associate prediction with unit ID
6. Store result
7. Add failed product to reject queue
8. Clear Vision.Busy
```

The result should be tied to the correct product even while other products continue moving.

---

# 21. Reject Queue

Do not reject based only on elapsed time.

Track unit identity.

Example:

```typescript
interface RejectQueueEntry {
  unitId: string;
  inspectionResult: "FAIL";
  defectCode: string;
  confidence: number;
}
```

When `PE102` detects a product:

```text
if detected unitId exists in reject queue
    fire reject actuator
else
    allow product to continue
```

Remove unit from queue after successful reject.

---

# 22. Reject Mechanism

Simulate a pneumatic or servo diverter.

States:

```text
RETRACTED
EXTENDING
EXTENDED
RETRACTING
```

Animation should be visible.

The rejected product should physically move toward the reject bin.

Do not teleport the unit.

---

# 23. HMI

The interface should resemble a modern industrial HMI combined with a technical dashboard.

Primary HMI areas:

```text
Header / status
3D digital twin
live vision feed
machine controls
fault injection
production KPIs
vision KPIs
alarm banner
```

---

# 24. HMI Overview Screen

Display:

```text
LINE 01 - VISION INSPECTION

Machine State
RUNNING

Line Speed
42 units/min

Total Produced
1,284

Accepted
1,261

Rejected
23

First Pass Yield
98.2%

Camera
ONLINE

Roboflow
CONNECTED

Model
Bottle-QC

Last Inspection
FAIL - MISSING CAP

Confidence
98.2%

Inference Latency
31 ms
```

---

# 25. Operator Controls

Required:

```text
START
STOP
RESET

Line speed slider

Inject product
Inject defect

Pause simulation
Simulation speed

Reset statistics
```

---

# 26. Fault Injection Controls

Provide a dedicated panel.

Product faults:

```text
Missing Cap
Missing Label
Crooked Label
Wrong Label
Underfill
Random Defect
```

Environmental faults:

```text
Dim Lighting
Bright Lighting
Warm Lighting
Camera Blur
Camera Offset
Camera Rotation
Temporary Occlusion
```

Equipment faults:

```text
Vision Offline
Camera Offline
Reject Station Fault
Conveyor Stop
```

---

# 27. Domain Shift Mode

Provide:

```text
DOMAIN SHIFT
```

When enabled, randomly alter one or more visual parameters:

```text
lighting
background
camera pose
material roughness
product color
conveyor color
camera exposure simulation
```

Purpose:

Demonstrate model robustness and failure under changing production conditions.

---

# 28. Ground Truth Evaluation

After every completed inspection, compare:

```text
simulator expected result
vs
vision prediction
```

Generate one of:

```text
TRUE_POSITIVE
TRUE_NEGATIVE
FALSE_POSITIVE
FALSE_NEGATIVE
```

Definitions:

```text
True Positive:
Defective product correctly rejected

True Negative:
Good product correctly accepted

False Positive:
Good product incorrectly rejected

False Negative:
Defective product incorrectly accepted
```

Manufacturing-friendly terminology should also be displayed:

```text
False Positive = False Reject
False Negative = Escape
```

---

# 29. Quality Metrics

Track:

```text
Total units
Good units
Actual defective units

Vision passes
Vision failures

True positives
True negatives

False rejects
Escaped defects

Precision
Recall
Accuracy

First-pass yield

Average inference latency
P95 inference latency
```

---

# 30. Traceability / MES

Create a lightweight in-browser production historian.

Each completed unit:

```typescript
interface InspectionRecord {
  unitId: string;
  sku: string;

  producedAt: string;
  inspectedAt: string;

  predictedResult:
    | "PASS"
    | "FAIL"
    | "UNKNOWN";

  predictedDefect?: string;

  confidence: number;

  groundTruthResult:
    | "PASS"
    | "FAIL";

  groundTruthDefect: DefectType;

  evaluation:
    | "TRUE_POSITIVE"
    | "TRUE_NEGATIVE"
    | "FALSE_POSITIVE"
    | "FALSE_NEGATIVE";

  rejected: boolean;

  inferenceLatencyMs?: number;
}
```

---

# 31. Traceability Screen

Display a table:

```text
SERIAL      SKU        RESULT   DEFECT        CONF   ACTUAL    OUTCOME

A001281     500ML      PASS     -             .993   PASS      Correct
A001282     500ML      PASS     -             .976   PASS      Correct
A001283     500ML      FAIL     Label         .921   FAIL      Correct
A001284     500ML      PASS     -             .674   FAIL      Escape
```

Allow row selection.

Detailed unit view should show:

```text
serial
timestamps
prediction
ground truth
defect
confidence
quality outcome
inspection image if available
```

---

# 32. Review / Retraining Queue

Create a review queue for:

```text
False positives
False negatives
Low confidence predictions
Unknown results
```

Thresholds should be configurable.

Example:

```typescript
const reviewPolicy = {
  lowConfidenceThreshold: 0.75,
  automaticallyQueueFalsePredictions: true
};
```

Display:

```text
ACTIVE LEARNING QUEUE

17 items requiring review

8 low confidence
5 false rejects
4 escapes
```

---

# 33. Synthetic Dataset Generator

The simulator should eventually support a special non-production mode:

```text
DATASET GENERATOR
```

This mode automatically generates images across randomized scenarios.

---

# 34. Domain Randomization

Randomizable variables:

```text
camera X/Y/Z
camera rotation
focal length

light intensity
light position
light temperature

product position
product rotation

product color
product material

conveyor material
factory background

defect type
defect placement

motion blur
noise
occlusion
```

Configuration:

```typescript
interface DomainRandomizationConfig {
  cameraPosition: boolean;
  cameraRotation: boolean;

  lighting: boolean;

  productPose: boolean;
  productMaterial: boolean;

  background: boolean;

  occlusion: boolean;
}
```

---

# 35. Annotation Generation

Because the simulator knows object geometry, dataset generation should eventually create annotations automatically.

MVP annotations:

```text
bottle
cap
label
```

Potential later annotations:

```text
defect
fill_region
foreign_object
```

Supported initial format:

```text
YOLO bounding boxes
```

Later:

```text
COCO
```

---

# 36. Dataset Generation Workflow

Example:

```text
Generate 5,000 Images

Defect mix:
70% good
10% missing cap
5% missing label
5% crooked label
5% wrong label
5% underfill

Randomize:
✓ Lighting
✓ Camera position
✓ Product rotation
✓ Background
✓ Material

Output:
images/
labels/
dataset.json
```

---

# 37. Simulated Camera Validation

Training and demo environments should not be identical.

Dataset generation should randomize sufficiently so the live production environment represents an unseen configuration.

Recommended:

```text
TRAINING
Camera poses A-D

DEMO
Camera pose E
```

This prevents a meaningless memorization demo.

---

# 38. Events

Use a simple event bus.

Example events:

```text
SIMULATION_STARTED
SIMULATION_STOPPED

PRODUCT_CREATED
PRODUCT_ENTERED_INSPECTION

VISION_REQUESTED
VISION_COMPLETED
VISION_FAILED

PRODUCT_REJECTED
PRODUCT_ACCEPTED

ALARM_RAISED
ALARM_CLEARED

INSPECTION_RECORDED
```

Suggested interface:

```typescript
type SystemEvent =
  | ProductCreatedEvent
  | VisionCompletedEvent
  | ProductRejectedEvent
  | AlarmRaisedEvent;
```

---

# 39. Persistence

MVP:

Use:

```text
IndexedDB
```

Persist:

```text
inspection records
metrics
configuration
review queue
```

Do not require an external database for the MVP.

Later architecture may support:

```text
PostgreSQL
Azure SQL
Cosmos DB
```

---

# 40. Optional MQTT Layer

After MVP, create an MQTT adapter.

Purpose:

Allow the simulated PLC to expose real industrial-style telemetry.

Topics:

```text
factory/line01/status

factory/line01/vision/result

factory/line01/production/count

factory/line01/alarm

factory/line01/reject
```

Example payload:

```json
{
  "unitId": "UNIT-001284",
  "result": "FAIL",
  "defect": "MISSING_CAP",
  "confidence": 0.982
}
```

MQTT must be optional.

---

# 41. Optional OPC UA Layer

Future enhancement only.

Do not block MVP on OPC UA.

Create architecture so a future bridge could expose PLC tags through an OPC UA server.

---

# 42. Alarms

Implement alarm state separately from normal events.

Example:

```typescript
interface Alarm {
  id: string;
  code: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  active: boolean;
  raisedAt: number;
  clearedAt?: number;
  message: string;
}
```

Initial alarms:

```text
Vision Connection Lost
Camera Offline
Reject Station Fault
Inspection Timeout
Tracking Mismatch
Conveyor Stopped Unexpectedly
```

---

# 43. Inspection Timeout

The PLC must not wait forever.

Example:

```text
VISION_TIMEOUT_MS = 1000
```

If no result arrives:

```text
Vision.Result = UNKNOWN
Raise alarm
Apply configurable fail-safe behavior
```

Fail-safe modes:

```text
REJECT_UNKNOWN
ALLOW_UNKNOWN
STOP_LINE
```

Default:

```text
REJECT_UNKNOWN
```

---

# 44. Latency Simulation

Provide optional artificial latency.

Example:

```text
Vision latency:
25 ms
50 ms
100 ms
250 ms
500 ms
Random
```

This allows demonstration of why timing matters in industrial systems.

---

# 45. Networking Failure Simulation

Eventually support:

```text
Roboflow disconnected
intermittent network
slow network
lost response
```

Purpose:

Demonstrate resilient controls design.

---

# 46. Technical UI Layout

Recommended desktop layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Line 01 | RUNNING | Camera ONLINE | Roboflow CONNECTED      │
├────────────────────────────────────┬─────────────────────────┤
│                                    │                         │
│                                    │ LIVE INSPECTION CAMERA  │
│          3D DIGITAL TWIN           │                         │
│                                    ├─────────────────────────┤
│                                    │ PRODUCTION METRICS      │
│                                    │                         │
├────────────────────────────────────┼─────────────────────────┤
│ MACHINE CONTROLS                   │ FAULT INJECTION         │
├────────────────────────────────────┴─────────────────────────┤
│ Alarm Banner / Event Log                                     │
└──────────────────────────────────────────────────────────────┘
```

---

# 47. Development Modes

Support:

```text
SIMULATION_ONLY
MOCK_VISION
ROBOFLOW
DATASET_GENERATION
```

Configuration:

```typescript
type RuntimeMode =
  | "SIMULATION_ONLY"
  | "MOCK_VISION"
  | "ROBOFLOW"
  | "DATASET_GENERATION";
```

---

# 48. Mock Vision Provider

The simulator must be fully testable before Roboflow is connected.

Mock provider may use ground truth internally for simulation purposes.

However:

The UI should clearly indicate:

```text
VISION MODE: MOCK
```

Do not confuse mock results with actual Roboflow inference.

Support configurable:

```text
accuracy
latency
false-positive probability
false-negative probability
```

---

# 49. Testability

Core control logic must not depend on React components.

Simulation and controls should be independently testable.

Required automated tests:

```text
Failed unit enters reject queue
Correct failed unit gets rejected
Good unit is not rejected
Two adjacent units remain correctly tracked
Vision timeout raises alarm
Line stop freezes conveyor
Reset clears machine faults
Production counters increment correctly
False negative is recorded as escape
False positive is recorded as false reject
```

---

# 50. Logging

Implement structured logging.

Example:

```typescript
logger.info("vision.completed", {
  unitId,
  result,
  defectCode,
  confidence,
  latencyMs
});
```

Avoid excessive browser-console noise.

Allow debug mode.

---

# 51. Development Sequence

## Phase 1: Visual simulation

Build:

* Three.js scene
* conveyor
* bottle
* motion
* operator camera
* inspection camera

Acceptance:

A bottle moves smoothly through a recognizable production cell.

---

## Phase 2: Product and defect model

Build:

* product identities
* good bottle
* missing cap
* missing label
* crooked label
* underfill

Acceptance:

Operator can manually inject each defect.

---

## Phase 3: Sensors and PLC

Build:

* photoeyes
* PLC tags
* machine state
* start/stop
* reject station
* reject queue

Acceptance:

Mock inspection results cause correct units to be rejected.

---

## Phase 4: HMI

Build:

* line status
* controls
* live camera
* PLC tags
* production counters
* fault injection

Acceptance:

Entire line can be operated without developer tools.

---

## Phase 5: Mock vision

Build:

* mock provider
* latency
* confidence
* prediction results

Acceptance:

End-to-end inspection loop operates without Roboflow.

---

## Phase 6: Roboflow integration

Build:

* camera bridge
* provider adapter
* prediction normalization

Acceptance:

Actual rendered camera images are evaluated by Roboflow.

---

## Phase 7: Quality metrics

Build:

* ground truth comparison
* confusion matrix
* false reject count
* escapes
* quality dashboard

Acceptance:

System objectively evaluates Roboflow performance.

---

## Phase 8: Historian

Build:

* inspection records
* traceability table
* detailed unit records

Acceptance:

User can inspect historical production results.

---

## Phase 9: Domain shift

Build:

* lighting randomization
* camera shifts
* product appearance changes

Acceptance:

Operator can deliberately challenge the model.

---

## Phase 10: Synthetic dataset generator

Build:

* automatic scenario generation
* rendered image export
* annotation export
* domain randomization

Acceptance:

System can create a labeled training dataset without manual annotation.

---

# 52. MVP Definition

The MVP is complete when all of the following work:

1. Conveyor visually operates.
2. Products have unique IDs.
3. At least three defect types exist.
4. Inspection camera displays independent view.
5. Operator can start/stop the line.
6. Operator can inject a defect.
7. Mock vision can inspect the product.
8. PLC associates inspection result with correct product.
9. Failed product reaches reject station.
10. Reject actuator removes the correct failed product.
11. Good product continues.
12. HMI updates production counters.
13. Ground truth is compared to prediction.
14. False rejects and escapes are tracked.
15. Traceability record is generated.

Roboflow integration is the next milestone immediately following this MVP.

---

# 53. Interview Demo Definition

The final interview version should support this exact scenario:

### Step 1

Start line.

```text
Machine: RUNNING
Vision: CONNECTED
Camera: ONLINE
```

### Step 2

Run good products.

Dashboard shows normal production.

### Step 3

Inject:

```text
MISSING CAP
```

### Step 4

Product travels through inspection camera.

Live camera displays Roboflow overlays.

### Step 5

Roboflow returns:

```text
FAIL
MISSING_CAP
98.2%
```

### Step 6

PLC records failure.

Product continues moving.

### Step 7

Correct unit reaches reject station.

Reject actuator fires.

### Step 8

Dashboard updates.

```text
Rejects: +1
Missing Cap: +1
```

### Step 9

Traceability record appears.

### Step 10

Enable:

```text
DOMAIN SHIFT
```

Change lighting/camera conditions.

Show effect on model confidence.

### Step 11

Display false rejects/escapes or low-confidence examples.

### Step 12

Show that these examples enter retraining queue.

This demonstrates:

```text
simulation
synthetic data
computer vision
controls
edge inference
quality engineering
traceability
model lifecycle
industrial integration
```

---

# 54. Non-Goals for MVP

Do not initially build:

* realistic fluid simulation
* full robotic kinematics
* multi-line factory
* full MES
* full SCADA
* actual PLC ladder logic
* physics-heavy bottle collisions
* photorealistic factory environment
* Kubernetes
* Azure cloud infrastructure
* user authentication
* mobile support
* production-grade OPC UA server

These can distract from the core demonstration.

---

# 55. Coding Standards

Use:

```text
TypeScript strict mode
small focused modules
dependency injection where useful
interfaces around external systems
React only for UI
simulation logic outside React
event-driven communication
unit tests for controls
```

Avoid:

```text
global mutable state
one giant App.tsx
simulation logic inside React components
direct Roboflow API calls from random components
hardcoded magic numbers
ground-truth leakage into PLC or vision code
```

---

# 56. Critical Architectural Rule

This rule must never be violated:

```text
GROUND TRUTH
    │
    ├─────> Evaluation / Dataset Generation
    │
    └─────X────> Vision / PLC
```

The only connection between the simulated world and Roboflow is:

```text
RENDERED PIXELS
```

The only connection from Roboflow into the controls system is:

```text
VISION PREDICTION
```

This is what makes the project technically meaningful.

---

# 57. Recommended Initial Implementation Prompt for GitHub Copilot

Use this specification as the authoritative architecture.

Begin by implementing only **Phase 1**.

Create a Vite + React + TypeScript application using Three.js.

Implement:

1. `SimulationClock`
2. `SceneManager`
3. `ConveyorSystem`
4. `ProductManager`
5. `ProductFactory`
6. `InspectionCamera`
7. a basic operator camera
8. a simple HMI shell

The initial scene should contain:

* factory floor
* conveyor approximately 5 meters long
* inspection station
* inspection camera
* reject station placeholder
* bottles moving down the conveyor

Keep simulation logic outside React components.

Do not implement Roboflow yet.

Do not implement synthetic dataset generation yet.

Do not implement cloud services yet.

Before writing code:

1. generate the proposed file tree
2. identify module responsibilities
3. identify dependencies between modules
4. identify any architectural conflicts with this specification

Then implement Phase 1 incrementally.

After Phase 1 builds successfully, continue to Phase 2.

---

# 58. Final Product Vision

The finished project should make this statement visually obvious:

> Computer vision is not the manufacturing system. It is an intelligent sensor inside the manufacturing system.

The simulator should demonstrate the complete path:

```text
Physical Process
      ↓
Camera
      ↓
Roboflow
      ↓
Industrial Control
      ↓
Physical Action
      ↓
Quality Record
      ↓
Model Improvement
```

That is the central architectural and demonstration principle of Virtual Vision Cell.
