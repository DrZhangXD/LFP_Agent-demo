import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ChannelData } from '../types';

interface RawTraceViewerProps {
  data: ChannelData[];
  width?: number | string;
  height?: number;
}

const RawTraceViewer: React.FC<RawTraceViewerProps> = ({ data, width = '100%', height = 400 }) => {
  // Transform data for Recharts: { time: 0, ch_0: 0.1, ch_1: 0.5 ... }
  // We offset channels vertically for the "stacked" look common in EEG/LFP
  const chartData = useMemo(() => {
    if (data.length === 0) return [];
    
    // Downsample for rendering performance (take every 10th point)
    const factor = 10; 
    const length = Math.floor(data[0].data.length / factor);
    const result = [];
    
    // Vertical offset per channel to stack them
    const offsetStep = 5; 

    for (let i = 0; i < length; i++) {
      const point: any = { time: i * factor }; // simplified time
      data.forEach((ch, idx) => {
        // Add offset to separate lines
        point[ch.id] = ch.data[i * factor] + (idx * offsetStep);
      });
      result.push(point);
    }
    return result;
  }, [data]);

  const colors = ['#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#fbbf24', '#f87171'];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 shadow-lg">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-200">Raw Signal Traces (Stacked)</h3>
        <div className="text-xs text-gray-500">
          Time Domain (Downsampled 10x)
        </div>
      </div>
      
      <div style={{ height: height, width: width }}>
        <ResponsiveContainer>
          <LineChart data={chartData}>
            <XAxis 
              dataKey="time" 
              type="number" 
              hide 
              domain={['auto', 'auto']}
            />
            {/* YAxis is arbitrary units due to stacking */}
            <YAxis hide domain={['auto', 'auto']} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#f3f4f6' }}
              labelStyle={{ color: '#9ca3af' }}
              itemStyle={{ fontSize: '12px' }}
              formatter={(value: number) => value.toFixed(2)}
            />
            {data.map((ch, idx) => (
              <React.Fragment key={ch.id}>
                 {/* Label for the channel on the left side - approximated by a reference line label in a real app, 
                     but here we just render the line. In a real app we'd use custom SVG overlaid. */}
                <Line
                  type="monotone"
                  dataKey={ch.id}
                  stroke={ch.isBad ? '#ef4444' : colors[idx % colors.length]}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </React.Fragment>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {data.map((ch, idx) => (
          <div key={ch.id} className="flex items-center text-xs text-gray-400">
            <span 
              className="w-3 h-3 rounded-full mr-1" 
              style={{ backgroundColor: ch.isBad ? '#ef4444' : colors[idx % colors.length] }}
            ></span>
            {ch.label} {ch.isBad && '(Bad)'}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RawTraceViewer;
