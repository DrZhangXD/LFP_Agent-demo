
import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PSDPoint } from '../types';

interface PSDViewerProps {
  data: PSDPoint[];
  notchFreq: 0 | 50 | 60;
}

// The PSD is computed from the already-filtered time series (see App.tsx
// processedData), so any enabled notch/band-pass is reflected directly in the
// data. The notchFreq prop is used only to label the status badge.
const PSDViewer: React.FC<PSDViewerProps> = ({ data, notchFreq }) => {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-lg h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-200">Power Spectral Density (PSD)</h3>
        <span className={`px-2 py-1 rounded text-xs font-mono ${notchFreq > 0 ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'}`}>
          Notch: {notchFreq > 0 ? `${notchFreq}Hz` : 'OFF'}
        </span>
      </div>

      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="frequency" 
              stroke="#9ca3af" 
              label={{ value: 'Frequency (Hz)', position: 'insideBottomRight', offset: -5, fill: '#6b7280' }} 
              tickFormatter={(val) => Math.round(val).toString()}
            />
            <YAxis 
              stroke="#9ca3af" 
              label={{ value: 'Power (µV²/Hz)', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6' }}
              itemStyle={{ color: '#8b5cf6' }}
              labelFormatter={(label) => `${Number(label).toFixed(1)} Hz`}
              formatter={(value: number) => [value.toFixed(2), 'Power']}
            />
            <Area 
              type="monotone" 
              dataKey="power" 
              stroke="#8b5cf6" 
              fillOpacity={1} 
              fill="url(#colorPower)" 
              isAnimationActive={true}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 text-xs text-gray-500">
         * Note: 1/f slope is typical in neural signals. Peaks indicate oscillatory bands (Alpha ~10Hz, Beta ~20Hz).
         {notchFreq > 0 && <span className="ml-2 text-green-500">Notch filter applied at {notchFreq}Hz.</span>}
      </div>
    </div>
  );
};

export default PSDViewer;
