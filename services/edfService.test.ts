import { describe, it, expect } from 'vitest';
import { parseEDFBuffer } from './edfService';

/**
 * Build a minimal but spec-correct EDF file in memory.
 *
 * Layout: 256-byte fixed header + ns*256-byte variable header + interleaved
 * data records of Int16 little-endian samples. Two signals, two records,
 * 4 samples/record/signal, 1-second records -> 4 Hz.
 *
 * Signal 0: phys/dig = [-1000,1000]/[-1000,1000]  -> gain 1, offset 0   (physical == digital)
 * Signal 1: phys/dig = [-1000,3000]/[-1000,1000]  -> gain 2, offset 1000 (physical = 2*d + 1000)
 */
const buildEDF = (): ArrayBuffer => {
  const ns = 2;
  const headerBytes = 256 + ns * 256; // 768
  const samplesPerRecord = 4;
  const numRecords = 2;
  const bytesPerRecord = ns * samplesPerRecord * 2; // 16
  const total = headerBytes + numRecords * bytesPerRecord; // 800

  const buffer = new ArrayBuffer(total);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, str: string, len: number) => {
    const padded = str.padEnd(len, ' ').slice(0, len);
    for (let i = 0; i < len; i++) bytes[offset + i] = padded.charCodeAt(i);
  };

  // Fixed header
  writeAscii(0, '0', 8); // version
  writeAscii(184, String(headerBytes), 8); // bytes in header
  writeAscii(236, String(numRecords), 8); // number of data records
  writeAscii(244, '1', 8); // record duration (s)
  writeAscii(252, String(ns), 4); // number of signals

  // Variable header
  writeAscii(256, 'Fp1', 16);
  writeAscii(256 + 16, 'Fp2', 16);

  const physMinOffset = 256 + ns * (16 + 80 + 8); // 464
  const physMaxOffset = physMinOffset + ns * 8;
  const digMinOffset = physMaxOffset + ns * 8;
  const digMaxOffset = digMinOffset + ns * 8;
  const samplesOffset = digMaxOffset + ns * 8 + ns * 80; // after prefiltering block

  writeAscii(physMinOffset, '-1000', 8);
  writeAscii(physMinOffset + 8, '-1000', 8);
  writeAscii(physMaxOffset, '1000', 8);
  writeAscii(physMaxOffset + 8, '3000', 8);
  writeAscii(digMinOffset, '-1000', 8);
  writeAscii(digMinOffset + 8, '-1000', 8);
  writeAscii(digMaxOffset, '1000', 8);
  writeAscii(digMaxOffset + 8, '1000', 8);
  writeAscii(samplesOffset, String(samplesPerRecord), 8);
  writeAscii(samplesOffset + 8, String(samplesPerRecord), 8);

  // Data records (interleaved per record: signal0 samples, then signal1 samples)
  const sig0 = [
    [1, 2, 3, 4],
    [5, 6, 7, 8],
  ];
  const sig1 = [
    [10, 20, 30, 40],
    [50, 60, 70, 80],
  ];
  let offset = headerBytes;
  for (let r = 0; r < numRecords; r++) {
    for (const v of sig0[r]) {
      view.setInt16(offset, v, true);
      offset += 2;
    }
    for (const v of sig1[r]) {
      view.setInt16(offset, v, true);
      offset += 2;
    }
  }

  return buffer;
};

describe('parseEDFBuffer', () => {
  const result = parseEDFBuffer(buildEDF());

  it('reads channel count and labels', () => {
    expect(result.channels.length).toBe(2);
    expect(result.channels[0].label).toBe('Fp1');
    expect(result.channels[1].label).toBe('Fp2');
  });

  it('derives the sample rate from samples-per-record / duration', () => {
    expect(result.sampleRate).toBe(4);
    expect(result.channels[0].sampleRate).toBe(4);
  });

  it('concatenates records and applies gain=1/offset=0 scaling (signal 0)', () => {
    expect(result.channels[0].data).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('applies digital->physical scaling with gain=2/offset=1000 (signal 1)', () => {
    // physical = 2 * digital + 1000
    const expected = [10, 20, 30, 40, 50, 60, 70, 80].map((d) => 2 * d + 1000);
    result.channels[1].data.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6));
  });

  it('rejects a malformed header', () => {
    expect(() => parseEDFBuffer(new ArrayBuffer(16))).toThrow();
  });
});
