import { useId } from 'react';
import { smoothPath, fmtK } from './smoothPath';

const LIME = 'var(--color-lime-400)';

export default function AreaChart({ data, labels, color = LIME }) {
  const gradId = useId().replace(/:/g, '');
  const w = 920, h = 260, padL = 8, padR = 8, padT = 16, padB = 28;
  const iw = w - padL - padR, ih = h - padT - padB;
  if (!data || data.length < 2) return <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%' }} />;
  const max = Math.max(...data) * 1.12 || 1;
  const pts = data.map((v, i) => [
    padL + (i / (data.length - 1)) * iw,
    padT + ih - (v / max) * ih,
  ]);
  const line = smoothPath(pts);
  const area = `${line} L ${pts[pts.length - 1][0]} ${padT + ih} L ${pts[0][0]} ${padT + ih} Z`;
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map(t => padT + ih - t * ih);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ color, width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id={`ag-${gradId}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.30" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {gridYs.map((y, i) => (
        <line key={i} x1={padL} y1={y} x2={w - padR} y2={y} stroke="#27272a" strokeWidth="1" />
      ))}
      <path d={area} fill={`url(#ag-${gradId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {gridYs.map((y, i) => {
        const t = [0, 0.25, 0.5, 0.75, 1][i];
        return (
          <text key={'t' + i} x={padL} y={y - 5} fill="#52525b" fontSize="10" fontFamily="ui-monospace,monospace">
            {fmtK(Math.round(max * t))}
          </text>
        );
      })}
      {labels && labels.map((l, i) => ((i % 5 === 0 || i === labels.length - 1) ? (
        <text key={'x' + i} x={pts[i][0]} y={h - 8} fill="#52525b" fontSize="10" textAnchor="middle" fontFamily="ui-monospace,monospace">
          {l}
        </text>
      ) : null))}
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill="currentColor" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="9" fill="currentColor" opacity="0.18" />
    </svg>
  );
}
