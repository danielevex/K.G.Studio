import * as Tone from 'tone';
import type { SignalChainBlock } from '../performance/LivePerformanceTypes';

type AudioNodeLike = {
  connect: (destination: any) => any;
  disconnect: () => unknown;
  dispose: () => unknown;
};

interface AutomationBinding {
  set: (value: number | string | boolean, time?: number) => void;
}

interface BlockRuntime {
  nodes: AudioNodeLike[];
  automation: Record<string, AutomationBinding>;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function numberParam(
  block: SignalChainBlock,
  name: string,
  fallback: number,
): number {
  const value = block.parameters[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function dbFromNormalized(value: number, rangeDb: number = 12): number {
  return (clamp01(value) * 2 - 1) * rangeDb;
}

function timeLabelSeconds(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0.001, value);
  if (value === 'fast') return 0.01;
  if (value === 'medium') return 0.08;
  if (value === 'slow') return 0.25;
  return fallback;
}

function setSignal(signal: unknown, value: number, time?: number): void {
  const target = signal as {
    value?: number;
    setValueAtTime?: (next: number, at: number) => void;
    linearRampToValueAtTime?: (next: number, at: number) => void;
  };
  if (time !== undefined && typeof target.setValueAtTime === 'function') {
    target.setValueAtTime(value, time);
    return;
  }
  if ('value' in target) target.value = value;
}

function cloneBlock(block: SignalChainBlock): SignalChainBlock {
  return {
    ...block,
    parameters: { ...block.parameters },
  };
}

/**
 * LP5 internal Tone.js effect renderer.
 *
 * The domain signal-chain remains backend-neutral. This class is only the
 * in-process WebAudio implementation used by K.G.Studio's internal sampler.
 */
export class ToneEffectChain {
  public readonly input = new Tone.Gain(1);
  public readonly output = new Tone.Gain(1);

  private blocks: SignalChainBlock[] = [];
  private runtimes = new Map<string, BlockRuntime>();
  private runtimeNodes: AudioNodeLike[] = [];

  constructor() {
    this.input.connect(this.output);
  }

  public apply(blocks: SignalChainBlock[]): void {
    this.blocks = blocks.map(cloneBlock);
    this.rebuild();
  }

  public clear(): void {
    this.blocks = [];
    this.rebuild();
  }

  public getBlocks(): SignalChainBlock[] {
    return this.blocks.map(cloneBlock);
  }

  public setBlockEnabled(blockId: string, enabled: boolean): void {
    const block = this.blocks.find(candidate => candidate.id === blockId);
    if (!block) return;
    block.enabled = enabled;
    this.rebuild();
  }

  public setBlockParameter(
    blockId: string,
    parameterId: string,
    value: number | string | boolean,
  ): void {
    const block = this.blocks.find(candidate => candidate.id === blockId);
    if (!block) return;
    block.parameters[parameterId] = value;
    this.rebuild();
  }

  public automateBlockParameter(
    blockId: string,
    parameterId: string,
    value: number,
    time?: number,
  ): boolean {
    const binding = this.runtimes.get(blockId)?.automation[parameterId];
    if (!binding) return false;
    binding.set(value, time);

    const block = this.blocks.find(candidate => candidate.id === blockId);
    if (block && time === undefined) {
      block.parameters[parameterId] = value;
    }
    return true;
  }

  public dispose(): void {
    this.input.disconnect();
    this.disposeRuntime();
    this.output.disconnect();
    this.input.dispose();
    this.output.dispose();
  }

  private rebuild(): void {
    this.input.disconnect();
    this.disposeRuntime();

    let previous: AudioNodeLike = this.input;
    for (const block of this.blocks) {
      if (!block.enabled) continue;

      const runtime = this.createRuntime(block);
      if (runtime.nodes.length === 0) continue;

      this.runtimes.set(block.id, runtime);
      this.runtimeNodes.push(...runtime.nodes);

      for (const node of runtime.nodes) {
        previous.connect(node);
        previous = node;
      }
    }

    previous.connect(this.output);
  }

  private disposeRuntime(): void {
    for (const node of this.runtimeNodes) {
      try { node.disconnect(); } catch { /* no-op */ }
      try { node.dispose(); } catch { /* no-op */ }
    }
    this.runtimeNodes = [];
    this.runtimes.clear();
  }

  private createRuntime(block: SignalChainBlock): BlockRuntime {
    switch (block.type) {
      case 'compressor':
        return this.createCompressor(block);
      case 'boost':
        return this.createBoost(block);
      case 'overdrive':
      case 'fuzz':
      case 'distortion':
        return this.createDrive(block);
      case 'amp':
        return this.createAmp(block);
      case 'cabinet':
        return this.createCabinet(block);
      case 'eq':
        return this.createEq(block);
      case 'modulation':
        return this.createModulation(block);
      case 'delay':
        return this.createDelay(block);
      case 'reverb':
        return this.createReverb(block);
      case 'volume':
        return this.createVolume(block);
      default:
        return { nodes: [], automation: {} };
    }
  }

  private createCompressor(block: SignalChainBlock): BlockRuntime {
    const amount = clamp01(numberParam(block, 'amount', 0.5));
    const compressor = new Tone.Compressor({
      threshold: -12 - (amount * 24),
      ratio: 2 + (amount * 8),
      attack: timeLabelSeconds(block.parameters.attack, 0.08),
      release: timeLabelSeconds(block.parameters.release, 0.2),
    });

    return {
      nodes: [compressor],
      automation: {
        amount: {
          set: (value, time) => {
            const next = clamp01(Number(value));
            setSignal(compressor.threshold, -12 - (next * 24), time);
            setSignal(compressor.ratio, 2 + (next * 8), time);
          },
        },
      },
    };
  }

  private createBoost(block: SignalChainBlock): BlockRuntime {
    const driveAmount = clamp01(numberParam(block, 'drive', 0.2));
    const level = clamp01(numberParam(block, 'level', 0.7));
    const gain = new Tone.Gain(0.8 + (level * 1.7));
    const drive = new Tone.Distortion(driveAmount * 0.22);
    drive.wet.value = Math.min(0.5, 0.1 + driveAmount * 0.35);

    return {
      nodes: [gain, drive],
      automation: {
        level: { set: (value, time) => setSignal(gain.gain, 0.8 + clamp01(Number(value)) * 1.7, time) },
        drive: { set: (value) => { drive.distortion = clamp01(Number(value)) * 0.22; } },
      },
    };
  }

  private createDrive(block: SignalChainBlock): BlockRuntime {
    const raw = numberParam(
      block,
      block.type === 'fuzz' ? 'sustain' : 'drive',
      block.type === 'fuzz' ? 0.7 : 0.45,
    );
    const amount = clamp01(raw);
    const distortion = new Tone.Distortion(
      block.type === 'fuzz'
        ? 0.45 + (amount * 0.5)
        : 0.12 + (amount * 0.65),
    );
    distortion.wet.value = 0.92;

    const tone = new Tone.Filter(
      1800 + (clamp01(numberParam(block, 'tone', 0.55)) * 6500),
      'lowpass',
    );

    return {
      nodes: [distortion, tone],
      automation: {
        drive: { set: (value) => { distortion.distortion = 0.12 + clamp01(Number(value)) * 0.65; } },
        sustain: { set: (value) => { distortion.distortion = 0.45 + clamp01(Number(value)) * 0.5; } },
        tone: { set: (value, time) => setSignal(tone.frequency, 1800 + clamp01(Number(value)) * 6500, time) },
      },
    };
  }

  private createAmp(block: SignalChainBlock): BlockRuntime {
    const gainValue = clamp01(numberParam(block, 'gain', 0.45));
    const presence = clamp01(numberParam(block, 'presence', 0.55));
    const master = clamp01(numberParam(block, 'master', 0.8));

    const drive = new Tone.Distortion(0.06 + gainValue * 0.34);
    drive.wet.value = 0.82;
    const eq = new Tone.EQ3(-1.5, 0.5, dbFromNormalized(presence, 5));
    const output = new Tone.Gain(0.45 + master * 1.1);

    return {
      nodes: [drive, eq, output],
      automation: {
        gain: { set: (value) => { drive.distortion = 0.06 + clamp01(Number(value)) * 0.34; } },
        presence: { set: (value, time) => setSignal(eq.high, dbFromNormalized(Number(value), 5), time) },
        master: { set: (value, time) => setSignal(output.gain, 0.45 + clamp01(Number(value)) * 1.1, time) },
      },
    };
  }

  private createCabinet(block: SignalChainBlock): BlockRuntime {
    const micDistance = clamp01(numberParam(block, 'micDistance', 0.4));
    const room = clamp01(numberParam(block, 'room', 0.15));

    const highPass = new Tone.Filter(65 + micDistance * 55, 'highpass');
    const lowPass = new Tone.Filter(7200 - micDistance * 2300, 'lowpass');
    const cabinetEq = new Tone.EQ3(-1.5, 1.2, -2.5);
    const roomVerb = new Tone.Reverb(0.35 + room * 1.8);
    roomVerb.wet.value = room * 0.22;

    return {
      nodes: [highPass, lowPass, cabinetEq, roomVerb],
      automation: {
        micDistance: {
          set: (value, time) => {
            const next = clamp01(Number(value));
            setSignal(highPass.frequency, 65 + next * 55, time);
            setSignal(lowPass.frequency, 7200 - next * 2300, time);
          },
        },
        room: { set: (value, time) => setSignal(roomVerb.wet, clamp01(Number(value)) * 0.22, time) },
      },
    };
  }

  private createEq(block: SignalChainBlock): BlockRuntime {
    const low = numberParam(block, 'lowDb', 0);
    const mid = numberParam(block, 'midDb', 0);
    const high = numberParam(block, 'highDb', 0);
    const eq = new Tone.EQ3(low, mid, high);

    return {
      nodes: [eq],
      automation: {
        lowDb: { set: (value, time) => setSignal(eq.low, Number(value), time) },
        midDb: { set: (value, time) => setSignal(eq.mid, Number(value), time) },
        highDb: { set: (value, time) => setSignal(eq.high, Number(value), time) },
      },
    };
  }

  private createModulation(block: SignalChainBlock): BlockRuntime {
    const rate = clamp01(numberParam(block, 'rate', 0.3));
    const depth = clamp01(numberParam(block, 'depth', 0.25));
    const mix = clamp01(numberParam(block, 'mix', 0.15));
    const chorus = new Tone.Chorus({
      frequency: 0.12 + rate * 3.2,
      delayTime: 3.5,
      depth,
      wet: mix,
    }).start();

    return {
      nodes: [chorus],
      automation: {
        rate: { set: (value, time) => setSignal(chorus.frequency, 0.12 + clamp01(Number(value)) * 3.2, time) },
        depth: { set: (value) => { chorus.depth = clamp01(Number(value)); } },
        mix: { set: (value, time) => setSignal(chorus.wet, clamp01(Number(value)), time) },
      },
    };
  }

  private createDelay(block: SignalChainBlock): BlockRuntime {
    const timeMs = Math.max(1, numberParam(block, 'timeMs', 400));
    const feedback = clamp01(numberParam(block, 'feedback', 0.3));
    const mix = clamp01(numberParam(block, 'mix', 0.22));
    const delay = new Tone.FeedbackDelay(timeMs / 1000, feedback);
    delay.wet.value = mix;

    return {
      nodes: [delay],
      automation: {
        timeMs: { set: (value, time) => setSignal(delay.delayTime, Math.max(1, Number(value)) / 1000, time) },
        feedback: { set: (value, time) => setSignal(delay.feedback, clamp01(Number(value)), time) },
        mix: { set: (value, time) => setSignal(delay.wet, clamp01(Number(value)), time) },
      },
    };
  }

  private createReverb(block: SignalChainBlock): BlockRuntime {
    const decay = clamp01(numberParam(block, 'decay', 0.5));
    const mix = clamp01(numberParam(block, 'mix', 0.2));
    const reverb = new Tone.Reverb(0.8 + decay * 7.5);
    reverb.wet.value = mix;

    return {
      nodes: [reverb],
      automation: {
        decay: { set: (value) => { reverb.decay = 0.8 + clamp01(Number(value)) * 7.5; } },
        mix: { set: (value, time) => setSignal(reverb.wet, clamp01(Number(value)), time) },
      },
    };
  }

  private createVolume(block: SignalChainBlock): BlockRuntime {
    const level = clamp01(numberParam(block, 'level', 1));
    const gain = new Tone.Gain(level);
    return {
      nodes: [gain],
      automation: {
        level: { set: (value, time) => setSignal(gain.gain, clamp01(Number(value)), time) },
      },
    };
  }
}
