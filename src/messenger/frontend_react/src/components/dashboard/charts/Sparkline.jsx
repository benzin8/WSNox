import { useId } from 'react';
import { smoothPath, scalePoints } from './smoothPath';

const LIME = 'var(--color-lime-400)';

export default function Sparkline({ data, width = 240, height = 56, color = LIME }) {
  const gradId = useId().replace(/:/g, '');
  if (!data || data.length < 2) return <svg width={width} height={height} />;
  const pts = scalePoints(data, width, height, 4);
  const line = smoothPath(pts);
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ color, width: '100%', height, display: 'block' }}>
      <defs>
        <linearGradient id={`sg-${gradId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${gradId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="currentColor" />
    </svg>
  );
}
