import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MockChorus,
  MockCompressor,
  MockDistortion,
  MockFeedbackDelay,
  MockFilter,
  MockReverb,
} from '../../test/mocks/tone';

vi.mock('tone', async () => {
  const { ToneMock } = await import('../../test/mocks/tone');
  return ToneMock;
});

import { ToneEffectChain } from './ToneEffectChain';
import { getPerformancePreset } from '../performance/PerformancePresets';

describe('ToneEffectChain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the internal Gilmour-style signal chain from a preset', () => {
    const preset = getPerformancePreset('artist-inspired.gilmour.shine-lead');
    if (!preset) throw new Error('Missing Shine Lead preset');

    const chain = new ToneEffectChain();
    chain.apply(preset.signalChain);

    expect(chain.getBlocks()).toHaveLength(preset.signalChain.length);
    expect(MockCompressor).toHaveBeenCalled();
    expect(MockDistortion).toHaveBeenCalled();
    expect(MockFilter).toHaveBeenCalled();
    expect(MockChorus).toHaveBeenCalled();
    expect(MockFeedbackDelay).toHaveBeenCalled();
    expect(MockReverb).toHaveBeenCalled();

    chain.dispose();
  });

  it('supports block bypass and preserves editable state', () => {
    const preset = getPerformancePreset('artist-inspired.gilmour.comfort-lead');
    if (!preset) throw new Error('Missing Comfort Lead preset');

    const chain = new ToneEffectChain();
    chain.apply(preset.signalChain);
    chain.setBlockEnabled('fuzz', false);

    expect(chain.getBlocks().find(block => block.id === 'fuzz')?.enabled).toBe(false);

    chain.dispose();
  });

  it('updates persisted block parameters by rebuilding the runtime', () => {
    const preset = getPerformancePreset('artist-inspired.gilmour.time-lead');
    if (!preset) throw new Error('Missing Time Lead preset');

    const chain = new ToneEffectChain();
    chain.apply(preset.signalChain);
    chain.setBlockParameter('delay', 'mix', 0.41);

    expect(chain.getBlocks().find(block => block.id === 'delay')?.parameters.mix).toBe(0.41);

    chain.dispose();
  });

  it('provides time-addressable parameter automation for compatible Tone parameters', () => {
    const preset = getPerformancePreset('artist-inspired.gilmour.shine-lead');
    if (!preset) throw new Error('Missing Shine Lead preset');

    const chain = new ToneEffectChain();
    chain.apply(preset.signalChain);

    const delay = MockFeedbackDelay.mock.results[MockFeedbackDelay.mock.results.length - 1].value;
    const automated = chain.automateBlockParameter('delay', 'mix', 0.55, 12.5);

    expect(automated).toBe(true);
    expect(delay.wet.setValueAtTime).toHaveBeenCalledWith(0.55, 12.5);

    chain.dispose();
  });

  it('returns false when a requested automation target is unsupported', () => {
    const chain = new ToneEffectChain();
    expect(chain.automateBlockParameter('missing', 'mix', 0.5, 1)).toBe(false);
    chain.dispose();
  });
});
