# AI Director and Engine Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first complete local AI generation vertical slice: natural-language request → typed Music Blueprint → reviewed ActionPlan → ACE-Step job → immutable generated master asset.

**Architecture:** AI Director and music engines are separate capabilities. The Director emits only typed plans; a validator maps approved operations to application commands. `MusicEngine` adapters hide model-specific APIs. ACE-Step is the first real adapter; a fake engine is used for deterministic tests.

**Tech Stack:** Rust/Tauri runtime, existing `src/agent` UI/domain integration, llama.cpp local server/process, ACE-Step 1.5 sidecar API, Serde, Tokio, reqwest.

**Spec:** `docs/superpowers/specs/2026-09-13-ai-native-daw-design.md`

## Global Constraints

- Director cannot execute arbitrary tools, shell commands, paths, or engine APIs.
- User must review/approve Blueprint before generation.
- Full-song result is registered as immutable `ai_generated` master asset.
- Engine capability routing is independent from engine implementation.
- Invalid or unsupported actions fail before a process/job is launched.

---

### Task 1: Define engine contracts and capability routing

**Files:**
- Create: `src-tauri/src/engines/mod.rs`
- Create: `src-tauri/src/engines/types.rs`
- Create: `src-tauri/src/engines/traits.rs`
- Create: `src-tauri/src/engines/registry.rs`
- Create: `src-tauri/src/engines/router.rs`

**Interfaces:**

```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MusicCapability {
    GenerateSong, LyricsConditioning, ReferenceAudio, GenerateLayer,
    Repaint, ContinueAudio, AudioToAudio, NativeStems, Vocals, Instrumental, Lora,
}

#[async_trait]
pub trait MusicEngine: Send + Sync {
    fn descriptor(&self) -> EngineDescriptor;
    fn capabilities(&self) -> HashSet<MusicCapability>;
    async fn health_check(&self) -> Result<(), EngineError>;
    async fn generate_song(&self, request: GenerateSongRequest) -> Result<EngineJobHandle, EngineError>;
}
```

- [ ] **Step 1: Write routing tests with two fake engines**

```rust
#[test]
fn selects_engine_that_satisfies_all_required_capabilities() {
    let router = fixture_router();
    let id = router.select(&set![MusicCapability::GenerateSong, MusicCapability::LyricsConditioning]).unwrap();
    assert_eq!(id, "full-song");
}
```

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement registry/router without ACE-Step-specific branches**

Selection order: user-pinned compatible engine first; otherwise installed+healthy engine with all required capabilities and lowest configured priority value.

- [ ] **Step 4: Test missing capability error includes required and available sets**

- [ ] **Step 5: Commit**

```bash
cargo test --manifest-path src-tauri/Cargo.toml engines::
git add src-tauri/src/engines
git commit -m "feat: add capability-based music engine router"
```

---

### Task 2: Define Music Blueprint and ActionPlan protocol

**Files:**
- Create: `src/agent/music/MusicBlueprint.ts`
- Create: `src/agent/music/ActionPlan.ts`
- Create: `src/agent/music/validation.ts`
- Create: `src/agent/music/validation.test.ts`
- Create: `src-tauri/src/director/types.rs`
- Create: `src-tauri/src/director/validator.rs`

**Interfaces:**

```ts
export interface MusicBlueprint {
  title: string;
  prompt: string;
  bpm: number;
  keySignature: string;
  timeSignature: { numerator: number; denominator: number };
  durationSeconds: number;
  structure: SongSection[];
  lyrics: string | null;
  requestedCapabilities: string[];
}

export type DirectorAction =
  | { type: 'GenerateSong'; blueprintId: string }
  | { type: 'AddLayer'; trackId: string; startBeat: number; endBeat: number; prompt: string }
  | { type: 'RepaintRegion'; regionId: string; startBeat: number; endBeat: number; prompt: string }
  | { type: 'CreateMaster'; preMasterId: string };
```

- [ ] **Step 1: Write tests rejecting unknown actions and unsafe ranges**

```ts
expect(() => validateAction({ type: 'RunShell', command: 'rm -rf' } as never)).toThrow();
expect(() => validateAction({ type: 'AddLayer', trackId: 'x', startBeat: 10, endBeat: 2, prompt: 'piano' })).toThrow();
```

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement strict discriminated-union parsing on TS and Rust sides**

