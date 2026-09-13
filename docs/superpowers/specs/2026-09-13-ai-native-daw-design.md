# AI-Native DAW Architecture Design

Date: 2026-09-13
Repository: `danielevex/K.G.Studio`
Status: approved design baseline, pending user review of this written specification

## 1. Product direction

K.G.Studio evolves into a **local-first, AI-native DAW** rather than a standalone Suno-style generator.

The V1 priorities are:

- AI-first workflow.
- Fully local/offline by default.
- Existing DAW project model remains central.
- AI editing is non-destructive and versioned.
- Full-song generation uses a hybrid strategy: preserve an immutable generated master, then import native stems where available or separate stems through a local separator.
- Models are installed on demand through an internal Model Manager.
- AI Director is the primary natural-language entry point, but all important plans remain inspectable and editable before execution.
- Final mastering is a native, deterministic DSP subsystem rather than another generative sidecar.
- Hum-to-Song / Melody Capture is part of V1.

Cloud engines may be supported later through adapters, but no V1 workflow depends on cloud access.

## 2. Existing codebase integration

The design extends the current K.G.Studio model rather than replacing it.

Existing concepts retained:

- `KGProject` remains the canonical musical project object.
- `KGAudioTrack` and `KGAudioRegion` remain timeline primitives.
- Existing project/audio I/O, agent folders, command model, project upgrader, and audio-interface are evolved rather than bypassed.
- Existing React/TypeScript/Vite UI remains the presentation layer.

The desktop runtime is introduced through Tauri 2 and Rust.

## 3. High-level architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                         React UI                            │
│ Timeline / Mixer / Director / Models / Mastering / Export  │
└────────────────────────────┬────────────────────────────────┘
                             │ Tauri IPC
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                     Tauri / Rust Core                       │
│                                                             │
│ Project Runtime        Asset / Take Manager                 │
│ Job Manager            Resource Manager                     │
│ Model Manager          Process Supervisor                   │
│ Engine Registry        Engine Router                        │
│ AI Plan Validator      Runtime Storage                      │
│ Native Mastering Runtime                                    │
└───────┬─────────┬──────────┬──────────────┬─────────────────┘
        │         │          │              │
        ▼         ▼          ▼              ▼
    llama.cpp   ACE-Step   Stable Audio   Demucs / FFmpeg
      GGUF        1.5          3
```

Rust owns orchestration, process lifecycle, job state, files, project-safe mutations, resource arbitration, mastering, and persistence.

Generative models remain isolated in their natural runtimes.

## 4. Core architectural rule

No UI component talks directly to a model, FFmpeg, Demucs, or a mastering binary.

Required dependency direction:

```text
UI
 ↓
Application Services
 ↓
Domain
 ↓
Ports / Interfaces
 ↑
Adapters
```

Forbidden examples:

```text
TimelineComponent.tsx -> ACE-Step HTTP API
MasteringPanel.tsx -> FFmpeg process
React -> arbitrary shell command
```

## 5. Project data model

`KGProject` remains the source of truth for the musical project.

It is extended conceptually with references to:

```text
KGProject
├── tracks[]
├── globalTracks[]
├── assets[]
├── generations[]
├── preMasters[]
├── masters[]
├── references[]
├── melodyAssets[]
└── aiMetadata
```

SQLite is not the canonical project store. It is used for app/runtime state such as installed engines, models, downloads, jobs, caches, global history, checksums, and recent projects.

## 6. Audio assets, regions, and takes

The design separates three concepts:

- **AudioAsset**: a physical audio file and its metadata.
- **AudioTake**: one usable version of audio, possibly derived from another take.
- **KGAudioRegion**: placement and timing on the DAW timeline.

Example:

```text
KGAudioRegion: chorus_vocals
├── Take 1 -> vocal_original.wav
├── Take 2 -> repaint_001.wav
└── Take 3 -> repaint_002.wav

