import type { PerformancePreset } from "./LivePerformanceTypes";

/**
 * Backend-neutral starting presets for expressive Strat-style lead performance.
 *
 * These presets describe intent and routing. Concrete plugins/adapters translate
 * the logical blocks into backend-specific parameters.
 */
export const GILMOUR_INSPIRED_PRESETS: PerformancePreset[] = [
  {
    id: "artist-inspired.gilmour.shine-lead",
    name: "Shine Lead",
    version: 1,
    category: "Artist-Inspired / Gilmour-style",
    description:
      "Expressive neck-oriented Strat-style lead with compression, modulation, long delay and spacious reverb.",
    instrumentProfileId: "guitar.lead.expressive",
    mappings: [
      { id: "bend", source: "pitch-wheel", target: "guitar.bend", min: -2, max: 2 },
      { id: "vibrato", source: "mod-wheel", target: "guitar.vibrato", min: 0, max: 1 },
      { id: "expression", source: "expression", target: "guitar.expression", min: 0, max: 1 },
      { id: "sustain", source: "sustain-pedal", target: "guitar.sustain", min: 0, max: 1 }
    ],
    articulationIds: ["sustain", "legato", "slide"],
    signalChain: [
      {
        id: "compressor",
        type: "compressor",
        name: "Lead Compressor",
        enabled: true,
        parameters: { amount: 0.55, attack: "medium", release: "medium" }
      },
      {
        id: "boost",
        type: "boost",
        name: "Clean Boost",
        enabled: true,
        parameters: { drive: 0.25, level: 0.7 }
      },
      {
        id: "amp",
        type: "amp",
        name: "High-headroom British Clean Amp",
        enabled: true,
        parameters: { gain: 0.42, presence: 0.58, master: 0.78 }
      },
      {
        id: "cabinet",
        type: "cabinet",
        name: "British 4x12 Cabinet",
        enabled: true,
        parameters: { micDistance: 0.45, room: 0.2 }
      },
      {
        id: "modulation",
        type: "modulation",
        name: "Slow Modulation",
        enabled: true,
        parameters: { rate: 0.28, depth: 0.3, mix: 0.2 }
      },
      {
        id: "delay",
        type: "delay",
        name: "Long Lead Delay",
        enabled: true,
        parameters: { timeMs: 430, feedback: 0.33, mix: 0.28 }
      },
      {
        id: "reverb",
        type: "reverb",
        name: "Spacious Reverb",
        enabled: true,
        parameters: { decay: 0.65, mix: 0.22 }
      }
    ],
    backendRequirements: {
      preferredBackends: ["vst3", "external-daw", "sfz"],
      requiredCapabilities: ["pitch-bend", "articulations", "automation"]
    },
    metadata: {
      guitarCharacter: "strat-neck-oriented",
      presetFamily: "gilmour-inspired"
    }
  },
  {
    id: "artist-inspired.gilmour.comfort-lead",
    name: "Comfort Lead",
    version: 1,
    category: "Artist-Inspired / Gilmour-style",
    description:
      "Sustaining bridge-oriented Strat-style lead with compression, fuzz/drive, loud clean amp platform, delay and reverb.",
    instrumentProfileId: "guitar.lead.expressive",
    mappings: [
      { id: "bend", source: "pitch-wheel", target: "guitar.bend", min: -2, max: 2 },
      { id: "vibrato", source: "mod-wheel", target: "guitar.vibrato", min: 0, max: 1 },
      { id: "expression", source: "expression", target: "guitar.expression", min: 0, max: 1 },
      { id: "sustain", source: "sustain-pedal", target: "guitar.sustain", min: 0, max: 1 }
    ],
    articulationIds: ["sustain", "legato", "slide", "harmonic"],
    signalChain: [
      {
        id: "compressor",
        type: "compressor",
        name: "Lead Compressor",
        enabled: true,
        parameters: { amount: 0.5, attack: "medium", release: "slow" }
      },
      {
        id: "fuzz",
        type: "fuzz",
        name: "Singing Fuzz",
        enabled: true,
        parameters: { sustain: 0.72, tone: 0.5, level: 0.74 }
      },
      {
        id: "amp",
        type: "amp",
        name: "High-headroom British Amp",
        enabled: true,
        parameters: { gain: 0.5, presence: 0.62, master: 0.82 }
      },
      {
        id: "cabinet",
        type: "cabinet",
        name: "British 4x12 Cabinet",
        enabled: true,
        parameters: { micDistance: 0.38, room: 0.16 }
      },
      {
        id: "modulation",
        type: "modulation",
        name: "Subtle Lead Modulation",
        enabled: true,
        parameters: { rate: 0.32, depth: 0.2, mix: 0.14 }
      },
      {
        id: "delay",
        type: "delay",
        name: "Lead Delay",
        enabled: true,
        parameters: { timeMs: 390, feedback: 0.31, mix: 0.25 }
      },
      {
        id: "reverb",
        type: "reverb",
        name: "Plate / Hall Blend",
        enabled: true,
        parameters: { decay: 0.58, mix: 0.2 }
      }
    ],
    backendRequirements: {
      preferredBackends: ["vst3", "external-daw", "sfz"],
      requiredCapabilities: ["pitch-bend", "articulations", "automation"]
    },
    metadata: {
      guitarCharacter: "strat-bridge-oriented",
      presetFamily: "gilmour-inspired"
    }
  },
  {
    id: "artist-inspired.gilmour.time-lead",
    name: "Time Lead",
    version: 1,
    category: "Artist-Inspired / Gilmour-style",
    description:
      "Articulate Strat-style lead with focused drive, cabinet voicing, restrained modulation, rhythmic delay and roomy reverb.",
    instrumentProfileId: "guitar.lead.wide-bend",
    mappings: [
      { id: "bend", source: "pitch-wheel", target: "guitar.bend", min: -4, max: 4 },
      { id: "vibrato", source: "mod-wheel", target: "guitar.vibrato", min: 0, max: 1 },
      { id: "expression", source: "expression", target: "guitar.expression", min: 0, max: 1 },
      { id: "sustain", source: "sustain-pedal", target: "guitar.sustain", min: 0, max: 1 }
    ],
    articulationIds: ["sustain", "legato", "slide", "harmonic"],
    signalChain: [
      {
        id: "compressor",
        type: "compressor",
        name: "Lead Compressor",
        enabled: true,
        parameters: { amount: 0.44, attack: "fast", release: "medium" }
      },
      {
        id: "overdrive",
        type: "overdrive",
        name: "Focused Drive",
        enabled: true,
        parameters: { drive: 0.48, tone: 0.62, level: 0.72 }
      },
      {
        id: "amp",
        type: "amp",
        name: "British Lead Platform",
        enabled: true,
        parameters: { gain: 0.54, presence: 0.64, master: 0.8 }
      },
      {
        id: "cabinet",
        type: "cabinet",
        name: "Focused 4x12 Cabinet",
        enabled: true,
        parameters: { micDistance: 0.32, room: 0.12 }
      },
      {
        id: "modulation",
        type: "modulation",
        name: "Light Modulation",
        enabled: true,
        parameters: { rate: 0.25, depth: 0.16, mix: 0.1 }
      },
      {
        id: "delay",
        type: "delay",
        name: "Rhythmic Lead Delay",
        enabled: true,
        parameters: { timeMs: 360, feedback: 0.28, mix: 0.23 }
      },
      {
        id: "reverb",
        type: "reverb",
        name: "Roomy Plate",
        enabled: true,
        parameters: { decay: 0.5, mix: 0.17 }
      }
    ],
    backendRequirements: {
      preferredBackends: ["vst3", "external-daw", "sfz", "soundfont"],
      requiredCapabilities: ["pitch-bend", "automation"]
    },
    metadata: {
      guitarCharacter: "strat-articulate-lead",
      presetFamily: "gilmour-inspired"
    }
  }
];

export function getPerformancePreset(id: string): PerformancePreset | undefined {
  return GILMOUR_INSPIRED_PRESETS.find((preset) => preset.id === id);
}
