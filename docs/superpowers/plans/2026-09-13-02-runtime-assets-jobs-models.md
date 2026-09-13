# Runtime Assets, Jobs, and Model Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the durable runtime substrate for non-destructive assets/takes, background job graphs, resource arbitration, process supervision, and modular local model installation.

**Architecture:** Extend `KGProject` only with portable references/metadata while keeping large files on disk. Rust owns runtime-only state in SQLite, job scheduling, process lifecycle, resource reservations, and model manifests. TypeScript receives typed DTOs and never manages child processes directly.

**Tech Stack:** Existing KG domain, Tauri 2, Rust, Serde, rusqlite, Tokio, UUID, SHA-256, reqwest, sysinfo/NVML-compatible GPU detection where available.

**Spec:** `docs/superpowers/specs/2026-09-13-ai-native-daw-design.md`

## Global Constraints

- Audio files are immutable once registered as assets.
- `AudioTake` points to assets and parent takes; switching active take never overwrites source files.
- Jobs are persistent enough to report failure/recovery after an app restart.
- UI never spawns processes.
- Model install/uninstall is manifest-driven and checksum-verified.
- ResourceManager must serialize GPU-exclusive jobs on a 16 GB profile.

---

### Task 1: Add portable asset and take metadata to the KG domain

**Files:**
- Create: `src/core/assets/AudioAsset.ts`
- Create: `src/core/assets/AudioTake.ts`
- Create: `src/core/assets/GenerationRecord.ts`
- Create: `src/core/assets/index.ts`
- Modify: `src/core/KGProject.ts`
- Modify: `src/core/region/KGAudioRegion.ts`
- Modify: `src/core/project-upgrader/*`
- Test: add focused tests under `src/core/assets/` and update project upgrader tests.

**Interfaces:**

```ts
export type AudioAssetOrigin = 'recorded' | 'imported' | 'ai_generated' | 'ai_derived' | 'stem_separated' | 'rendered_mix' | 'premaster' | 'master' | 'reference';

export interface AudioAsset {
  id: string;
  relativePath: string;
  sha256: string;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  format: 'wav' | 'flac' | 'mp3' | 'other';
  origin: AudioAssetOrigin;
  createdAt: string;
}

export interface AudioTake {
  id: string;
  assetId: string;
  parentTakeId: string | null;
  generationId: string | null;
  operation: string;
  createdAt: string;
}
```

`KGAudioRegion` gains `activeTakeId: string` and `takeIds: string[]` while legacy `audioFileId` remains readable during migration.

- [ ] **Step 1: Write serialization tests for asset/take lineage**

```ts
it('serializes a region with multiple takes without duplicating asset metadata', () => {
  const project = makeProjectWithTwoTakes();
  const json = serializeProject(project);
  expect(json).toContain('activeTakeId');
  expect(project.getAudioAssets()).toHaveLength(2);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm run test:run -- src/core/assets src/core/project-upgrader`

- [ ] **Step 3: Implement domain types and project version migration**

Increment `KGProject.CURRENT_PROJECT_STRUCTURE_VERSION` by one. Migration rule: if a legacy `KGAudioRegion` has `audioFileId` and no takes, create one asset reference/take using the legacy ID/path information available to the loader and set it active.

- [ ] **Step 4: Verify old and new projects round-trip**

Run: `npm run test:run -- src/core/assets src/core/io/KGProjectStorage.test.ts src/core/project-upgrader`

- [ ] **Step 5: Commit**

```bash
git add src/core/assets src/core/KGProject.ts src/core/region/KGAudioRegion.ts src/core/project-upgrader
git commit -m "feat: add non-destructive audio asset and take model"
```

---

### Task 2: Add Rust asset registry and immutable file import

**Files:**
- Create: `src-tauri/src/assets/mod.rs`
- Create: `src-tauri/src/assets/registry.rs`
- Create: `src-tauri/src/assets/import.rs`
- Create: `src-tauri/src/commands/assets.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**

```rust
pub struct RegisteredAudioAsset {
    pub id: Uuid,
    pub relative_path: String,
    pub sha256: String,
    pub byte_len: u64,
}