activeTakeId = Take 2
```

Suggested `AudioAsset` fields:

```text
id
relativePath
contentHash
duration
sampleRate
channels
sampleFormat
origin
createdAt
```

Origins include:

```text
recorded
imported
ai_generated
ai_derived
stem_separated
rendered_mix
premaster
master
reference
melody_capture
```

Suggested `AudioTake` fields:

```text
id
assetId
parentTakeId
operation
generationId
parameters
createdAt
```

AI edits never overwrite the active source file. A new take is created and selected.

## 7. Generation provenance

Every generation is recorded.

Suggested `GenerationRecord`:

```text
id
engineId
engineVersion
modelId
modelVersion
operation
prompt
seed
inputAssets[]
outputAssets[]
bpm
key
timeSignature
selectedRange
startedAt
completedAt
status
```

This allows inspection, regeneration, comparison, and future migration.

## 8. Music engine abstraction

All generative music systems implement one common logical contract.

```text
MusicEngine
├── descriptor()
├── capabilities()
├── healthCheck()
├── generateSong()
├── generateLayer()
├── repaint()
├── continueAudio()
├── transformAudio()
└── cancel()
```

Capabilities are explicit and queried by the UI/router rather than inferred by hard-coded engine names.

Initial capability vocabulary:

```text
GenerateSong
LyricsConditioning
ReferenceAudio
MelodyConditioning
GenerateLayer
Repaint
Continue
AudioToAudio
NativeStems
Vocals
Instrumental
LoRA
```

Initial V1 engine priority:

1. ACE-Step 1.5 as primary song/layer engine.
2. Stable Audio 3 as an additional editing/audio-to-audio engine when installed.
3. Demucs as stem-separation service.
4. llama.cpp/GGUF as the local AI Director runtime.

Future engines are adapters, not architectural changes.

## 9. Engine adapters

Each engine is isolated behind an adapter.

```text
MusicEngine
├── AceStepAdapter
├── StableAudioAdapter
├── DiffRhythmAdapter
├── YuEAdapter
└── future adapters
```

The adapter converts internal typed requests into engine-specific parameters, validates engine-specific constraints, submits work, maps progress, maps output, and normalizes errors.

Engine-specific quirks must not leak into the React UI or project model.

## 10. Local process supervision

External runtimes are started, stopped, monitored, and killed by Rust only.

```text
React
  ↓
Tauri command
  ↓
ProcessSupervisor
  ├── llama.cpp
  ├── ACE-Step sidecar
  ├── Stable Audio sidecar
  ├── Demucs sidecar
  └── FFmpeg
```

No arbitrary-shell permission is exposed to the frontend.

Sidecar capabilities and allowed binaries/arguments are narrowly scoped.

## 11. Sidecar protocol

Python-based engines expose a small local API after being started by Rust.

Minimal contract:

```text
GET  /health
GET  /capabilities
POST /jobs
GET  /jobs/{id}
POST /jobs/{id}/cancel
```

Progress is streamed through a structured channel rather than terminal scraping.

The process remains owned by Rust even when the protocol is HTTP or another local IPC transport.

## 12. Job system

Long-running work is represented by typed jobs.

States:

```text
queued
preparing
running
finalizing
completed
failed
cancelled
```

Each job exposes:

```text
id
type
state
progress
stage
message
engine
estimatedVRAM
estimatedRAM
createdAt
startedAt
finishedAt
```

The scheduler supports dependencies through a simple DAG.

Example full-song workflow:

```text
Generate Song
    ↓
Register immutable master
    ↓
Resolve stem strategy
    ├── native stems -> import
    └── no native stems -> Demucs
    ↓
Analyze outputs
    ↓
Create DAW tracks
    ↓
Generate waveform caches
```

The UI remains usable while jobs execute.

## 13. Resource manager and 16 GB VRAM target

The primary target system includes a 16 GB NVIDIA GPU, so model concurrency must be actively managed.

Each runtime/model declares:

```text
estimatedVRAM
estimatedRAM
exclusiveGPU
supportsCPUOffload
supportsUnload
```

The scheduler may unload one model before loading another.

Example:

```text
unload llama.cpp GPU layers
→ load ACE-Step
→ generate
→ unload ACE-Step
→ restore Director
```

The architecture must remain valid with lower or higher VRAM systems, but V1 presets are optimized for a 16 GB GPU.

## 14. Model Manager

Models and runtimes are installed on demand.

The app does not ship every model by default.

Each manifest records:

```text
engineId
modelId
version
runtimeVersion
downloadSources
checksum
diskSize
VRAMRecommendation
RAMRecommendation
license
attribution
commercialUseNotes
```

Model Manager responsibilities:

- install
- verify checksum
- verify disk capacity
- verify hardware compatibility
- update
- remove
- repair
- display license and attribution information
- resolve missing dependencies when a project is opened

A project stores required model/engine IDs and versions, not model weights.

## 15. AI Director

The AI Director is local and is not allowed to mutate project files directly.

Pipeline:

```text
User request
    ↓
