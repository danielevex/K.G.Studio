# Live Performance / Virtual Guitar

Status: **officially planned module**
Target branch: `feat/live-performance-virtual-guitar`

## 1. Goal

Add a low-latency live-performance layer to K.G.Studio so a physical MIDI keyboard/controller can be used to perform expressive virtual instruments in real time.

The first flagship use case is **Virtual Guitar**: the user plays original lead parts from a MIDI keyboard while the DAW converts MIDI gestures into guitar-oriented performance data (bend, vibrato, legato, slides, articulation changes, dynamics) and routes them to a realistic guitar instrument and effect chain.

This module is not an automatic solo generator. The human performer remains the source of the musical performance. AI may assist with setup, mapping, tone selection, cleanup, orchestration and editing.

## 2. Product principles

- Human performance first.
- Low-latency monitoring.
- Non-destructive, recordable MIDI performance.
- Instrument-agnostic core with guitar as the first specialized performer.
- Local-first operation wherever possible.
- Clean separation between MIDI input, performance interpretation, instrument rendering and effects.
- Native plugin hosting is a later milestone; external DAW/plugin hosting must remain possible through adapters.
- Artist-inspired tones are presets, not claims of official endorsement or exact hardware replication.

## 3. Signal flow

```text
MIDI Keyboard / Controller
        |
        v
Live MIDI Input
        |
        v
Performance Mapper
  - note / velocity
  - pitch bend
  - mod wheel
  - aftertouch
  - sustain/expression
  - keyswitches
        |
        v
Virtual Instrument Performance Engine
  - mono lead mode
  - legato
  - hammer-on / pull-off
  - slides
  - vibrato
  - palm mute / sustain / harmonics
  - string/fret-aware behavior where supported
        |
        v
Instrument Adapter
  +--> SFZ / sfizz path
  +--> Native VST3 host (future)
  +--> External DAW/plugin adapter (FL Studio/Kontakt/etc.)
        |
        v
Effects Chain
  compressor -> drive/fuzz -> amp -> cabinet -> modulation -> delay -> reverb
        |
        v
Mixer / Recorder / Export
```

## 4. Core module boundaries

### 4.1 LiveMidiInput

Responsibilities:

- enumerate MIDI devices;
- open/close selected device;
- receive Note On/Off, Pitch Bend, CC, Channel Pressure and Poly Aftertouch where available;
- timestamp incoming messages;
- support MIDI learn;
- expose input-health and latency telemetry;
- never contain instrument-specific guitar logic.

### 4.2 PerformanceMapper

Transforms raw MIDI messages into semantic performance controls.

Default guitar mapping:

| MIDI control | Semantic action |
| --- | --- |
| Note On/Off | fretted/plucked note |
| Velocity | pick intensity / dynamic layer |
| Pitch wheel | string bend |
| Mod wheel (CC1) | vibrato depth |
| Channel/Poly Aftertouch | vibrato, feedback or pressure expression |
| Sustain pedal (CC64) | sustain / legato hold |
| Expression (CC11) | expression / volume swell |
| Assignable CC / keyswitch | articulation selection |

Mappings must be editable and saveable per controller/profile.

### 4.3 GuitarPerformanceEngine

Specialized interpreter for guitar behavior.

Required capabilities:

- monophonic lead mode;
- polyphonic chord mode;
- configurable bend range;
- legato detection;
- slide intent detection;
- hammer-on / pull-off intent;
- vibrato smoothing;
- note retrigger policy;
- articulation state;
- optional string/fret assignment when the instrument backend exposes that information;
- humanization that does not overwrite the player's timing.

The engine outputs a normalized `PerformanceEvent` stream independent from Kontakt, SFZ, VST3 or any specific sampler.

### 4.4 InstrumentAdapter

A stable abstraction between the performance engine and the sound source.

Initial adapters:

1. **SFZ/sfizz adapter** — local/open path.
2. **External plugin/DAW adapter** — allows K.G.Studio to control a hosted instrument in an external engine while native hosting is incomplete.
3. **Native VST3 adapter** — later desktop milestone.

The rest of K.G.Studio must not depend directly on Kontakt, Shreddage, Neural Amp Modeler or FL Studio APIs.

### 4.5 EffectsChain

Each performance preset can define an ordered signal chain.

Supported logical blocks:

- compressor;
- boost/overdrive;
- fuzz/distortion;
- amp model;
- cabinet/IR;
- modulation;
- delay;
- reverb;
- EQ;
- volume/expression;
- optional feedback/sustain control.

Backends may implement those blocks with native effects, VST3 plugins or external DAW routing.

## 5. Live Performance UI

Add a dedicated **LIVE** mode to instrument tracks.

### Track header

- input device;
- MIDI channel;
- arm/disarm;
- monitor on/off;
- latency indicator;
- performance profile;
- instrument;
- tone preset.

### Performance panel

Tabs:

