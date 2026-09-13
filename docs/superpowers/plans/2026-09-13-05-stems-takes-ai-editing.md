# Stems, Takes, AI Editing, and Essential Mixer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn immutable generated masters into editable DAW material through native stems or Demucs, expose non-destructive takes on timeline regions, support repaint/add-layer/extend operations, and render a reproducible pre-master through an essential mixer.

**Architecture:** Stem creation is a job graph producing new immutable assets and tracks. AI edits always create derived assets/takes or new tracks; they never overwrite source assets. The mixer remains intentionally small in V1 and produces a pre-master asset used by the mastering subsystem.

**Tech Stack:** Existing K.G.Studio audio tracks/regions, Tauri job runtime, ACE-Step adapter, Demucs sidecar, FFmpeg, Rust/TS asset-take model, Tone/WebAudio compatibility layer where existing code requires it.

**Spec:** `docs/superpowers/specs/2026-09-13-ai-native-daw-design.md`

## Global Constraints

- Generated master remains immutable and available even after stem creation.
- Prefer native engine stems when declared by capability/result metadata; otherwise use Demucs.
- Every AI edit creates new lineage metadata.
- Mixer V1 is gain, pan, mute, solo, stereo width, basic EQ/compression, and essential buses only.
- Pre-master render is versioned and reproducible from project state.

---

### Task 1: Add stem job workflow and Demucs adapter

**Files:**
- Create: `runtime/demucs/manifest.json`
- Create: `src-tauri/src/stems/mod.rs`
- Create: `src-tauri/src/stems/types.rs`
- Create: `src-tauri/src/stems/demucs.rs`
- Create: `src-tauri/src/commands/stems.rs`
- Modify: `src-tauri/src/jobs/*` only for generic workflow composition if needed.

**Interfaces:**

```rust
pub enum StemKind { Vocals, Drums, Bass, Other }

pub struct StemResult {
    pub kind: StemKind,
    pub staging_path: PathBuf,
}

pub async fn separate_stems(input: &Path, output_dir: &Path) -> Result<Vec<StemResult>, StemError>;
```

- [ ] **Step 1: Write mock-adapter tests for expected stem mapping and failure cleanup**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement native-stem-first workflow selector**

If generation result already contains `native_stems`, register them. Otherwise enqueue Demucs after generated master registration.

- [ ] **Step 4: Add dependency graph test**

Expected order: `RegisterMaster -> SeparateStems -> RegisterStemAssets -> CreateTracks -> BuildWaveforms`.

- [ ] **Step 5: Commit**

---

### Task 2: Add timeline take selector and active-take commands

**Files:**
- Create: `src/features/takes/TakeSelector.tsx`
- Create: `src/features/takes/TakeSelector.test.tsx`
- Create: `src/core/commands/SetActiveTakeCommand.ts`
- Modify: `src/stores/projectStore.ts`
- Modify: relevant Inspector component files.

**Interfaces:**
- `setActiveTake(regionId: string, takeId: string)` validates membership in `region.takeIds`.
- Undo/redo uses the existing command pattern.

- [ ] **Step 1: Write command test for activate/undo/redo**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement command and store action without replacing assets**

- [ ] **Step 4: Write UI test switching between Original and AI Repaint takes**

- [ ] **Step 5: Commit**

---

### Task 3: Implement typed repaint, add-layer, and extend application workflows

**Files:**
- Create: `src-tauri/src/operations/mod.rs`
- Create: `src-tauri/src/operations/repaint.rs`
- Create: `src-tauri/src/operations/add_layer.rs`
- Create: `src-tauri/src/operations/extend.rs`
- Modify: `src-tauri/src/engines/traits.rs`
- Modify: `src/agent/music/ActionPlan.ts`
- Create: `src/features/director/ActionPlanReview.tsx`

**Interfaces:**

```rust
async fn repaint(&self, request: RepaintRequest) -> Result<EngineJobHandle, EngineError>;
async fn generate_layer(&self, request: GenerateLayerRequest) -> Result<EngineJobHandle, EngineError>;
async fn continue_audio(&self, request: ContinueAudioRequest) -> Result<EngineJobHandle, EngineError>;
```

- [ ] **Step 1: Write fake-engine tests proving each operation maps to a new asset/take or new track**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement operation services; never let engine adapter mutate project state directly**

Application service sequence: validate selection → build engine request → run job → register output asset → create lineage/take/track → apply one project command.

- [ ] **Step 4: Add plan-review UI test: no operation starts before Apply**

- [ ] **Step 5: Commit**

---

### Task 4: Add essential mixer model and controls

**Files:**
- Create: `src/core/mixer/MixerTypes.ts`
- Create: `src/core/mixer/MixerState.ts`
- Create: `src/core/mixer/MixerState.test.ts`
- Create: `src/features/mixer/MixerPanel.tsx`
- Create: `src/features/mixer/MixerPanel.test.tsx`
- Modify: `KGTrack` only for portable mixer-state reference if existing fields are insufficient.

**Interfaces:**

```ts
export interface TrackMixState {
  gainDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  width: number;
  eqEnabled: boolean;
  compressorEnabled: boolean;
}
```

- [ ] **Step 1: Write domain tests for solo/mute precedence and bounded controls**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement mixer state and UI using existing audio bus abstractions where possible**

- [ ] **Step 4: Add serialization round-trip test**

- [ ] **Step 5: Commit**

---

### Task 5: Implement deterministic pre-master render

**Files:**
- Create: `src-tauri/src/render/mod.rs`
- Create: `src-tauri/src/render/premaster.rs`
- Create: `src-tauri/src/render/render_plan.rs`
- Create: `src-tauri/src/commands/render.rs`
- Create: `src/features/mixer/RenderPreMasterButton.tsx`
- Test: Rust golden fixture test plus TS UI test.

**Interfaces:**

```rust
pub struct PreMasterRenderRequest {
    pub project_root: PathBuf,
    pub sample_rate: u32,
    pub float_output: bool,
}

pub struct PreMasterRecord {
    pub id: Uuid,
    pub asset_id: Uuid,
    pub source_project_revision: String,
    pub created_at: DateTime<Utc>,
}
```

- [ ] **Step 1: Write render-plan test using two fixture tracks and gain/pan state**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement render-plan generation and offline rendering through the existing renderer/native path selected for V1**

The resulting file is registered as `premaster`; it must not include final mastering limiter/normalization.

- [ ] **Step 4: Render the same fixture twice and assert stable duration/channel count plus sample tolerance**

- [ ] **Step 5: Run milestone gate and commit**

```bash
npm run test:run -- src/features/takes src/features/mixer
cargo test --manifest-path src-tauri/Cargo.toml stems:: operations:: render::
npm run build

git add runtime/demucs src/features/takes src/features/mixer src/core/mixer src-tauri/src/stems src-tauri/src/operations src-tauri/src/render
git commit -m "feat: add stems non-destructive AI editing and premaster"
```
