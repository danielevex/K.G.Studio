# V1 Hardening and Release Candidate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the integrated AI-native DAW feature set into a reliable Windows release candidate with recovery, diagnostics, hardware presets, onboarding, packaging, and full end-to-end regression coverage.

**Architecture:** This milestone does not add major new product features. It hardens all previously implemented subsystems, verifies migrations/recovery/resource behavior, and packages a reproducible local installation suitable for the target 16 GB NVIDIA machine.

**Tech Stack:** Existing React/Tauri/Rust application, Playwright, Vitest, Rust tests, installer/signing pipeline already supported by Tauri, fixture sidecars/models for CI.

**Spec:** `docs/superpowers/specs/2026-09-13-ai-native-daw-design.md`

## Global Constraints

- No cloud dependency is introduced to pass release gates.
- Fresh install must not require Python/Node/Rust developer tooling from the end user; required runtimes are installed/managed by the app or explicitly packaged according to license.
- Model weights remain modular/on-demand and are not silently bundled unless redistribution terms permit it.
- Recovery must never overwrite the last known-good project silently.
- Release gate includes the target RTX 4070 Ti SUPER 16 GB / 32 GB RAM profile.

---

### Task 1: Add project journal, autosave, and interrupted-job recovery

**Files:**
- Create: `src-tauri/src/recovery/mod.rs`
- Create: `src-tauri/src/recovery/journal.rs`
- Create: `src-tauri/src/recovery/autosave.rs`
- Create: `src/features/recovery/RecoveryDialog.tsx`
- Create: `src/features/recovery/RecoveryDialog.test.tsx`

**Interfaces:**

```rust
pub struct RecoveryCandidate {
    pub project_root: PathBuf,
    pub autosave_path: PathBuf,
    pub autosave_timestamp: DateTime<Utc>,
    pub last_clean_save_timestamp: Option<DateTime<Utc>>,
}
```

- [ ] **Step 1: Write crash-recovery tests**

Cover: clean shutdown produces no recovery prompt; newer autosave produces candidate; partially written temp file is ignored; running jobs become interrupted failures.

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement append-safe journal/autosave rotation with bounded history**

Keep at least the last three autosaves per open project; never delete `project.json` when rotating.

- [ ] **Step 4: Implement recovery dialog with explicit `Open autosave`, `Open last saved`, and `Cancel`**

- [ ] **Step 5: Commit**

---

### Task 2: Add diagnostics and support bundle generation

**Files:**
- Create: `src-tauri/src/diagnostics/mod.rs`
- Create: `src-tauri/src/diagnostics/system.rs`
- Create: `src-tauri/src/diagnostics/bundle.rs`
- Create: `src/features/settings/DiagnosticsPanel.tsx`
- Create: `src/features/settings/DiagnosticsPanel.test.tsx`

**Interfaces:**

```rust
pub struct DiagnosticsSnapshot {
    pub app_version: String,
    pub os: String,
    pub cpu: String,
    pub ram_mb: u64,
    pub gpu_name: Option<String>,
    pub vram_mb: Option<u64>,
    pub engines: Vec<EngineDiagnostic>,
    pub installed_models: Vec<ModelDiagnostic>,
}
```

- [ ] **Step 1: Write redaction tests ensuring prompts/project paths/user file names are excluded by default**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement snapshot and ZIP/text support bundle with structured logs and checksums only**

- [ ] **Step 4: Add opt-in checkbox test for including recent engine logs**

- [ ] **Step 5: Commit**

---

### Task 3: Add hardware presets and safe model/runtime recommendations

**Files:**
- Create: `src-tauri/src/resources/hardware_profile.rs`
- Create: `src/features/models/HardwareProfileCard.tsx`
- Create: `src/features/models/HardwareProfileCard.test.tsx`
- Modify: model compatibility view logic.

**Interfaces:**

```rust
pub enum HardwareTier { LowVram, Vram16, Vram24Plus, CpuOnly }

pub struct RuntimePreset {
    pub tier: HardwareTier,
    pub max_concurrent_gpu_jobs: u8,
    pub director_gpu_layers: Option<u32>,
    pub prefer_cpu_offload: bool,
}
```

- [ ] **Step 1: Write explicit target-machine test**

A 16,384 MB GPU profile must select `Vram16`, allow one GPU-heavy job at a time, and mark oversized models as warning/incompatible according to manifest limits.

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement deterministic profile selection with manual override**