AI Director
    ↓
Typed ActionPlan
    ↓
Plan Validator
    ↓
User review when required
    ↓
Authorized DAW commands / engine jobs
```

The Director interprets natural language and project context. It does not receive unrestricted filesystem or process execution capability.

Examples of allowed plan actions:

```text
CreateTrack
AddLayer
RepaintRegion
GenerateVocals
CreateVariation
ExtendRegion
ChangeBpm
SetProjectKey
CreatePreMaster
CreateMaster
AnalyzeReference
```

Every action has a schema, permissions, validation rules, and project-safe execution path.

## 16. Music Blueprint

New-song creation is blueprint-first.

The user describes a song in natural language. The Director proposes an editable blueprint containing:

```text
title
style
mood
bpm
key
timeSignature
duration
vocalProfile
songStructure
lyrics
arrangement
selectedEngine
selectedModel
referenceAssets
melodyCondition
```

The blueprint is always editable before generation.

V1 principle: **AI proposes; user retains control.**

## 17. Hybrid generated-song workflow

Full-song generation is intentionally hybrid.

```text
Blueprint
  ↓
Generate complete song
  ↓
Immutable AI Master Source
  ↓
Stem strategy
  ├── import native stems if supplied
  └── otherwise separate with Demucs
  ↓
Create editable DAW tracks
```

The original generated master is retained permanently unless the user explicitly removes it.

## 18. Non-destructive AI editing

AI-generated edits create new takes.

Supported V1-oriented operations, depending on engine capability:

```text
Regenerate
CreateVariation
RepaintSelection
Extend
AddInstrument
ReplaceInstrument
GenerateHarmony
GenerateBackingVocals
ChangeEnergy
```

A take stores parentage and generation provenance.

The user may instantly A/B takes and restore any prior version.

## 19. Melody Capture / Hum-to-Song

Hum-to-Song is a V1 subsystem, not a later optional feature.

Goal:

> Record humming/singing through the microphone, extract a controllable melody representation, edit it, then turn it into an arranged multi-instrument musical piece.

Pipeline:

```text
Microphone
   ↓
Melody Recorder
   ↓
hum_take.wav
   ↓
Melody Analyzer
   ├── pitch tracking
   ├── note segmentation
   ├── rhythm estimation
   ├── tempo estimation
   └── key estimation
   ↓
MelodyAsset / MIDI
   ↓
Piano-roll editor
   ↓
Optional quantization / pitch correction
   ↓
Harmonic Planner
   ↓
Arrangement Plan
   ↓
Music Engine Router
   ↓
Generated layers / full song
```

The first implementation should use a reliable audio-to-MIDI/pitch transcription component rather than asking ACE-Step alone to infer the melody.

Research references include Spotify Basic Pitch and the MIDI-SAG architecture, but third-party dependencies must pass separate license review before inclusion.

### MelodyAsset

Suggested fields:

```text
id
sourceAudioAssetId
midiData
detectedKey
detectedTempo
confidence
pitchCurve
quantization
createdAt
```

### Melody Fidelity

The UI exposes a control such as:

```text
Strict ───── Balanced ───── Creative
```

Meaning:

- **Strict**: preserve detected melody closely.
- **Balanced**: timing and pitch cleanup with conservative development.
- **Creative**: allow the arrangement engine to elaborate on the motif.

The same melody may be assigned to a lead synth, piano, guitar, strings, or vocal role.

## 20. Mixer scope for V1

V1 mixer scope is deliberately limited to what is needed for real work:

- gain
- pan
- mute
- solo
- stereo width/basic stereo control
- EQ
- basic compression
- essential sends/buses
- master bus

VST3 hosting, advanced automation, complex routing, and full commercial-DAW parity are deferred.

## 21. Native Mastering Runtime

Mastering is a Rust-native subsystem, separate from generative music engines.

Logical contract:

```text
MasteringEngine
├── analyze()
├── analyzeReference()
├── createPlan()
├── preview()
├── render()
└── qualityControl()
```

Internal architecture:

```text
Analysis Engine
Reference Analyzer
Master Assistant
DSP Graph
Offline Renderer
Quality Control
```

The mastering assistant may use the AI Director to interpret qualitative intent, but numerical analysis and DSP decisions are based on actual signal measurements.

The LLM never directly manipulates sample buffers.

## 22. Mastering DSP chain

The mastering graph is modular. Modules are enabled only when useful.

Candidate chain:

```text
Input / cleanup
  ↓
