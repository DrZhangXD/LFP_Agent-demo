import { PSDPoint } from '../types';
import { FREQ_BANDS } from '../constants';

/**
 * Digital signal processing for spectral analysis of LFP/iEEG data.
 *
 * Provides a radix-2 FFT, a Welch power-spectral-density estimator, band-power
 * integration, and a short-time Fourier transform (spectrogram). All routines
 * are pure TypeScript so they run in the browser and under Node (for tests).
 */

// Simple recursive Radix-2 FFT. Requires the input length to be a power of two.
// Adequate for the segment sizes used here (≤ 1024). For very large transforms a
// WebAssembly FFT (e.g. fftw.js) would be faster, but this keeps the app dep-free.
export const fft = (data: number[]): { real: number[]; imag: number[] } => {
  const n = data.length;
  if (n <= 1) return { real: data.slice(), imag: new Array(n).fill(0) };

  const half = n / 2;
  const even = new Array(half);
  const odd = new Array(half);

  for (let i = 0; i < half; i++) {
    even[i] = data[2 * i];
    odd[i] = data[2 * i + 1];
  }

  const evenResult = fft(even);
  const oddResult = fft(odd);

  const real = new Array(n);
  const imag = new Array(n);

  for (let k = 0; k < half; k++) {
    const tReal = Math.cos((-2 * Math.PI * k) / n);
    const tImag = Math.sin((-2 * Math.PI * k) / n);

    const oddKReal = oddResult.real[k] * tReal - oddResult.imag[k] * tImag;
    const oddKImag = oddResult.real[k] * tImag + oddResult.imag[k] * tReal;

    real[k] = evenResult.real[k] + oddKReal;
    imag[k] = evenResult.imag[k] + oddKImag;

    real[k + half] = evenResult.real[k] - oddKReal;
    imag[k + half] = evenResult.imag[k] - oddKImag;
  }

  return { real, imag };
};

/** Largest power of two that is ≤ n. */
const pow2Floor = (n: number): number => (n < 1 ? 0 : Math.pow(2, Math.floor(Math.log2(n))));

/** Hann window of length N: w[n] = 0.5·(1 - cos(2πn/(N-1))). */
const hannWindow = (N: number): number[] => {
  const w = new Array<number>(N);
  for (let n = 0; n < N; n++) {
    w[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
  }
  return w;
};

const mean = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
};

/**
 * Welch's method power-spectral-density estimate.
 *
 * Splits the signal into 50%-overlapping segments, removes each segment's mean
 * (detrend), applies a Hann window, FFTs, forms a one-sided periodogram with
 * correct V²/Hz scaling, and averages the periodograms to reduce variance.
 *
 * @returns one-sided PSD up to `fMax` Hz (DC bin omitted).
 */
export const computeRealPSD = (
  data: number[],
  sampleRate: number,
  fMax = 150,
): PSDPoint[] => {
  const nfft = Math.min(1024, pow2Floor(data.length));
  if (nfft < 64 || sampleRate <= 0) return [];

  const hop = nfft / 2; // 50% overlap
  const window = hannWindow(nfft);
  const U = mean(window.map((w) => w * w)); // window power, for normalization

  const halfN = nfft / 2;
  const accum = new Array<number>(halfN + 1).fill(0);
  let segments = 0;

  for (let start = 0; start + nfft <= data.length; start += hop) {
    const segment = data.slice(start, start + nfft);
    const segMean = mean(segment);
    const windowed = segment.map((v, i) => (v - segMean) * window[i]);

    const { real, imag } = fft(windowed);
    for (let k = 0; k <= halfN; k++) {
      let power = (real[k] * real[k] + imag[k] * imag[k]) / (sampleRate * nfft * U);
      if (k !== 0 && k !== halfN) power *= 2; // one-sided: fold negative frequencies
      accum[k] += power;
    }
    segments++;
  }

  if (segments === 0) return [];

  const psd: PSDPoint[] = [];
  for (let k = 1; k <= halfN; k++) {
    const frequency = (k * sampleRate) / nfft;
    if (frequency > fMax) break;
    psd.push({ frequency, power: accum[k] / segments });
  }
  return psd;
};

