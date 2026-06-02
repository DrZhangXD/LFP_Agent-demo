import React, { useEffect, useMemo, useRef } from 'react';
import { computeSpectrogram } from '../services/dspService';

interface SpectrogramViewerProps {
  data: number[];
  sampleRate: number;
  width?: string;
  height?: number;
}

// Inferno-style perceptual colormap (dark -> purple -> orange -> pale yellow).
const COLOR_STOPS: [number, [number, number, number]][] = [
  [0.0, [0, 0, 4]],
  [0.25, [60, 15, 110]],
  [0.5, [160, 45, 90]],
  [0.75, [230, 110, 40]],
  [1.0, [250, 235, 160]],
];

const colormap = (t: number): [number, number, number] => {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const [t1, c1] = COLOR_STOPS[i];
    if (x <= t1) {
      const [t0, c0] = COLOR_STOPS[i - 1];
      const f = (x - t0) / (t1 - t0 || 1);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * f),
        Math.round(c0[1] + (c1[1] - c0[1]) * f),
        Math.round(c0[2] + (c1[2] - c0[2]) * f),
      ];
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1][1];
};

const SpectrogramViewer: React.FC<SpectrogramViewerProps> = ({ data, sampleRate, width = '100%', height = 300 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const spectrogram = useMemo(
    () => computeSpectrogram(data, sampleRate, { win: 256, hop: 64, fMax: 150 }),
    [data, sampleRate],
  );

  const hasData = spectrogram.times.length > 0 && spectrogram.freqs.length > 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);

    if (!hasData) return;

    const { times, freqs, magnitudes } = spectrogram;
    const numFrames = times.length;
    const numFreqs = freqs.length;
    const binW = w / numFrames;
    const binH = h / numFreqs;

    for (let t = 0; t < numFrames; t++) {
      const frame = magnitudes[t];
      for (let f = 0; f < numFreqs; f++) {
        const [r, g, b] = colormap(frame[f]);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        // Low frequency at the bottom: invert the y axis.
        ctx.fillRect(t * binW, h - (f + 1) * binH, Math.ceil(binW), Math.ceil(binH));
      }
    }
  }, [spectrogram, hasData]);

  const maxFreq = hasData ? spectrogram.freqs[spectrogram.freqs.length - 1] : 150;
  const duration = hasData ? spectrogram.times[spectrogram.times.length - 1] : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-lg flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold text-gray-200">Time-Frequency Spectrogram</h3>
        <span className="text-xs text-gray-500">0 – {Math.round(maxFreq)} Hz</span>
      </div>
      <div className="relative flex-1 w-full bg-black rounded overflow-hidden">
        <canvas
          ref={canvasRef}
          width={600}
          height={300}
          style={{ width, height }}
          className="w-full h-full object-fill"
        />
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
            No signal loaded for spectrogram.
          </div>
        )}
        <div className="absolute bottom-1 right-2 text-xs text-white bg-black/50 px-1 rounded">Time →</div>
        <div className="absolute top-1 left-1 text-xs text-white bg-black/50 px-1 rounded">Freq ↑</div>
      </div>
      <div className="mt-2 text-xs text-gray-400 flex justify-between">
        <span>0s</span>
        <span>STFT · Hann window (256), 75% overlap · log power (inferno)</span>
        <span>{duration.toFixed(1)}s</span>
      </div>
    </div>
  );
};

export default SpectrogramViewer;
