# Melody Capture / Hum-to-Song Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user hum or sing a melody into the microphone, preserve the original recording, transcribe it into editable MIDI, analyze key/tempo, and use that melody as a structured condition for AI accompaniment/song generation.

**Architecture:** Capture remains a normal audio asset. Transcription is a separate local service/adapter that returns note events and confidence data. The DAW stores a `MelodyAsset` referencing both the source audio and MIDI representation. Harmonic analysis and Melody Fidelity policy run before any engine request.

**Tech Stack:** Existing recorder/audio interfaces, Tauri/Rust asset runtime, MIDI domain, local Basic Pitch-compatible transcription sidecar, tonal utilities, existing piano roll.

**Spec:** `docs/superpowers/specs/2026-09-13-ai-native-daw-design.md`

## Global Constraints

- Original humming audio is immutable and always retained.
- Pitch correction/quantization never modifies the source audio silently.
- Transcription uncertainty is exposed through confidence data.
- Melody MIDI is editable through the existing piano-roll concepts.
- Melody Fidelity is one of `strict`, `balanced`, `creative` and is carried into generation requests.

---

### Task 1: Add MelodyAsset domain model

**Files:**
- Create: `src/core/melody/MelodyAsset.ts`
- Create: `src/core/melody/MelodyTypes.ts`
- Create: `src/core/melody/index.ts`
- Modify: `src/core/KGProject.ts`
- Modify: `src/core/project-upgrader/*`
- Test: `src/core/melody/MelodyAsset.test.ts`

**Interfaces:**

```ts
export type MelodyFidelity = 'strict' | 'balanced' | 'creative';

export interface MelodyNote {
  id: string;
  midiNote: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  confidence: number;
  centsOffset: number;
}

export interface MelodyAsset {
  id: string;
  sourceAudioAssetId: string;
  notes: MelodyNote[];
  detectedBpm: number | null;
  detectedKey: string | null;
  confidence: number;
  fidelity: MelodyFidelity;
}
```

- [ ] **Step 1: Write round-trip tests**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement domain types, project collection, and migration defaults**

- [ ] **Step 4: Verify project serialization/upgrader tests**

- [ ] **Step 5: Commit**

---

### Task 2: Add microphone Melody recording workflow

**Files:**
- Create: `src/features/melody/MelodyRecorder.tsx`
- Create: `src/features/melody/MelodyRecorder.test.tsx`
- Create: `src/features/melody/melodyStore.ts`
- Modify: `src/core/audio-interface/KGAudioRecorder.ts`
- Create: `src/bridge/melodyBridge.ts`

**Interfaces:**
- `recordMelody()` produces an immutable recorded `AudioAsset` ID.
- UI states: `idle | recording | saving | ready | error`.

- [ ] **Step 1: Write UI test for start/stop and preservation of resulting asset ID**

```ts
it('registers one source asset when recording stops', async () => {
  await user.click(screen.getByRole('button', { name: /record melody/i }));
  await user.click(screen.getByRole('button', { name: /stop/i }));
  expect(registerAsset).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Reuse existing recorder primitives and send finalized Blob/file through the desktop asset bridge**

- [ ] **Step 4: Test permission denial and zero-length recording**

- [ ] **Step 5: Commit**

---

### Task 3: Implement transcription adapter and note normalization

**Files:**
- Create: `runtime/melody-transcriber/manifest.json`
- Create: `src-tauri/src/melody/mod.rs`
- Create: `src-tauri/src/melody/types.rs`
- Create: `src-tauri/src/melody/transcriber.rs`
- Create: `src-tauri/src/melody/normalizer.rs`
- Create: `src-tauri/src/commands/melody.rs`

**Interfaces:**

```rust
pub struct TranscribedNote {
    pub pitch_midi: f32,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub confidence: f32,
}

pub async fn transcribe(asset_path: &Path) -> Result<Vec<TranscribedNote>, MelodyError>;
```

- [ ] **Step 1: Write deterministic normalization tests using fixture note arrays**

Assert conversion from seconds to beats and preservation of cents offset.

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement sidecar adapter plus normalization; do not quantize yet**

- [ ] **Step 4: Add invalid/no-pitch result tests**

Return a typed `NoStableMelodyDetected` error rather than an empty successful asset.

- [ ] **Step 5: Commit**

---

### Task 4: Add conservative key/tempo analysis and Melody Fidelity policies

**Files:**
- Create: `src/core/melody/analyzeMelody.ts`
- Create: `src/core/melody/analyzeMelody.test.ts`
- Create: `src/core/melody/applyMelodyFidelity.ts`
- Create: `src/core/melody/applyMelodyFidelity.test.ts`

**Interfaces:**

```ts
export interface MelodyEditSuggestion {
  noteId: string;
  originalMidi: number;
  suggestedMidi: number;
  reason: 'scale' | 'timing';
}

export function applyMelodyFidelity(notes: MelodyNote[], fidelity: MelodyFidelity, context: MelodyContext): MelodyProcessingResult;
```

Rules:
- `strict`: preserve pitch class/timing except conversion to valid MIDI note/event boundaries.
- `balanced`: suggest nearest scale correction only when confidence is low and distance ≤ 1 semitone; quantize timing softly to nearest 1/8 note when onset deviation ≤ 20% of that subdivision.
- `creative`: never destructively edit source; create a derived variation request allowing engine-side development.

- [ ] **Step 1: Write one test for each policy**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement analysis and suggestion generation**

- [ ] **Step 4: Verify that all corrections remain user-reviewable suggestions**

- [ ] **Step 5: Commit**

---

### Task 5: Integrate editable melody into piano roll and Build Song flow

**Files:**
- Create: `src/features/melody/MelodyEditor.tsx`
- Create: `src/features/melody/MelodyEditor.test.tsx`
- Create: `src/features/melody/BuildSongFromMelodyPanel.tsx`
- Modify: existing piano-roll integration files only through adapter props/actions.
- Modify: `src/agent/music/MusicBlueprint.ts`
- Modify: Rust `GenerateSongRequest` type.

**Interfaces:**

```ts
export interface MelodyCondition {
  melodyAssetId: string;
  fidelity: MelodyFidelity;
  role: 'lead' | 'vocal' | 'instrument';
  instrumentHint?: string;
}
```

- [ ] **Step 1: Write UI test proving a note edit updates `MelodyAsset` but not source audio asset metadata**

- [ ] **Step 2: Run and verify failure**

- [ ] **Step 3: Implement piano-roll projection/editing and Build Song form**

Fields: style prompt, role, instrument hint, fidelity, BPM override, key override.

- [ ] **Step 4: Add fake-engine E2E: recording fixture → transcribe fixture → edit note → Build Song → generated master**

- [ ] **Step 5: Run milestone gate and commit**

```bash
npm run test:run -- src/core/melody src/features/melody
cargo test --manifest-path src-tauri/Cargo.toml melody::
npm run build

git add src/core/melody src/features/melody src-tauri/src/melody src-tauri/src/commands/melody.rs runtime/melody-transcriber src/agent/music
git commit -m "feat: add hum-to-song melody capture workflow"
```