1. **PLAY**
   - current note;
   - velocity;
   - bend amount;
   - vibrato amount;
   - active articulation;
   - monitor level.

2. **MAPPING**
   - MIDI learn;
   - pitch wheel range;
   - CC assignments;
   - aftertouch assignment;
   - pedal assignments;
   - keyswitch mapping.

3. **INSTRUMENT**
   - backend;
   - instrument/library;
   - articulation map;
   - mono/poly mode.

4. **TONE**
   - effects chain;
   - bypass per block;
   - editable parameters;
   - save preset.

5. **RECORD**
   - capture MIDI notes;
   - capture pitch bend;
   - capture CC/aftertouch;
   - capture articulation changes;
   - retrospective MIDI buffer.

## 6. Recording model

A live take must preserve more than note pitch and duration.

Recordable event lanes:

- notes and velocity;
- pitch bend;
- CC1/mod wheel;
- CC11/expression;
- sustain;
- aftertouch;
- articulation changes;
- optional plugin parameter automation.

The Piano Roll must later expose these performance lanes without flattening them into static notes.

### Retrospective capture

Maintain a rolling MIDI input buffer so the user can recover a performance played before pressing Record.

This should be implemented as a bounded local ring buffer and committed to a region only when the user chooses **Capture Last Performance**.

## 7. Performance presets

Preset structure:

```text
PerformancePreset
  id
  name
  instrumentProfile
  inputMapping
  articulationMap
  performanceEngineSettings
  signalChain
  backendRequirements
  metadata
```

Presets must be portable and versioned separately from project files.

## 8. Flagship guitar preset family

Create an **Artist-Inspired / Gilmour-style** family focused on expressive Strat-style lead tones.

Planned starting presets:

- **Shine Lead**
  - neck-oriented Strat character;
  - compression/boost;
  - clean-to-driven amp;
  - modulation;
  - long musical delay;
  - spacious reverb.

- **Comfort Lead**
  - bridge-oriented Strat character;
  - compression;
  - fuzz/drive stage;
  - loud clean amp platform;
  - cabinet;
  - subtle modulation;
  - lead delay;
  - reverb.

- **Time Lead**
  - articulate Strat character;
  - drive/fuzz;
  - amp/cab;
  - modulation as required;
  - delay/reverb.

These presets are starting points and remain editable. Exact values belong in backend-specific preset data, not in the core engine.

## 9. AI / Music Director integration

Bionic / Music Director receives high-level tools, for example:

```text
create_live_instrument_track(type="guitar")
select_performance_profile("guitar.lead")
select_tone_preset("artist-inspired.comfort-lead")
map_midi_control(source="pitchwheel", target="guitar.bend", range=2)
map_midi_control(source="cc1", target="guitar.vibrato")
arm_live_monitoring(true)
record_live_take()
capture_last_performance()
```

The AI may configure and edit the environment but must not silently replace a recorded human take.

## 10. Data contracts

The first code milestone introduces stable TypeScript contracts for:

- `LiveMidiMessage`;
- `PerformanceEvent`;
- `MidiControlMapping`;
- `ArticulationDefinition`;
- `PerformanceProfile`;
- `SignalChainBlock`;
- `PerformancePreset`;
- `InstrumentAdapterDescriptor`;
- `LivePerformanceState`.

These contracts should be independent from UI framework and plugin vendor.

## 11. Delivery milestones

### LP0 — Architecture & contracts

- this specification;
- TypeScript domain contracts;
- preset schema;
- adapter interfaces;
- no audio backend assumptions.

### LP1 — Live MIDI foundation — IMPLEMENTED

- Web MIDI input in browser build;
- user-gesture MIDI permission flow;
- device selector with All Inputs fallback;
- Omni / MIDI channel 1–16 filter;
- note, pitch bend, CC, channel aftertouch and poly-aftertouch monitoring;
- MIDI Learn for CC, pitch wheel, aftertouch and keyswitch-style notes;
- visible live input monitor;
- hot-plug device refresh through Web MIDI state-change events.

LP1 deliberately keeps performance mappings transient. Persisted bend/vibrato/articulation mappings belong to LP2/LP3.

Validation for LP1 is covered by the repository CI workflow (TypeScript/Vite build plus the Vitest suite).

### LP2 — Recording & expressive lanes — IMPLEMENTED

- arm/record live MIDI with notes and velocity;
- persisted pitch-bend events;
- persisted MIDI CC events, including sustain and expression;
- persisted channel aftertouch and poly aftertouch;
- editable Piano Roll automation lanes for pitch bend, CC and aftertouch;
- undoable create/update/delete operations for expressive events;
- 30-second retrospective MIDI ring buffer;
- **Capture Last 30s** from the Live MIDI panel into the active MIDI region;
- project structure V18 migration for aftertouch persistence;
- automated tests for retrospective reconstruction, pressure recording and buffering.

Retrospective capture aligns the newest buffered event with the current transport/playhead position and reconstructs note durations and expressive events into region-relative beats.

