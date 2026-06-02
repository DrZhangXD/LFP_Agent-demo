import { describe, it, expect } from 'vitest';
import { fft, computeRealPSD, computeBandPower, computeSpectrogram } from './dspService';

const FS = 1000;

const sine = (freq: number, n: number, sampleRate = FS, amp = 1): number[] =>
  Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / sampleRate));

const peakOf = (psd: { frequency: number; power: number }[]) =>
  psd.reduce((a, b) => (b.power > a.power ? b : a));

describe('fft', () => {
  it('gives a flat magnitude spectrum for a unit impulse', () => {
    const x = new Array(8).fill(0);
    x[0] = 1;
    const { real, imag } = fft(x);
    for (let k = 0; k < 8; k++) {
      expect(Math.hypot(real[k], imag[k])).toBeCloseTo(1, 6);
    }
  });
});

describe('computeRealPSD', () => {
  it('returns empty for too-short input', () => {
    expect(computeRealPSD([1, 2, 3], FS)).toEqual([]);
  });

  it('peaks at the frequency of a pure sine', () => {
    const psd = computeRealPSD(sine(40, 4096), FS);
    expect(psd.length).toBeGreaterThan(0);
    const peak = peakOf(psd);
    expect(peak.frequency).toBeGreaterThan(38);
    expect(peak.frequency).toBeLessThan(42);
  });

  it('resolves two separated tones', () => {
    const n = 4096;
    const a = sine(10, n);
    const b = sine(80, n);
    const sig = a.map((v, i) => v + b[i]);
    const psd = computeRealPSD(sig, FS);
    const powerNear = (f: number) =>
      psd.filter((p) => Math.abs(p.frequency - f) <= 2).reduce((s, p) => s + p.power, 0);
    expect(powerNear(10)).toBeGreaterThan(powerNear(45) * 10);
    expect(powerNear(80)).toBeGreaterThan(powerNear(45) * 10);
  });

  it('scales the frequency axis with the sample rate', () => {
    // The same bin index maps to a higher frequency at a higher sample rate.
    const peak500 = peakOf(computeRealPSD(sine(40, 4096, 500), 500));
    const peak2000 = peakOf(computeRealPSD(sine(40, 4096, 2000), 2000));
    expect(peak500.frequency).toBeGreaterThan(38);
    expect(peak500.frequency).toBeLessThan(42);
    expect(peak2000.frequency).toBeGreaterThan(38);
    expect(peak2000.frequency).toBeLessThan(42);
  });
});

describe('computeBandPower', () => {
  it('attributes the most power to the band containing the tone', () => {
    const bands = computeBandPower(computeRealPSD(sine(10, 4096), FS));
    const top = bands.reduce((a, b) => (b.power > a.power ? b : a));
    expect(top.band).toBe('ALPHA'); // 8–13 Hz
  });

  it('relative powers sum to ~1', () => {
    const bands = computeBandPower(computeRealPSD(sine(10, 4096), FS));
    const sum = bands.reduce((s, b) => s + b.relative, 0);
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe('computeSpectrogram', () => {
  it('tracks a frequency change over time', () => {
    const n = 4096;
    const data = Array.from({ length: n }, (_, i) => {
      const f = i < n / 2 ? 20 : 100;
      return Math.sin((2 * Math.PI * f * i) / FS);
    });
    const spec = computeSpectrogram(data, FS, { win: 256, hop: 128, fMax: 150 });
    expect(spec.times.length).toBeGreaterThan(2);

    const dominantFreq = (frame: number[]) => spec.freqs[frame.indexOf(Math.max(...frame))];
    const early = dominantFreq(spec.magnitudes[0]);
    const late = dominantFreq(spec.magnitudes[spec.magnitudes.length - 1]);

    expect(early).toBeGreaterThan(10);
    expect(early).toBeLessThan(30);
    expect(late).toBeGreaterThan(85);
    expect(late).toBeLessThan(115);
  });

  it('returns empty for too-short input', () => {
    const spec = computeSpectrogram([1, 2, 3], FS, { win: 256 });
    expect(spec.times).toEqual([]);
    expect(spec.magnitudes).toEqual([]);
  });
});