- [ ] **Step 4: Add UI test showing recommendation vs hard requirement distinctly**

- [ ] **Step 5: Commit**

---

### Task 4: Create first-run onboarding and runtime/model setup wizard

**Files:**
- Create: `src/features/onboarding/OnboardingWizard.tsx`
- Create: `src/features/onboarding/OnboardingWizard.test.tsx`
- Create: `src/features/onboarding/steps/*`
- Create: `src-tauri/src/onboarding/mod.rs`

**Interfaces:**

Wizard steps:
1. System check.
2. Choose local storage directories.
3. Install/select AI Director model.
4. Install ACE-Step recommended model/runtime.
5. Install stem separator runtime.
6. Optional melody transcriber.
7. Run health checks and one tiny fixture test.

- [ ] **Step 1: Write wizard navigation test with fake manifests and fake health services**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement resumable onboarding state in app SQLite**

- [ ] **Step 4: Add failure/retry test for interrupted model download**

- [ ] **Step 5: Commit**

---

### Task 5: Add golden end-to-end project fixtures

**Files:**
- Create: `src/test/e2e/text-to-song.spec.ts`
- Create: `src/test/e2e/hum-to-song.spec.ts`
- Create: `src/test/e2e/ai-editing.spec.ts`
- Create: `src/test/e2e/mastering-export.spec.ts`
- Create: `src/test/fixtures/e2e/*`

**Interfaces:**
- CI uses fake deterministic engine/transcriber binaries or mock adapters, never heavyweight production model downloads.
- Hardware acceptance run repeats equivalent flows with real local runtimes.

- [ ] **Step 1: Write text-to-song golden flow**

Prompt → Blueprint → approve → fake generation → immutable master → project save/reopen.

- [ ] **Step 2: Write hum-to-song golden flow**

Fixture hum WAV → transcription fixture → note edit → Build Song → generated master.

- [ ] **Step 3: Write non-destructive edit flow**

Master/stem → repaint → new take → switch take → undo/redo → source hash unchanged.

- [ ] **Step 4: Write mastering flow**

Pre-master fixture → analysis → plan → render → export → QC PASS with expected bounded values.

- [ ] **Step 5: Run all and commit**

---

### Task 6: Package release candidate and perform target-hardware acceptance gate

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify/create: repository release workflow under `.github/workflows/`
- Create: `docs/release/v1-acceptance-checklist.md`
- Create: `docs/release/v1-runtime-licenses.md`

**Interfaces:**
- Installer contains application/runtime bootstrap components only as allowed by their licenses.
- Model manager fetches optional weights after install unless redistribution was separately approved.

- [ ] **Step 1: Document exact acceptance checklist**

Must include clean Windows install, project create/save/reopen, text-to-song, hum-to-song, stem separation, repaint/add-layer, pre-master, mastering, WAV export/QC, cancel/retry, app restart/recovery, and model uninstall/reinstall.

- [ ] **Step 2: Generate production desktop build**

Run:

```bash
npm ci
npm run lint
npm run test:run
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri:build
```

Expected: PASS and signed/unsigned artifact according to configured release channel.

- [ ] **Step 3: Execute real-hardware 16 GB GPU acceptance sequence**

Run one heavy GPU runtime at a time. Verify ResourceManager unload/reload behavior and record peak VRAM/RAM for ACE-Step generation, Demucs separation, melody transcription if GPU-backed, and mastering.

- [ ] **Step 4: Verify all shipped/runtime/model licenses in `v1-runtime-licenses.md`**

No dependency/model may be marked commercially distributable without a checked source/license entry.

- [ ] **Step 5: Commit release docs/config**

```bash
git add src-tauri/tauri.conf.json .github/workflows docs/release
git commit -m "chore: prepare AI-native DAW v1 release candidate"
```

---

## Final release gate

- [ ] `npm run lint` passes.
- [ ] `npm run test:run` passes.
- [ ] `npm run build` passes.
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes.
- [ ] `npm run tauri:build` passes.
- [ ] All four golden E2E workflows pass with fake deterministic runtimes.
- [ ] Real target-machine acceptance checklist passes.
- [ ] No source/generated/master asset is overwritten by an AI operation.
- [ ] Recovery opens a candidate only after explicit user choice.
- [ ] Export QC measures the final written file.
- [ ] Runtime/model license matrix is complete and reviewed.
