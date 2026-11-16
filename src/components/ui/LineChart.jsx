import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area } from 'recharts';

export function LineChartWidget({ 
  data, 
  labels, 
  color = 'var(--pri)',
  height = 170,
}) {
  // data: [{ value: 20, label: 'Mon' }, ...]
  // Convert to recharts format
  const chartData = data.map((d, i) => ({
    value: d.value,
    label: labels[i] || d.label,
    index: i,
  }));


  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 32, bottom: 30 }}>
          <defs>
            <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.1} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bd)" vertical={false} />
          <XAxis interval={0} 
            dataKey="label" 
            axisLine={false} 
            tickLine={false}
            tick={{ fill: 'var(--mu)', fontSize: 10 }}
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false}
            tick={{ fill: 'var(--mu)', fontSize: 9 }}
            tickCount={3}
            dx={-10}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div style={{
                    background: 'var(--ink)',
                    color: 'var(--sf)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '10px',
                    fontWeight: 700,
                    fontFamily: 'Manrope, sans-serif',
                  }}>
                    {payload[0].value} min
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorArea)"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={({ cx, cy, index }) => (
              <circle key={index} cx={cx} cy={cy} r={index === chartData.length - 1 ? 5 : 3}
                fill={index === chartData.length - 1 ? 'var(--sf)' : color} stroke={color} strokeWidth={2.5} />
            )}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