Corrective EQ
  ↓
Dynamic EQ / de-harsh
  ↓
Optional harmonic stage
  ↓
Glue compression
  ↓
Optional multiband dynamics
  ↓
Transient control
  ↓
Mid/Side processing
  ↓
Stereo safeguards / low-frequency mono compatibility
  ↓
Soft clipper
  ↓
True-peak limiter
  ↓
Final measurement
```

Research/reference repositories include:

- `noisyloop/mastering` for chain organization, non-destructive A/B, DSP ideas, true-peak limiting, reference matching, and preview/render parity.
- oXygen for conservative mastering-assistant concepts and reference matching.
- Bellweather Audio Core for conformance-testing philosophy.
- OxiAudio for Rust DSP building blocks.
- Matchering and Keel as architectural research only unless licensing permits the exact intended use.

License compatibility must be reviewed per dependency before code reuse.

## 23. Mastering standards and QA

Metering and final validation target the current ITU-R BS.1770 revision applicable at implementation time.

True-peak detection must use appropriate oversampling and be tested against reference vectors.

The mastering test suite includes:

```text
mastering-tests/
├── loudness/
├── true-peak/
├── eq/
├── compression/
├── limiter/
├── oversampling/
├── dither/
└── golden-audio/
```

The final exported file is measured again after rendering.

Mastering QC reports at least:

```text
Integrated loudness
Short-term loudness
Momentary loudness
True peak
Loudness range
PLR / crest information
DC offset
hard clipping
phase / stereo correlation
low-frequency stereo compatibility
```

A delivery target such as -14 LUFS is treated as a delivery profile, not as a universal mastering objective.

## 24. PreMaster and Master objects

The DAW creates an immutable or versioned pre-master render before final mastering.

```text
Project
├── Mix
├── PreMasters[]
└── Masters[]
```

A Master record stores:

```text
sourcePreMasterId
masteringPlan
DSPGraphVersion
parameters
referenceAssetIds
analysisBefore
analysisAfter
QCResult
sampleRate
sampleFormat
dither
timestamp
```

Master creation is non-destructive and versioned just like AI takes.

## 25. Reference tracks

Reference audio is a first-class library object.

References may be classified as:

```text
composition_reference
mix_reference
master_reference
```

Reference matching uses loudness-matched analysis before tonal/dynamic comparison to reduce misleading level bias.

## 26. React ↔ Rust communication

Use three communication patterns deliberately:

### Commands
For request/response operations:

```text
create_project
save_project
submit_generation
cancel_job
install_model
render_master
```

### Channels
For ordered long-running streams:

```text
job progress
model download progress
structured engine logs
waveform generation
master render progress
```

### Events
For lightweight notifications:

```text
project-changed
job-completed
engine-started
engine-stopped
model-installed
```

Large audio is never serialized into JSON for UI transfer.

The UI receives asset IDs, waveform/analysis cache data, and metadata. Audio files remain in the project/runtime filesystem.

## 27. Project-on-disk format

Proposed project folder:

```text
Neon Abyss.kgstudio/
├── project.json
├── audio/
│   ├── imported/
│   ├── recorded/
│   ├── generated/
│   ├── stems/
│   ├── takes/
│   └── renders/
├── melody/
│   ├── recordings/
│   └── midi/
├── mastering/
│   ├── premaster/
│   ├── masters/
│   └── references/
├── cache/
│   ├── waveforms/
│   └── analysis/
└── metadata/
    └── generations.json
```

Cache data is rebuildable. Source and project data are portable.

## 28. Runtime folder layout

React side:

```text
src/
├── components/
├── features/
│   ├── director/
│   ├── timeline/
│   ├── mixer/
│   ├── melody/
│   ├── mastering/
│   ├── models/
│   └── jobs/
├── core/
│   └── existing KG domain
└── bridge/
    └── tauri client
```

Rust side:

```text
src-tauri/src/
├── app/
├── commands/
├── project/
├── assets/
├── jobs/
├── engines/
│   ├── registry/
│   ├── router/
│   └── adapters/
├── models/
├── process/
├── resources/
├── melody/
│   ├── capture/
│   ├── transcription/
│   ├── pitch/
│   ├── rhythm/
│   ├── quantization/
│   ├── harmonization/
│   └── analysis/
├── mastering/
│   ├── analysis/
│   ├── dsp/
│   ├── reference/
│   ├── renderer/
│   └── qc/
├── storage/
└── ipc/
```

Model runtimes are installed outside the source tree and managed as application runtime resources.

## 29. UX baseline

Main workspace:

```text
Browser | Timeline | Inspector
        |          |
        AI Director (collapsible)

