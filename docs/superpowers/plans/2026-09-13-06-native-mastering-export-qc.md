# Native Mastering, Reference Match, Export, and QC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native deterministic mastering subsystem that analyzes pre-masters, proposes editable mastering plans, supports level-matched reference comparison, renders versioned master takes, exports delivery files, and QC-checks the actual rendered output.

**Architecture:** Mastering is not a generative sidecar. Rust owns metering, DSP graph, offline rendering, reference analysis, master versioning, and final QC. AI may translate user intent into safe parameter suggestions, but measured audio analysis and bounded DSP parameters remain authoritative.

**Tech Stack:** Rust stable, hound or equivalent WAV I/O, rustfft-compatible FFT, native biquad/filter/DSP primitives, Tauri bridge, React Mastering Room. Study/reference implementations may include `noisyloop/mastering`, oXygen, Bellweather Audio Core, and OxiAudio, subject to license review before code reuse.

**Spec:** `docs/superpowers/specs/2026-09-13-ai-native-daw-design.md`

## Global Constraints

- Metering targets ITU-R BS.1770-5 semantics; test against published/independent vectors where available.
- True-peak detection uses at least 4× oversampling in V1.
- Mastering chain is non-destructive and parameter-versioned.
- Automatic assistant changes remain editable before render.
- Loudness target is a delivery/mastering choice, not a universal `-14 LUFS` rule.
- Dither is applied only when reducing integer bit depth.
- Final QC reopens and measures the exported file.

---

### Task 1: Build objective audio analysis primitives

**Files:**
- Create: `src-tauri/src/mastering/mod.rs`
- Create: `src-tauri/src/mastering/analysis/mod.rs`
- Create: `src-tauri/src/mastering/analysis/loudness.rs`
- Create: `src-tauri/src/mastering/analysis/true_peak.rs`
- Create: `src-tauri/src/mastering/analysis/dynamics.rs`
- Create: `src-tauri/src/mastering/analysis/stereo.rs`
- Create: `src-tauri/src/mastering/analysis/spectrum.rs`
- Test fixtures: `src-tauri/tests/audio-fixtures/`

**Interfaces:**

```rust
pub struct MasterAnalysis {
    pub integrated_lufs: f64,
    pub loudness_range_lu: f64,
    pub max_true_peak_dbtp: f64,
    pub peak_to_loudness_ratio_db: f64,
    pub stereo_correlation: f64,
    pub dc_offset: [f64; 2],
    pub spectral_bands_db: Vec<f64>,
}

pub fn analyze_master(path: &Path) -> Result<MasterAnalysis, AnalysisError>;
```

- [ ] **Step 1: Add deterministic sine/noise/WAV fixtures and failing tests for RMS-independent loudness/true peak behavior**

- [ ] **Step 2: Run and verify failure**

Run: `cargo test --manifest-path src-tauri/Cargo.toml mastering::analysis`

- [ ] **Step 3: Implement K-weighting/gating, 4× true-peak interpolation/oversampling path, LRA/PLR, stereo correlation, DC and spectrum summaries**

Keep each primitive in a focused module and expose one aggregate analyzer.

- [ ] **Step 4: Add tolerance-based conformance tests**

Tests must use numeric tolerances stated in the test names/comments; do not assert rounded UI strings.

- [ ] **Step 5: Commit**

---

### Task 2: Define bounded mastering plan and DSP graph

**Files:**
- Create: `src-tauri/src/mastering/plan.rs`
- Create: `src-tauri/src/mastering/dsp/mod.rs`
- Create: `src-tauri/src/mastering/dsp/eq.rs`
- Create: `src-tauri/src/mastering/dsp/dynamics.rs`
- Create: `src-tauri/src/mastering/dsp/stereo.rs`
- Create: `src-tauri/src/mastering/dsp/clipper.rs`
- Create: `src-tauri/src/mastering/dsp/limiter.rs`
- Create: `src-tauri/src/mastering/dsp/dither.rs`

**Interfaces:**

```rust
pub struct MasteringPlan {
    pub corrective_eq: Vec<EqBand>,
    pub dynamic_eq: Vec<DynamicEqBand>,
    pub glue: Option<CompressorSettings>,
    pub stereo: StereoSettings,
    pub clipper: Option<ClipperSettings>,
    pub limiter: LimiterSettings,
}
```

Boundaries include hard validation, for example limiter ceiling `[-3.0, -0.1] dBTP`, stereo width `[0.0, 2.0]`, and EQ gain `[-12.0, +12.0] dB`.

- [ ] **Step 1: Write plan-validation tests for invalid frequencies, gains, thresholds, and ceilings**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement parameter objects and a canonical DSP graph order**

Canonical V1 order: cleanup/DC → corrective EQ → optional dynamic EQ/de-harsh → optional glue → stereo safeguards → optional soft clipper → true-peak limiter → output/dither.

- [ ] **Step 4: Add bypass identity test**