pub fn import_asset(project_root: &Path, source: &Path, class: AssetClass) -> Result<RegisteredAudioAsset, AssetError>;
```

- [ ] **Step 1: Write a failing deduplication test**

```rust
#[test]
fn identical_imports_reuse_same_content_hash() {
    let first = import_fixture("tone.wav");
    let second = import_fixture("tone.wav");
    assert_eq!(first.sha256, second.sha256);
}
```

- [ ] **Step 2: Run test and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml assets::`

- [ ] **Step 3: Implement streaming SHA-256, safe extension handling, and copy-to-project**

Copy into the appropriate project subdirectory using a generated filename `<uuid>.<ext>`. Never mutate the source file.

- [ ] **Step 4: Add traversal rejection test**

Assert that a manipulated relative destination cannot escape `project_root`.

- [ ] **Step 5: Run and commit**

```bash
cargo test --manifest-path src-tauri/Cargo.toml assets::
git add src-tauri/src/assets src-tauri/src/commands
git commit -m "feat: add immutable native asset registry"
```

---

### Task 3: Implement the durable job state machine and dependency graph

**Files:**
- Create: `src-tauri/src/jobs/mod.rs`
- Create: `src-tauri/src/jobs/types.rs`
- Create: `src-tauri/src/jobs/graph.rs`
- Create: `src-tauri/src/jobs/store.rs`
- Create: `src-tauri/src/storage/database.rs`

**Interfaces:**

```rust
pub enum JobState { Queued, Preparing, Running, Finalizing, Completed, Failed, Cancelled }

pub struct JobSpec {
    pub id: Uuid,
    pub kind: String,
    pub dependencies: Vec<Uuid>,
    pub resource_request: ResourceRequest,
}

pub fn ready_jobs(graph: &JobGraph) -> Vec<Uuid>;
pub fn transition(current: JobState, next: JobState) -> Result<JobState, JobTransitionError>;
```

- [ ] **Step 1: Write transition and DAG tests**

```rust
#[test]
fn dependent_job_is_not_ready_until_parent_completes() {
    let mut graph = fixture_two_job_graph();
    assert_eq!(ready_jobs(&graph), vec![graph.root]);
    graph.complete(graph.root).unwrap();
    assert_eq!(ready_jobs(&graph), vec![graph.child]);
}
```

- [ ] **Step 2: Run and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml jobs::`

- [ ] **Step 3: Implement the state machine, acyclic graph validation, and SQLite persistence**

SQLite schema must include `jobs(id, kind, state, progress, stage, message, created_at, updated_at, error_json)` and `job_dependencies(job_id, dependency_id)` with foreign keys enabled.

- [ ] **Step 4: Test restart recovery**

A persisted `Running` job loaded after restart must become `Failed` with reason `interrupted_by_restart`, not silently continue.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/jobs src-tauri/src/storage/database.rs
git commit -m "feat: add durable background job graph"
```

---

### Task 4: Add central resource reservations and the 16 GB GPU policy

**Files:**
- Create: `src-tauri/src/resources/mod.rs`
- Create: `src-tauri/src/resources/types.rs`
- Create: `src-tauri/src/resources/manager.rs`

**Interfaces:**

```rust
pub struct ResourceRequest {
    pub estimated_vram_mb: u32,
    pub estimated_ram_mb: u32,
    pub exclusive_gpu: bool,
    pub cpu_threads: Option<u16>,
}

pub struct ResourceLease { pub job_id: Uuid }

impl ResourceManager {
    pub fn try_acquire(&mut self, job_id: Uuid, request: &ResourceRequest) -> Result<ResourceLease, ResourceError>;
    pub fn release(&mut self, lease: ResourceLease);
}
```

- [ ] **Step 1: Write a failing exclusivity test**

