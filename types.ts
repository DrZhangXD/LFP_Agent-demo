
export enum AnalysisStep {
  PREPROCESSING = 'Preprocessing',
  FEATURE_EXTRACTION = 'Feature Extraction',
  VISUALIZATION = 'Visualization'
}

export enum ReferenceMethod {
  MONOPOLAR = 'Monopolar',
  BIPOLAR = 'Bipolar',
  CAR = 'Common Average (CAR)',
  LAPLACIAN = 'Laplacian'
}

export interface ChannelData {
  id: string;
  label: string;
  data: number[]; // Time series voltage
  isBad: boolean;
  sampleRate?: number; // Hz; set when known (e.g. parsed from an EDF file)
}

export interface SignalConfig {
  sampleRate: number;
  notchFilter: 0 | 50 | 60; // 0 is disabled
  bandpass: [number, number];
  bandpassEnabled: boolean;
  reference: ReferenceMethod;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export interface PSDPoint {
  frequency: number;
  power: number;
}