### LP3 — Guitar Performance Engine — IMPLEMENTED

- vendor-neutral `GuitarPerformanceEngine` that converts raw MIDI into semantic `PerformanceEvent` data;
- subscribable semantic performance stream ready for LP4 instrument adapters without coupling them to Web MIDI;
- monophonic lead mode with last-note priority;
- polyphonic engine mode available for backend/profile use;
- configurable pitch-wheel bend range;
- legato transition detection;
- hammer-on and pull-off detection for close intervals;
- slide-up / slide-down intent detection for wider overlapping intervals;
- separate persistent articulation state and transition gesture state;
- latched sustain / palm-mute / harmonic keyswitch articulations in the Standard profile;
- smoothed vibrato control from CC1 and, in the Expressive profile, channel aftertouch;
- audible live vibrato in the current sampler backend without changing the recorded raw MIDI;
- expression and sustain semantic routing;
- built-in **Standard**, **Expressive** and **Wide Bend** guitar controller profiles;
- persisted performance profile, bend-range and vibrato-smoothing preferences;
- Live MIDI panel controls for profile and bend range plus live note / gesture / articulation / bend / vibrato telemetry;
- keyswitch notes are excluded from normal note recording and retrospective note capture;
- LP2 raw note, velocity, pitch-bend, CC and aftertouch recording remains non-destructive;
- automated tests cover transition semantics, controller mapping, configurable bend, audible vibrato, MIDI routing and keyswitch behavior.

The current SoundFont/sampler backend can monitor LP3 performances immediately. Its note transitions still retrigger samples because backend-specific true legato, dedicated slide samples and articulation switching belong to LP4 instrument adapters. The LP3 event stream already carries the semantic distinction so those future backends do not require rewriting recorded performances.

### LP4 — High-quality instrument backend — IMPLEMENTED

- stable `InstrumentPerformanceAdapter` contract separated from Web MIDI and vendor APIs;
- backend capability discovery with availability and latency-mode metadata;
- selectable **K.G.Studio Internal Sampler** fallback;
- selectable **External MIDI / DAW** high-quality backend;
- Web MIDI output discovery, hot-plug refresh, persisted output and MIDI-channel routing;
- semantic LP3 event routing to an external DAW, Kontakt-class sampler, sfizz VST3, MIDI hardware or another host;
- automatic MIDI RPN 0,0 Pitch Bend Sensitivity configuration;
- correct 14-bit pitch bend output;
- CC1 vibrato, CC11 expression and CC64 sustain output;
- channel pressure and polyphonic aftertouch output;
- semantic articulation-to-keyswitch/CC mapping with a backend-neutral default map;
- legato note ordering for hammer-on, pull-off and slide transitions: new note-on is sent before the previous note-off;
- adapter panic/reset with All Notes Off and All Sound Off;
- external backend routing bypasses the internal sampler to prevent doubled monitoring;
- LP2 raw recording remains independent from the selected renderer;
- dedicated architecture/setup notes in [LP4_INSTRUMENT_BACKENDS.md](./LP4_INSTRUMENT_BACKENDS.md);
- automated tests cover capability discovery, pitch-bend RPN, expressive MIDI, keyswitches, legato ordering, panic and K.G.Studio external routing.

For SFZ, the production-ready path in the current web-only repository is sfizz hosted externally (for example as VST3 in a DAW) and driven through the LP4 MIDI adapter. Direct in-process sfizz remains compatible with the adapter architecture but is intentionally deferred until K.G.Studio has the native desktop boundary required for robust filesystem/sample-library access.

### LP5 — Tone Engine

- modular effect-chain schema;
- amp/cab/effects adapters;
- artist-inspired presets;
- per-preset parameter automation.

### LP6 — Native desktop plugin hosting

- Tauri/native audio boundary;
- VST3 scan/validation;
- plugin instantiation;
- state save/restore;
- crash isolation strategy;
- latency compensation.

### LP7 — Music Director tools

- AI tools for track creation, mapping, preset selection, arming and take management;
- non-destructive edit/version workflow.

## 12. Acceptance criteria for the first usable guitar milestone

The milestone is successful when a user can:

1. connect a USB MIDI keyboard;
2. select it inside K.G.Studio;
3. create a Live Guitar track;
4. hear a guitar instrument with practical low latency;
5. bend a note with the pitch wheel;
6. add vibrato with a mapped controller;
7. control expression with a pedal/CC;
8. record notes plus expressive MIDI data;
9. replay the take with the same articulations;
10. load an editable Gilmour-style lead preset;
11. switch backend without rewriting the recorded MIDI performance.

## 13. Non-goals

For the first implementation:

- do not claim sample-perfect cloning of a named guitarist;
- do not hard-code a dependency on a single commercial plugin;
- do not embed FL Studio or Kontakt-specific logic into the domain model;
- do not block the whole DAW roadmap on native VST3 hosting;
- do not quantize or regenerate the player's performance unless explicitly requested.
