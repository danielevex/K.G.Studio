# AI-Native DAW Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this roadmap through the linked sub-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved local-first AI-native DAW in testable vertical milestones without coupling the UI directly to model runtimes or sacrificing the existing K.G.Studio project model.

**Architecture:** React/TypeScript remains the UI and existing KG domain remains the musical source of truth. Tauri 2/Rust becomes the desktop application runtime, supervising local model sidecars, jobs, resources, project-safe mutations, native mastering, and persistence. AI generation, melody capture, stem separation, non-destructive takes, and mastering are introduced as isolated subsystems behind typed interfaces.

**Tech Stack:** React 19, TypeScript 5.8, Vite 7, Zustand, existing K.G.Studio core, Tauri 2, Rust stable, Tokio, Serde, SQLite/rusqlite, llama.cpp, ACE-Step 1.5, Demucs, FFmpeg, optional Stable Audio 3, Basic Pitch-compatible melody transcription, native Rust DSP for mastering.

**Spec:** `docs/superpowers/specs/2026-09-13-ai-native-daw-design.md`

## Global Constraints

- V1 is local-first/offline by default; no core workflow requires cloud access.
- `KGProject` remains the canonical musical project model.
- AI editing is non-destructive and versioned.
- Full-song generation preserves an immutable generated master before stems/layers are created.
- Models are installed on demand through an internal Model Manager.
- AI Director proposes inspectable typed plans; it never executes arbitrary shell commands or mutates files directly.
- React never talks directly to ACE-Step, Demucs, FFmpeg, llama.cpp, or mastering binaries.
- Large audio files remain on disk; IPC transfers IDs, metadata, progress, and analysis results rather than WAV payloads.
- GPU/RAM resources are scheduled centrally so a 16 GB VRAM system can unload/reload model runtimes safely.
- Mastering is native, deterministic, versioned, reference-aware, and QC-verified after rendering.
- Hum-to-Song / Melody Capture is in V1.
- Every milestone must leave the application buildable and tests green.
- Use TDD for new domain/runtime behavior and commit after every independently reviewable task.

---

## Delivery order

### Milestone 1 — Desktop foundation and project bridge

**Plan:** `2026-09-13-01-tauri-foundation-project-bridge.md`

Outcome: K.G.Studio runs as a Tauri desktop app while preserving the existing web build; typed React↔Rust IPC exists; native project workspace paths and crash-safe persistence foundations are in place.

Exit criteria:

- `npm run build`, `npm run test:run`, `cargo test`, and `npm run tauri:build` pass.
- Existing projects still deserialize through the current KG project upgrader.
- No AI runtime has been added yet.

### Milestone 2 — Assets, takes, jobs, resources, and model registry

**Plan:** `2026-09-13-02-runtime-assets-jobs-models.md`

Outcome: project audio assets and takes are represented explicitly; background jobs are durable and cancellable; process/resource/model managers exist with no model-specific business logic in the UI.

Exit criteria:

- Asset/take lineage survives save/reload.
- Job state machine, dependency graph, cancellation, and resource arbitration are covered by Rust tests.
- Model manifests can be installed/uninstalled from a fake local fixture with checksum validation.

### Milestone 3 — Engine Router, ACE-Step vertical slice, AI Director protocol

**Plan:** `2026-09-13-03-ai-director-engine-runtime.md`

Outcome: a local GGUF Director produces a typed Music Blueprint/ActionPlan, the validator approves only supported operations, and ACE-Step can generate one complete song through the shared `MusicEngine` contract.

Exit criteria:

- Prompt → reviewed Blueprint → queued generation → immutable master asset works end-to-end.
- Engine capability routing is tested independently of ACE-Step.
- An invalid Director action cannot reach process execution.

### Milestone 4 — Hum-to-Song / Melody Capture

**Plan:** `2026-09-13-04-melody-capture-hum-to-song.md`

Outcome: microphone recording creates a `MelodyAsset`; pitch/rhythm transcription becomes editable MIDI; key/tempo analysis and conservative quantization are available; the melody can be used to request accompaniment/song generation.

Exit criteria:

- Mic → WAV → MIDI → piano-roll edit → Build Song workflow works locally.
- Melody Fidelity (`strict`, `balanced`, `creative`) is represented in typed generation requests.
- Original humming audio is always preserved.

### Milestone 5 — Stems, AI edits, takes, timeline integration, essential mixer

**Plan:** `2026-09-13-05-stems-takes-ai-editing.md`

Outcome: generated masters can become native stems or Demucs stems; timeline regions expose non-destructive takes; repaint/add-layer/extend workflows create derived takes/tracks; essential mix controls render a pre-master.

Exit criteria:

- Master → stems → tracks is repeatable and crash-safe.
- Switching active takes is instant and does not overwrite source assets.
- Pre-master render can be reproduced from project state.

### Milestone 6 — Native mastering, reference matching, export, final QC

**Plan:** `2026-09-13-06-native-mastering-export-qc.md`

Outcome: Mastering Room analyzes a pre-master, creates editable mastering plans, renders versioned master takes through native DSP, compares level-matched references, and validates the actual exported file.

Exit criteria:

- Metering/true-peak test vectors pass.
- Preview and offline render share the same parameterized chain semantics.
- Exported file is re-opened and QC measured before PASS is reported.

### Milestone 7 — V1 hardening and release candidate

**Plan:** `2026-09-13-07-v1-hardening-release.md`

Outcome: recovery, migrations, diagnostics, GPU presets, onboarding, packaging, and full E2E workflows are hardened for a first usable local release.

Exit criteria:

- Fresh Windows install completes onboarding without developer tools.
- 16 GB NVIDIA profile completes generation, stem separation, and mastering sequentially without concurrent model OOM.
- Golden E2E projects cover text-to-song, hum-to-song, AI edit, and mastered export.

---

## Dependency graph

```text
01 Tauri/Foundation
      ↓
02 Runtime/Assets/Jobs/Models
      ↓
03 Director + Engine Runtime
      ├──────────────┐
      ↓              ↓
04 Melody Capture   05 Stems/Takes/Editing
      └───────┬──────┘
              ↓
06 Mastering/Export/QC
              ↓
07 Hardening/Release
```

Milestones 4 and 5 may be developed in parallel after milestone 3 because both consume the asset/take/job/engine contracts established earlier.

## Review checkpoints

- [ ] After Milestone 1: confirm Tauri migration did not regress existing K.G.Studio workflows.
- [ ] After Milestone 2: freeze domain IDs, serialization shape, job states, and model manifest schema before engine work.
- [ ] After Milestone 3: test the full generation vertical slice on the target RTX 4070 Ti SUPER 16 GB machine before adding more engines.
- [ ] After Milestone 4: verify transcription quality with clean humming, noisy mic input, off-key singing, and free-tempo phrases.
- [ ] After Milestone 5: verify asset lineage and crash recovery during generation/separation.
- [ ] After Milestone 6: run objective mastering conformance tests and blind level-matched A/B listening checks.
- [ ] After Milestone 7: produce a signed release candidate and installation/rollback checklist.

## Explicitly deferred beyond V1

- General VST3 hosting.
- Advanced SFZ workstation features beyond what existing K.G.Studio already supports.
- Cloud collaboration or cloud-required generation.
- Marketplace/model store.
- Unlimited simultaneous model runtimes.
- Full professional automation lanes and advanced surround/Atmos workflows.
- Automatic mastering decisions that bypass user review.
