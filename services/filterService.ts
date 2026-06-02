import { ChannelData } from '../types';

/**
 * Digital signal filtering and spatial re-referencing for LFP/iEEG time series.
 *
 * Filters are second-order IIR biquads using the RBJ "Audio EQ Cookbook"
 * coefficient formulas, applied with zero-phase forward-backward filtering
 * (filtfilt). Zero-phase filtering matters for neural data: it keeps sharp
 * transients (e.g. epileptiform spikes) aligned in time instead of shifting
 * them by the filter's group delay.
 */

/** Biquad coefficients, already normalized so that a0 = 1. */
export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

const TWO_PI = 2 * Math.PI;
/** Butterworth Q for a single (maximally flat) high/low-pass stage. */
const BUTTERWORTH_Q = Math.SQRT1_2; // 1/sqrt(2) ≈ 0.707

const notchCoeffs = (fs: number, freq: number, Q: number): BiquadCoeffs => {
  const w0 = (TWO_PI * freq) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Q);
  const a0 = 1 + alpha;
  return {
    b0: 1 / a0,
    b1: (-2 * cos) / a0,
    b2: 1 / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
};

const highpassCoeffs = (fs: number, freq: number, Q: number): BiquadCoeffs => {
  const w0 = (TWO_PI * freq) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 + cos) / 2) / a0,
    b1: (-(1 + cos)) / a0,
    b2: ((1 + cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
};

const lowpassCoeffs = (fs: number, freq: number, Q: number): BiquadCoeffs => {
  const w0 = (TWO_PI * freq) / fs;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 - cos) / 2) / a0,
    b1: (1 - cos) / a0,
    b2: ((1 - cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
};

/** Single forward pass of a Direct Form I biquad. */
export const biquad = (data: number[], c: BiquadCoeffs): number[] => {
  const out = new Array<number>(data.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let n = 0; n < data.length; n++) {
    const x0 = data[n];
    const y0 = c.b0 * x0 + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    out[n] = y0;
  }
  return out;
};

/**
 * Zero-phase filtering: filter forward, reverse, filter again, reverse back.
 * This cancels phase distortion and doubles (squares) the magnitude response.
 */
export const filtfilt = (data: number[], c: BiquadCoeffs): number[] => {
  if (data.length < 3) return data.slice();
  const forward = biquad(data, c);
  forward.reverse();
  const backward = biquad(forward, c);
  backward.reverse();
  return backward;
};

/**
 * Notch (band-stop) filter to remove power-line noise (50 or 60 Hz).
 * Q≈30 gives a narrow notch (~1.7 Hz wide at 50 Hz) so neighbouring
 * physiological frequencies are preserved.
 */
export const applyNotch = (
  data: number[],
  fs: number,
  freq: 50 | 60,
  Q = 30,
): number[] => {
  if (freq <= 0 || freq >= fs / 2) return data.slice();
  return filtfilt(data, notchCoeffs(fs, freq, Q));
};

/**
 * Band-pass filter built by cascading a Butterworth high-pass at `low`
 * and a low-pass at `high`. Corners at or above Nyquist are skipped/clamped
 * so the filter never goes unstable (important for low-Fs EDF recordings).
 */
export const applyBandpass = (
  data: number[],
  fs: number,
  low: number,
  high: number,
): number[] => {
  const nyquist = fs / 2;
  let out = data.slice();
  if (low > 0 && low < nyquist) {
    out = filtfilt(out, highpassCoeffs(fs, low, BUTTERWORTH_Q));
  }
  const clampedHigh = Math.min(high, nyquist * 0.99);
  if (clampedHigh > 0 && clampedHigh < nyquist && clampedHigh > low) {
    out = filtfilt(out, lowpassCoeffs(fs, clampedHigh, BUTTERWORTH_Q));
  }
  return out;
};

const cloneChannel = (ch: ChannelData, data: number[]): ChannelData => ({
  ...ch,
  data,
});

/**
 * Common Average Reference: subtract, at each time sample, the mean across
 * all good channels. Removes signal common to the whole electrode array
 * (e.g. shared reference drift, broadband noise).
 */
export const applyCAR = (channels: ChannelData[]): ChannelData[] => {
  if (channels.length === 0) return [];
  const length = Math.min(...channels.map((c) => c.data.length));
  const good = channels.filter((c) => !c.isBad);
  const refSet = good.length > 0 ? good : channels;

  const mean = new Array<number>(length);
  for (let t = 0; t < length; t++) {
    let sum = 0;
    for (const c of refSet) sum += c.data[t] ?? 0;
    mean[t] = sum / refSet.length;
  }

  return channels.map((ch) =>
    cloneChannel(
      ch,
      ch.data.slice(0, length).map((v, t) => v - mean[t]),
    ),
  );
};

/**
 * Nearest-neighbour Laplacian (1-D electrode-strip approximation): subtract
 * the mean of the adjacent channels. We have no electrode geometry, so this
 * treats the channel list as an ordered strip. Endpoints use their single
 * available neighbour.
 */
export const applyLaplacian = (channels: ChannelData[]): ChannelData[] => {
  if (channels.length < 2) return channels.map((ch) => cloneChannel(ch, ch.data.slice()));
  const length = Math.min(...channels.map((c) => c.data.length));

  return channels.map((ch, idx) => {
    const neighbors: ChannelData[] = [];
    if (idx > 0) neighbors.push(channels[idx - 1]);
    if (idx < channels.length - 1) neighbors.push(channels[idx + 1]);
    const data = ch.data.slice(0, length).map((v, t) => {
      let sum = 0;
      for (const nb of neighbors) sum += nb.data[t] ?? 0;
      return v - sum / neighbors.length;
    });
    return cloneChannel(ch, data);
  });
};
