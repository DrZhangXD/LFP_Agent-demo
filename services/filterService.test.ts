import { describe, it, expect } from 'vitest';
import {
  applyNotch,
  applyBandpass,
  applyCAR,
  applyLaplacian,
  biquad,
  filtfilt,
  BiquadCoeffs,
} from './filterService';
import { computeRealPSD } from './dspService';
import { ChannelData } from '../types';

const FS = 1000;
const N = 4096;

const sine = (freq: number, amp = 1): number[] =>
  Array.from({ length: N }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / FS));

const add = (...signals: number[][]): number[] =>
  signals[0].map((_, i) => signals.reduce((s, sig) => s + sig[i], 0));

// Total power within ±2 Hz of a target frequency, via the PSD.
const powerNear = (data: number[], f: number): number =>
  computeRealPSD(data, FS)
    .filter((p) => Math.abs(p.frequency - f) <= 2)
    .reduce((s, p) => s + p.power, 0);

const ch = (id: string, data: number[]): ChannelData => ({ id, label: id, data, isBad: false });

describe('applyNotch', () => {
  it('strongly attenuates the line frequency while preserving others', () => {
    const sig = add(sine(50), sine(10));
    const filtered = applyNotch(sig, FS, 50);
    expect(powerNear(filtered, 50) / powerNear(sig, 50)).toBeLessThan(0.05);
    expect(powerNear(filtered, 10) / powerNear(sig, 10)).toBeGreaterThan(0.9);
  });
});

describe('applyBandpass', () => {
  it('passes in-band content and rejects out-of-band content', () => {
    const sig = add(sine(2), sine(15), sine(120));
    const filtered = applyBandpass(sig, FS, 8, 30);
    expect(powerNear(filtered, 15) / powerNear(sig, 15)).toBeGreaterThan(0.5);
    expect(powerNear(filtered, 2) / powerNear(sig, 2)).toBeLessThan(0.25);
    expect(powerNear(filtered, 120) / powerNear(sig, 120)).toBeLessThan(0.1);
  });

  it('does not blow up when a corner is above Nyquist', () => {
    const filtered = applyBandpass(sine(10), 200, 1, 300); // high=300 > Nyquist(100)
    expect(filtered.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('filtfilt', () => {
  it('introduces zero net phase delay (unlike a single forward pass)', () => {
    // A simple stable low-pass biquad (DC gain 1, Nyquist gain 0).
    const lp: BiquadCoeffs = { b0: 0.2, b1: 0.4, b2: 0.2, a1: -0.3, a2: 0.1 };
    const x = sine(20);
    const zeroPhase = filtfilt(x, lp);

    const lagOfMaxXcorr = (a: number[], b: number[], maxLag: number): number => {
      const lo = Math.floor(a.length * 0.25);
      const hi = Math.floor(a.length * 0.75);
      let bestLag = 0;
      let best = -Infinity;
      for (let lag = -maxLag; lag <= maxLag; lag++) {
        let s = 0;
        for (let i = lo; i < hi; i++) s += a[i] * b[i + lag];
        if (s > best) {
          best = s;
          bestLag = lag;
        }
      }
      return bestLag;
    };

    expect(Math.abs(lagOfMaxXcorr(x, zeroPhase, 15))).toBeLessThanOrEqual(1);
    // sanity: filtfilt actually filtered (a single biquad differs from input)
    const single = biquad(x, lp);
    expect(single).not.toEqual(x);
  });
});

describe('applyCAR', () => {
  it('removes the component common to all channels', () => {
    const common = [10, 20, 30, 40];
    const d = [0, 1, 2, 3];
    const out = applyCAR([
      ch('a', common.map((v, i) => v + d[i])),
      ch('b', common.map((v, i) => v - d[i])),
    ]);
    out[0].data.forEach((v, i) => expect(v).toBeCloseTo(d[i], 9));
    out[1].data.forEach((v, i) => expect(v).toBeCloseTo(-d[i], 9));
  });
});

describe('applyLaplacian', () => {
  it('cancels a linear spatial gradient on interior channels', () => {
    const channels = [1, 2, 3, 4].map((base, idx) => ch(`c${idx}`, [base, base]));
    const out = applyLaplacian(channels);
    out[1].data.forEach((v) => expect(v).toBeCloseTo(0, 9));
    out[2].data.forEach((v) => expect(v).toBeCloseTo(0, 9));
  });
});