```rust
#[test]
fn exclusive_gpu_job_blocks_second_gpu_job() {
    let mut manager = ResourceManager::for_test(16_384, 32_768);
    let _lease = manager.try_acquire(id1(), &gpu_job(12_000, true)).unwrap();
    assert!(manager.try_acquire(id2(), &gpu_job(4_000, false)).is_err());
}
```

- [ ] **Step 2: Run test and verify failure**

- [ ] **Step 3: Implement deterministic reservations**

Reserve before process/model load; release on Completed/Failed/Cancelled. Do not depend on live free-VRAM telemetry for correctness; telemetry may refine estimates but reservations are authoritative.

- [ ] **Step 4: Add profile test for Director unload → ACE-Step generation → Director restore scheduling**

Represent unload/load as jobs sharing the same exclusive GPU resource.

- [ ] **Step 5: Run and commit**

```bash
cargo test --manifest-path src-tauri/Cargo.toml resources::
git add src-tauri/src/resources
git commit -m "feat: add GPU and RAM resource scheduler"
```

---

### Task 5: Add ProcessSupervisor with allowlisted executable descriptors

**Files:**
- Create: `src-tauri/src/process/mod.rs`
- Create: `src-tauri/src/process/descriptor.rs`
- Create: `src-tauri/src/process/supervisor.rs`
- Create: `src-tauri/src/process/log.rs`

**Interfaces:**

```rust
pub struct ProcessDescriptor {
    pub id: String,
    pub executable: PathBuf,
    pub fixed_args: Vec<String>,
    pub working_dir: PathBuf,
}

pub trait ChildProcess {
    fn id(&self) -> &str;
    async fn terminate(&mut self) -> Result<(), ProcessError>;
}
```

- [ ] **Step 1: Write a test rejecting an executable outside the registered runtime directory**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement start/health/terminate with structured stdout/stderr capture**

No public API accepts arbitrary executable paths or arbitrary shell strings from the frontend.

- [ ] **Step 4: Add crash detection test with a fixture child process exiting non-zero**

- [ ] **Step 5: Commit**

```bash
cargo test --manifest-path src-tauri/Cargo.toml process::
git add src-tauri/src/process
git commit -m "feat: add supervised local runtime processes"
```

---

### Task 6: Implement manifest-driven Model Manager

**Files:**
- Create: `src-tauri/src/models/mod.rs`
- Create: `src-tauri/src/models/manifest.rs`
- Create: `src-tauri/src/models/installer.rs`
- Create: `src-tauri/src/models/registry.rs`
- Create: `src-tauri/src/commands/models.rs`
- Create: `src/features/models/modelManagerStore.ts`
- Create: `src/features/models/modelManagerStore.test.ts`

**Interfaces:**

```rust
pub struct ModelManifest {
    pub id: String,
    pub version: String,
    pub engine_id: String,
    pub files: Vec<ModelFile>,
    pub disk_bytes: u64,
    pub recommended_vram_mb: u32,
    pub license: LicenseInfo,
}

pub struct ModelFile {
    pub url: String,
    pub relative_path: String,
    pub sha256: String,
}
```

- [ ] **Step 1: Write manifest validation tests**

Reject duplicate relative paths, `..`, unsupported URL schemes, empty SHA-256, and missing license metadata.

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement install to staging directory, checksum all files, then atomic directory promotion**

If any checksum fails, delete staging and leave the previous installed version untouched.

- [ ] **Step 4: Add frontend store test**

```ts
it('reports incompatible recommendation without blocking explicit installation', () => {
  const view = toModelView(manifest, { vramMb: 8192 });
  expect(view.compatibility).toBe('warning');
});
```

- [ ] **Step 5: Run milestone gate and commit**

```bash
npm run test:run -- src/features/models
cargo test --manifest-path src-tauri/Cargo.toml
npm run build

git add src-tauri/src/models src-tauri/src/commands/models.rs src/features/models
git commit -m "feat: add modular local model manager"
```