A plan with all optional processors disabled and unity output must match input within a strict floating-point tolerance before encoding.

- [ ] **Step 5: Commit**

---

### Task 3: Add mastering assistant heuristics and AI intent translation

**Files:**
- Create: `src-tauri/src/mastering/assistant.rs`
- Create: `src/agent/music/MasteringIntent.ts`
- Create: `src/features/mastering/masteringStore.ts`
- Create: `src/features/mastering/masteringStore.test.ts`

**Interfaces:**

```rust
pub fn propose_plan(analysis: &MasterAnalysis, intent: &MasteringIntentDto) -> MasteringProposal;
```

Intent fields are bounded semantic preferences such as `power`, `transient_preservation`, `warmth`, `brightness`, and `stereo_width_preference`, each normalized to `0.0..=1.0`.

- [ ] **Step 1: Write test proving the same analysis + same intent yields identical proposal**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement conservative rules based on measured data**

The LLM may map text to intent values; it must not directly output arbitrary DSP node code or unrestricted parameter ranges.

- [ ] **Step 4: Add UI-store test requiring user confirmation before plan becomes active**

- [ ] **Step 5: Commit**

---

### Task 4: Add level-matched reference analysis

**Files:**
- Create: `src-tauri/src/mastering/reference/mod.rs`
- Create: `src-tauri/src/mastering/reference/match.rs`
- Create: `src-tauri/src/mastering/reference/profile.rs`
- Create: `src/features/mastering/ReferencePanel.tsx`
- Create: `src/features/mastering/ReferencePanel.test.tsx`

**Interfaces:**

```rust
pub struct ReferenceComparison {
    pub target: MasterAnalysis,
    pub reference: MasterAnalysis,
    pub loudness_match_gain_db: f64,
    pub spectral_delta_db: Vec<f64>,
    pub width_delta: f64,
    pub dynamics_delta_db: f64,
}
```

- [ ] **Step 1: Write test proving comparison first loudness-matches reference/target before tonal recommendation generation**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement analysis-only reference matcher with conservative capped recommendations**

Do not copy GPL/AGPL implementation code from Matchering/Keel; use independently implemented algorithms/specification ideas.

- [ ] **Step 4: Add A/B UI test with `Original`, `Master`, and `Level Matched A/B` modes**

- [ ] **Step 5: Commit**

---

### Task 5: Implement offline master renderer and versioned MasterTake records

**Files:**
- Create: `src-tauri/src/mastering/renderer.rs`
- Create: `src-tauri/src/mastering/types.rs`
- Create: `src-tauri/src/commands/mastering.rs`
- Create: `src/features/mastering/MasteringRoom.tsx`
- Create: `src/features/mastering/MasteringRoom.test.tsx`
- Modify: `KGProject` portable master metadata through the existing upgrader/versioning mechanism.

**Interfaces:**

```rust
pub struct MasterTakeRecord {
    pub id: Uuid,
    pub pre_master_asset_id: Uuid,
    pub output_asset_id: Uuid,
    pub plan: MasteringPlan,
    pub analysis_before: MasterAnalysis,
    pub analysis_after: MasterAnalysis,
}
```

- [ ] **Step 1: Write render test for one fixture pre-master and fixed plan**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement offline renderer with progress callbacks and immutable output registration**

- [ ] **Step 4: Render same input/plan twice and assert deterministic samples/metadata within encoding tolerance**

- [ ] **Step 5: Commit**

---

### Task 6: Add delivery export and post-render QC

**Files:**
- Create: `src-tauri/src/mastering/export.rs`
- Create: `src-tauri/src/mastering/qc.rs`
- Create: `src/features/mastering/ExportPanel.tsx`
- Create: `src/features/mastering/ExportPanel.test.tsx`

**Interfaces:**

```rust
pub enum DeliveryFormat {
    WavFloat32 { sample_rate: u32 },
    WavPcm24 { sample_rate: u32 },
    WavPcm16 { sample_rate: u32, dither: DitherMode },
}

pub struct QcReport {
    pub pass: bool,
    pub measured: MasterAnalysis,
    pub violations: Vec<QcViolation>,
}
```

- [ ] **Step 1: Write tests for 16-bit dither enabled, 24-bit no forced dither, and true-peak failure reporting**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement export then reopen the actual output file and run `analyze_master` on it**

- [ ] **Step 4: Add auto-fix path only for bounded delivery violations**

For example, if measured true peak exceeds configured ceiling, rerender through limiter with a small bounded ceiling correction; never silently alter tonal/mastering intent.

- [ ] **Step 5: Run milestone gate and commit**

```bash
cargo test --manifest-path src-tauri/Cargo.toml mastering::
npm run test:run -- src/features/mastering
npm run build

git add src-tauri/src/mastering src-tauri/src/commands/mastering.rs src/features/mastering src/agent/music/MasteringIntent.ts src/core/KGProject.ts src/core/project-upgrader
git commit -m "feat: add native mastering export and final QC"
```