Arrangement | Lyrics | Mixer | Mastering | Export
```

Important UX rules:

- Timeline/music stays visually central.
- AI Director is always available but does not dominate the app.
- Natural-language requests produce visible typed plans.
- Engine capability controls whether a command is shown/enabled.
- Generated/derived material exposes provenance.
- Long-running AI work appears in a Job Center and does not block editing.

## 30. V1 scope

Included:

1. Existing DAW timeline/MIDI/audio foundation evolved into Tauri desktop.
2. Local AI Director.
3. Music Blueprint.
4. ACE-Step primary integration.
5. Generated master preservation and stem import/separation.
6. Non-destructive AI takes.
7. Repaint / Add Layer / Extend where supported.
8. Melody Capture / Hum-to-Song with editable MIDI representation.
9. Essential mixer.
10. Model Manager.
11. Job Center and resource scheduling.
12. Native Mastering Room.
13. Reference-aware mastering.
14. Master versioning.
15. Final WAV export and QC.
16. Fully local/offline core workflow.

Explicitly deferred:

- VST3 hosting.
- Full commercial-DAW routing/automation parity.
- Collaboration cloud.
- Marketplace.
- Large catalog of music engines.
- Heavy ML mastering as a requirement.
- Live-performance subsystem.
- Advanced MIDI composition beyond what V1 needs for melody editing and project compatibility.

## 31. Error handling and recovery

External engines are treated as untrusted failure domains.

Rules:

- Engine crashes never directly mutate `KGProject`.
- Outputs are produced in temporary locations and registered atomically only after validation.
- Failed or cancelled jobs clean or quarantine incomplete outputs.
- Project mutations use safe checkpoints/journaling.
- Autosave and recovery are introduced early.
- Every adapter maps engine failures into typed internal errors.
- Jobs expose retryability explicitly.

## 32. Testing strategy

Required layers:

- unit tests for domain models and action validation
- adapter contract tests with mocked engine endpoints
- job scheduler/DAG tests
- project migration tests
- resource scheduling tests
- audio asset/take provenance tests
- Melody Capture transcription fixture tests
- mastering numerical conformance tests
- golden-audio mastering regression tests
- React interaction tests for Blueprint, Takes, Model Manager, Job Center, and Mastering Room
- end-to-end smoke tests across Tauri boundaries for selected workflows

## 33. Architecture invariants

These rules should be treated as non-negotiable unless a future design revision explicitly changes them:

1. `KGProject` is the canonical musical project state.
2. SQLite is runtime metadata, not the only copy of project state.
3. AI edits are non-destructive.
4. Original generated masters are preserved.
5. UI never talks directly to engines or arbitrary processes.
6. Engine quirks remain inside adapters.
7. The AI Director produces typed plans rather than unrestricted commands.
8. Model installation is modular and on demand.
9. Resource scheduling accounts for finite VRAM/RAM.
10. Mastering is deterministic native DSP, not uncontrolled LLM processing.
11. Final QC measures the exported file.
12. Hum-to-Song uses an explicit melody representation that the user can inspect/edit.
13. Large audio buffers are not transported through JSON IPC.
14. Project files remain portable and understandable without bundling model weights.
15. V1 prioritizes a unique, reliable AI music workflow over exhaustive DAW feature parity.

## 34. Open implementation questions for the planning phase

These are implementation decisions, not unresolved product requirements:

- Exact Rust crates selected for audio DSP, SQLite, async runtime, process supervision, and filesystem watching.
- Exact sidecar transport (HTTP, Unix/domain socket equivalent on Windows, or stdio protocol) after benchmarking complexity and reliability.
- Exact audio-to-MIDI/pitch transcription dependency for Melody Capture after license, quality, and packaging validation.
- Exact initial GGUF model for the AI Director based on quality, tool-use reliability, RAM/VRAM footprint, and Italian/English instruction following.
- Exact ACE-Step model preset chosen as the default 16 GB configuration after local benchmarking.
- Exact mastering DSP components reused versus reimplemented after license and conformance review.

These choices must be resolved in the implementation plan or dedicated technical spikes without changing the architectural boundaries above.