export interface BandPower {
  band: string;
  range: [number, number];
  /** Integrated power within the band (same units as PSD × Hz). */
  power: number;
  /** Power relative to the summed band power, in [0, 1]. */
  relative: number;
}

/**
 * Integrate PSD power within each named frequency band (trapezoidal rule) and
 * express it relative to the total band power so it can drive 0–100% bars.
 */
export const computeBandPower = (
  psd: PSDPoint[],
  bands: Record<string, number[]> = FREQ_BANDS,
): BandPower[] => {
  const integrate = (lo: number, hi: number): number => {
    let sum = 0;
    for (let i = 1; i < psd.length; i++) {
      const a = psd[i - 1];
      const b = psd[i];
      if (b.frequency < lo || a.frequency > hi) continue;
      const df = b.frequency - a.frequency;
      sum += ((a.power + b.power) / 2) * df;
    }
    return sum;
  };

  const result: BandPower[] = Object.entries(bands).map(([band, [lo, hi]]) => ({
    band,
    range: [lo, hi] as [number, number],
    power: integrate(lo, hi),
    relative: 0,
  }));

  const total = result.reduce((acc, b) => acc + b.power, 0);
  if (total > 0) {
    for (const b of result) b.relative = b.power / total;
  }
  return result;
};

export interface Spectrogram {
  /** Centre time (seconds) of each STFT frame. */
  times: number[];
  /** Frequency (Hz) of each output bin. */
  freqs: number[];
  /** magnitudes[timeFrame][freqBin], normalized to [0, 1] (log power). */
  magnitudes: number[][];
}

/**
 * Short-time Fourier transform. Slides a Hann-windowed window across the signal
 * and returns normalized log-power for each (time, frequency) cell, suitable for
 * rendering a heat-map spectrogram.
 */
export const computeSpectrogram = (
  data: number[],
  sampleRate: number,
  opts: { win?: number; hop?: number; fMax?: number } = {},
): Spectrogram => {
  const win = pow2Floor(opts.win ?? 256);
  const hop = opts.hop ?? Math.max(1, Math.floor(win / 4));
  const fMax = opts.fMax ?? 150;

  if (data.length < win || win < 16 || sampleRate <= 0) {
    return { times: [], freqs: [], magnitudes: [] };
  }

  const window = hannWindow(win);
  const halfN = win / 2;
  const maxBin = Math.min(halfN, Math.floor((fMax * win) / sampleRate));

  const freqs: number[] = [];
  for (let k = 1; k <= maxBin; k++) freqs.push((k * sampleRate) / win);

  const times: number[] = [];
  const magnitudes: number[][] = [];
  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (let start = 0; start + win <= data.length; start += hop) {
    const segment = data.slice(start, start + win);
    const segMean = mean(segment);
    const windowed = segment.map((v, i) => (v - segMean) * window[i]);
    const { real, imag } = fft(windowed);

    const frame: number[] = [];
    for (let k = 1; k <= maxBin; k++) {
      const powerDb = 10 * Math.log10(real[k] * real[k] + imag[k] * imag[k] + 1e-12);
      frame.push(powerDb);
      if (powerDb < globalMin) globalMin = powerDb;
      if (powerDb > globalMax) globalMax = powerDb;
    }
    magnitudes.push(frame);
    times.push((start + win / 2) / sampleRate);
  }

  // Normalize log-power to [0, 1] for color mapping.
  const range = globalMax - globalMin || 1;
  for (const frame of magnitudes) {
    for (let i = 0; i < frame.length; i++) {
      frame[i] = (frame[i] - globalMin) / range;
    }
  }

  return { times, freqs, magnitudes };
};
