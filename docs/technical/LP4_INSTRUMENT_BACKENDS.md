# LP4 Instrument Backends

## Status

LP4 introduces the first backend layer that can render the semantic guitar performance stream outside K.G.Studio's fallback SoundFont sampler.

The current repository is a Vite/WebAudio application. It does not yet contain the native Tauri/VST3 host planned for LP6. LP4 therefore uses two practical backends:

1. **K.G.Studio Internal Sampler** — immediate in-process monitoring.
2. **External MIDI / DAW** — high-quality path for Kontakt, sfizz VST3, another sampler, another DAW, or hardware.

## External MIDI / DAW signal path

```text
MIDI keyboard
  -> K.G.Studio Web MIDI input
  -> LP3 GuitarPerformanceEngine
  -> semantic PerformanceEvent stream
  -> ExternalMidiInstrumentAdapter
  -> Web MIDI output
  -> virtual/physical MIDI port
  -> DAW / Kontakt / sfizz / external instrument
  -> high-quality guitar library
```

The external adapter supports:

- note on/off;
- last-note-priority mono-lead performances;
- legato ordering for hammer-on, pull-off and slide transitions;
- pitch wheel;
- MIDI RPN 0,0 Pitch Bend Sensitivity setup;
- CC1 vibrato;
- CC11 expression;
- CC64 sustain;
- channel pressure;
- polyphonic aftertouch;
- semantic articulation to keyswitch/CC mapping;
- panic / All Notes Off / All Sound Off.

## Legato behavior

LP3 emits a semantic transition with `retrigger=false` for a legato-style note change.

For an external backend, LP4 intentionally sends the new note-on before the previous note-off. This short overlap is the conventional trigger expected by many scripted legato instruments. The raw MIDI recorded by LP2 remains unchanged.

## K.G.Studio standard articulation map

The default adapter map is deliberately simple and backend-neutral:

| Semantic articulation | Default MIDI action |
| --- | --- |
| sustain | keyswitch note 24 |
| palm-mute | keyswitch note 25 |
| harmonic | keyswitch note 26 |

Third-party libraries can use different keyswitches. The adapter accepts a custom articulation map; a dedicated mapping editor belongs to the later instrument-management UI rather than the performance engine itself.

Hammer-on, pull-off and slide events are not assigned arbitrary vendor-specific keyswitches by default. They are represented through semantic events plus legato note ordering so compatible instruments can react naturally.

## sfizz / SFZ path

sfizz is suitable for the open/local instrument path because its core can be embedded as a C/C++ library and it also has an Emscripten/WebAssembly branch.

For the current web-only K.G.Studio repository, the reliable LP4 path is **sfizz VST3 (or another MIDI-capable sfizz host) behind External MIDI / DAW**. This works with SFZ libraries without coupling the K.G.Studio core to sfizz.

The official sfizz WebAudio demo is useful for prototyping but currently documents restrictions around browser virtual-file-system loading and external sample handling. K.G.Studio therefore does not make that demo/runtime a production dependency.

When the native desktop boundary arrives, the same `InstrumentPerformanceAdapter` contract can host sfizz in-process through its C/C++ API without changing LP2 recordings or LP3 guitar semantics.

References:

- https://github.com/sfztools/sfizz
- https://github.com/sfztools/sfizz-ui
- https://github.com/sfztools/sfizz-webaudio

## Windows same-machine setup

A same-PC DAW normally needs a virtual MIDI cable.

Typical topology:

```text
K.G.Studio MIDI OUT
  -> virtual MIDI port
  -> DAW MIDI input
  -> instrument track
  -> Kontakt / sfizz VST3 / guitar sampler
```

Inside K.G.Studio:

1. Enable MIDI.
2. Select a Guitar Lead performance profile.
3. Set **Backend** to **External MIDI / DAW**.
4. Select the virtual MIDI output.
5. Match the output channel to the DAW instrument channel.
6. Set the bend range expected by the target instrument.

K.G.Studio sends the pitch-bend-range RPN automatically when the adapter activates or its bend range changes.

## Backend capability discovery

The UI receives descriptors rather than assuming a renderer.

Current descriptors:

- `internal-sampler`: in-process, always available, basic pitch/expression/sustain, no true sampled legato.
- `external-midi`: ready when at least one MIDI output exists, supports expressive MIDI, articulations and legato note ordering.

Future adapters can be added without changing `GuitarPerformanceEngine`:

- native sfizz;
- Kontakt/native bridge;
- CLAP/VST3 host;
- hardware MIDI instrument.
