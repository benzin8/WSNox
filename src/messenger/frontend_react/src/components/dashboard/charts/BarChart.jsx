const LIME = '#a3e635';

export default function BarChart({ data, labels, color = LIME }) {
  const w = 920, h = 220, padT = 14, padB = 26, gap = 5;
  const ih = h - padT - padB;
  if (!data || data.length === 0) return <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%' }} />;
  const max = Math.max(...data) * 1.1 || 1;
  const bw = (w - gap * (data.length - 1)) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {data.map((v, i) => {
        const bh = (v / max) * ih;
        const x = i * (bw + gap);
        const y = padT + ih - bh;
        const isLast = i === data.length - 1;
        return (
          <rect key={i} x={x} y={y} width={bw} height={bh} rx="3"
            fill={isLast ? color : '#3f3f46'} opacity={isLast ? 1 : 0.85} />
        );
      })}
      {labels && labels.map((l, i) => ((i % 5 === 0 || i === labels.length - 1) ? (
        <text key={'x' + i} x={i * (bw + gap) + bw / 2} y={h - 6} fill="#52525b" fontSize="10" textAnchor="middle" fontFamily="ui-monospace,monospace">
          {l}
        </text>
      ) : null))}
    </svg>
  );
}
