import { ChannelData } from '../types';

export interface EDFResult {
  channels: ChannelData[];
  /** Sampling rate (Hz) derived from the file header. */
  sampleRate: number;
}

/** Read max records to keep browser memory/CPU bounded for large recordings. */
const MAX_RECORDS_LIMIT = 200;

/**
 * Parse a European Data Format (EDF) buffer into channel time series.
 *
 * Pure function (no DOM) so it can be unit-tested in Node. The byte-offset
 * arithmetic below follows the EDF spec: a 256-byte fixed header, then a
 * variable header with `ns` blocks of fields, then interleaved data records of
 * 16-bit little-endian samples that are scaled from digital to physical units.
 */
export const parseEDFBuffer = (buffer: ArrayBuffer): EDFResult => {
  const view = new DataView(buffer);

  // Helper to read ASCII strings from buffer
  const readString = (offset: number, len: number) =>
    new TextDecoder().decode(new Uint8Array(buffer, offset, len)).trim();

  // 1. Parse Fixed Header
  // 184-191: Bytes in header
  const headerBytes = parseInt(readString(184, 8), 10);
  // 236-243: Number of Data Records
  let numRecords = parseInt(readString(236, 8), 10);
  // 244-251: Duration of a Data Record (seconds)
  const recordDuration = parseFloat(readString(244, 8));
  // 252-255: Number of Signals (ns)
  const numSignals = parseInt(readString(252, 4), 10);

  if (!Number.isFinite(headerBytes) || !Number.isFinite(numSignals) || numSignals <= 0) {
    throw new Error('Invalid EDF header.');
  }

  if (numRecords === -1) {
    // Unknown record count; estimate from file size below.
    console.warn('Number of records is -1, reading until EOF');
    numRecords = 0;
  }

  // 2. Parse Variable Header (labels start at offset 256, 16 bytes each)
  const labels: string[] = [];
  for (let i = 0; i < numSignals; i++) {
    labels.push(readString(256 + i * 16, 16));
  }

  // Calibration fields: label(16) + transducer(80) + dimension(8) per signal
  const physMinOffset = 256 + numSignals * (16 + 80 + 8);
  const physMaxOffset = physMinOffset + numSignals * 8;
  const digMinOffset = physMaxOffset + numSignals * 8;
  const digMaxOffset = digMinOffset + numSignals * 8;
  const prefilterOffset = digMaxOffset + numSignals * 8;
  const samplesOffset = prefilterOffset + numSignals * 80;

  const physMins: number[] = [];
  const physMaxs: number[] = [];
  const digMins: number[] = [];
  const digMaxs: number[] = [];
  const samplesPerRecord: number[] = [];

  for (let i = 0; i < numSignals; i++) {
    physMins.push(parseFloat(readString(physMinOffset + i * 8, 8)));
    physMaxs.push(parseFloat(readString(physMaxOffset + i * 8, 8)));
    digMins.push(parseFloat(readString(digMinOffset + i * 8, 8)));
    digMaxs.push(parseFloat(readString(digMaxOffset + i * 8, 8)));
    samplesPerRecord.push(parseInt(readString(samplesOffset + i * 8, 8), 10));
  }

  // Pre-calculate Gain and Offset for the digital -> physical conversion.
  const gains: number[] = [];
  const offsets: number[] = [];
  for (let i = 0; i < numSignals; i++) {
    const physRange = physMaxs[i] - physMins[i];
    const digRange = digMaxs[i] - digMins[i];
    const gain = Number.isFinite(digRange) && digRange !== 0 ? physRange / digRange : 1;
    gains.push(Number.isFinite(gain) ? gain : 1);
    offsets.push(
      Number.isFinite(physMins[i]) && Number.isFinite(digMins[i]) ? physMins[i] - gain * digMins[i] : 0,
    );
  }

  // Sampling rate (Hz) = samples-per-record / record-duration. EDF stores rate
  // implicitly; the first signal is representative for homogeneous recordings.
  const rateFor = (idx: number) =>
    Number.isFinite(recordDuration) && recordDuration > 0 && samplesPerRecord[idx] > 0
      ? samplesPerRecord[idx] / recordDuration
      : 0;
  const fileSampleRate = rateFor(0);

  const channels: ChannelData[] = labels.map((label, idx) => ({
    id: `ch_${idx}`,
    label: label || `Ch${idx + 1}`,
    data: [],
    isBad: false,
    sampleRate: rateFor(idx) || fileSampleRate,
  }));

  // 3. Read Data Records
  let currentOffset = headerBytes;

  if (numRecords <= 0) {
    let bytesPerRecord = 0;
    for (let s = 0; s < numSignals; s++) bytesPerRecord += samplesPerRecord[s] * 2;
    if (bytesPerRecord <= 0) {
      throw new Error('Invalid EDF sample information.');
    }
    numRecords = Math.floor((buffer.byteLength - headerBytes) / bytesPerRecord);
  }

  const maxRecords = Math.min(numRecords, MAX_RECORDS_LIMIT);

  for (let r = 0; r < maxRecords; r++) {
    for (let s = 0; s < numSignals; s++) {
      const numSamples = samplesPerRecord[s];
      for (let k = 0; k < numSamples; k++) {
        if (currentOffset + 2 > buffer.byteLength) break;
        const intVal = view.getInt16(currentOffset, true); // Little Endian
        channels[s].data.push(intVal * gains[s] + offsets[s]);
        currentOffset += 2;
      }
    }
  }

  return { channels, sampleRate: fileSampleRate };
};

/** Read an EDF File (browser) and parse it into channel time series. */
export const parseEDF = async (file: File): Promise<EDFResult> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) throw new Error('Empty buffer');
        resolve(parseEDFBuffer(buffer));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
};