Director JSON with extra unknown top-level `type` values must fail closed.

- [ ] **Step 4: Add round-trip fixture shared by TS and Rust tests**

Store fixture at `src/test/fixtures/director/action-plan-generate-song.json` and assert both runtimes parse identical fields.

- [ ] **Step 5: Commit**

---

### Task 3: Add llama.cpp Director provider behind existing LLM abstraction

**Files:**
- Create: `src-tauri/src/director/mod.rs`
- Create: `src-tauri/src/director/llama_provider.rs`
- Create: `src-tauri/src/director/prompt.rs`
- Modify: `src/agent/llm/LLMProvider.ts`
- Create: `src/bridge/directorBridge.ts`
- Create: `src/features/director/directorStore.ts`
- Create: `src/features/director/directorStore.test.ts`

**Interfaces:**

```rust
pub trait DirectorProvider {
    async fn create_blueprint(&self, input: DirectorInput) -> Result<MusicBlueprintDto, DirectorError>;
    async fn create_action_plan(&self, input: ActionPlanInput) -> Result<ActionPlanDto, DirectorError>;
}
```

- [ ] **Step 1: Write store test proving generated plan remains pending until explicit approval**

```ts
it('does not submit a pending plan automatically', async () => {
  await store.plan('make the chorus bigger');
  expect(store.getState().pendingPlan).not.toBeNull();
  expect(engineBridge.submit).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement provider request using a structured JSON schema prompt and low-temperature deterministic mode**

The prompt states that the model may emit only the known schema. Validation errors are returned to UI; do not silently repair arbitrary action types.

- [ ] **Step 4: Add retry-on-invalid-JSON once with validation feedback**

Only one correction attempt is allowed; second failure surfaces to user.

- [ ] **Step 5: Commit**

---

### Task 4: Implement ACE-Step adapter and sidecar health lifecycle

**Files:**
- Create: `runtime/ace-step/manifest.json`
- Create: `src-tauri/src/engines/adapters/mod.rs`
- Create: `src-tauri/src/engines/adapters/ace_step.rs`
- Create: `src-tauri/src/engines/adapters/ace_step_api.rs`
- Create: `src-tauri/src/engines/adapters/ace_step_test.rs`

**Interfaces:**

Adapter maps `GenerateSongRequest` into ACE-Step sidecar request; it returns generated file paths only inside the job staging directory.

- [ ] **Step 1: Write adapter contract test against an in-process mock HTTP server**

Assert BPM, key, duration, prompt, lyrics, seed, and output directory mapping.

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement `/health`, submit, poll/progress, cancel, and result mapping**

No UI knows ACE-Step endpoint names.

- [ ] **Step 4: Add failure test for sidecar exit during generation**

Job must become `Failed`, resource lease released, staging outputs quarantined/deleted.

- [ ] **Step 5: Commit**

---

### Task 5: Build Blueprint review UI and full-song vertical slice

**Files:**
- Create: `src/features/director/BlueprintPanel.tsx`
- Create: `src/features/director/BlueprintPanel.test.tsx`
- Create: `src/features/jobs/JobCenter.tsx`
- Create: `src/features/jobs/jobStore.ts`
- Modify: `src/App.tsx`
- Modify: `src/stores/projectStore.ts` only through focused new actions for asset registration/project updates.

**Interfaces:**
- `Generate Song` calls a single application bridge command with approved `MusicBlueprint`.
- Completion registers immutable master asset plus `GenerationRecord` and never auto-creates stems in this milestone.

- [ ] **Step 1: Write UI tests for editable Blueprint fields and explicit Generate button**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement Blueprint panel, job progress, preview/keep/send-to-timeline actions**

`Keep` means register result in project; `Send to Timeline` may create one audio track using the immutable master, but no stem separation yet.

- [ ] **Step 4: Add E2E test using fake engine**

Prompt → fake Blueprint → approve → fake generation → asset appears in project.

- [ ] **Step 5: Run milestone gate and commit**

```bash
npm run lint
npm run test:run
cargo test --manifest-path src-tauri/Cargo.toml
npm run build

git add src/agent/music src/features/director src/features/jobs src-tauri/src/director src-tauri/src/engines runtime/ace-step src/App.tsx src/stores/projectStore.ts
git commit -m "feat: deliver local AI song generation vertical slice"
```
