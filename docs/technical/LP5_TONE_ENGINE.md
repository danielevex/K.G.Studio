# LP5 Tone Engine

## Status

LP5 adds the first editable, persistent tone-processing layer for live virtual instruments.

The signal-chain model remains backend-neutral. K.G.Studio's current internal renderer translates the logical blocks to Tone.js/WebAudio nodes, while an external MIDI backend keeps the same preset and edits as a portable recipe for the external host.

## Internal signal flow

```text
Sampler / LP3 live source
  -> ToneEffectChain input
  -> compressor
  -> boost / overdrive / fuzz / distortion
  -> amp voicing
  -> cabinet voicing
  -> EQ
  -> modulation
  -> delay
  -> reverb
  -> volume
  -> track panner
  -> master
```

The chain is shared by normal MIDI playback and low-latency live monitoring. There is no separate "live-only" effects path.

## Supported logical blocks

- compressor;
- boost;
- overdrive;
- fuzz;
- distortion;
- amp;
- cabinet;
- EQ;
- modulation;
- delay;
- reverb;
- volume.

The internal Tone.js renderer intentionally treats **amp** and **cabinet** as lightweight WebAudio voicing stages, not as claims of physical amp/cabinet emulation or convolution IR accuracy. Native/plugin amp and IR implementations belong to LP6 and later backend adapters.

## Presets

LP5 ships the editable Artist-Inspired / Gilmour-style family:

- **Shine Lead** — compression, clean boost, high-headroom amp voicing, cabinet, slow modulation, long delay and spacious reverb.
- **Comfort Lead** — compression, sustaining fuzz, loud clean amp platform, cabinet, subtle modulation, lead delay and reverb.
- **Time Lead** — compression, focused overdrive, articulate amp/cabinet voicing, light modulation, rhythmic delay and roomy plate-style reverb.

These are editable starting points, not exact recreations of a named artist's hardware chain.

## Editing and bypass

Every block has an independent enabled/bypassed state.

Numeric parameters can be edited from the Live MIDI panel. The edited signal chain is stored on the MIDI track, so saving/reopening the project preserves the chosen preset and its customized values.

Project structure **V19** introduces:

- `tonePresetId`;
- `toneSignalChain`;

on each `KGMidiTrack`.

Legacy projects migrate to a safe `Tone Engine Off` state.

## Parameter automation API

The internal renderer exposes time-addressable automation for parameters that map to WebAudio/Tone parameters, including examples such as:

- compressor amount;
- boost level;
- amp presence/master;
- cabinet mic-distance voicing and room mix;
- EQ bands;
- modulation rate/mix;
- delay time/feedback/mix;
- reverb mix;
- volume level.

The API is:

```text
automateTrackToneBlockParameter(trackId, blockId, parameterId, value, time)
```

This is the backend automation primitive. A dedicated graphical automation lane/editor for effect parameters can be layered on top later without changing the Tone Engine contract.

## External backend behavior

When **External MIDI / DAW** is selected, audio is generated outside K.G.Studio. Without an audio-return path, K.G.Studio cannot physically insert its WebAudio effects into that external signal.

Therefore LP5 does the correct non-destructive thing:

- the tone preset and edits remain stored on the K.G.Studio track;
- the UI labels the chain as **External Host Recipe**;
- LP3/LP4 MIDI performance still drives the external instrument;
- matching plugins/effects must currently be instantiated in the external DAW;
- LP6 native plugin hosting can translate the same logical blocks to VST3/native effects.

This avoids pretending to process audio that never enters K.G.Studio.

## Persistence and duplication

Tone state survives:

- project save/load;
- V19 migration;
- track duplication;
- instrument changes on the same MIDI track.

The signal-chain data remains plain backend-neutral project data rather than serialized Tone.js objects.
