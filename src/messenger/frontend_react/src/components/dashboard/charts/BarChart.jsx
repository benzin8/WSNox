import { useState } from 'react';

const LIME = '#a3e635';
const NEUTRAL = '#3f3f46';

export default function BarChart({ data, labels, color = LIME }) {
  const w = 920, h = 240, padT = 14, padB = 26, gap = 5;
  const ih = h - padT - padB;
  const [hovered, setHovered] = useState(null);

  if (!data || data.length === 0) return <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%' }} />;

  const max = Math.max(...data) * 1.1 || 1;
  const bw = (w - gap * (data.length - 1)) / data.length;

  // Tooltip layout for the hovered bar
  let tip = null;
  if (hovered !== null) {
    const i = hovered;
    const cx = i * (bw + gap) + bw / 2;
    const value = data[i];
    const label = labels?.[i] ?? '';
    const tipText = `${label} · ${value.toLocaleString('ru-RU')}`;
    const tipW = Math.max(80, tipText.length * 7);
    const tipH = 28;
    const tipY = padT + ih - (value / max) * ih - tipH - 8;
    let tipX = cx - tipW / 2;
    if (tipX < 4) tipX = 4;
    if (tipX + tipW > w - 4) tipX = w - 4 - tipW;
    tip = { x: tipX, y: tipY < 4 ? 4 : tipY, w: tipW, h: tipH, text: tipText, cx };
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {data.map((v, i) => {
        const bh = (v / max) * ih;
        const x = i * (bw + gap);
        const y = padT + ih - bh;
        const isLast = i === data.length - 1;
        const isHover = hovered === i;
        return (
          <g key={i}>
            <rect
              x={x} y={y} width={bw} height={bh} rx="3"
              fill={isHover || isLast ? color : NEUTRAL}
              opacity={isHover ? 1 : (isLast ? 1 : 0.85)}
              style={{ transition: 'fill .15s' }}
            />
            {/* Hit-box по всей высоте колонки — попасть курсором проще, чем по тонкому бару */}
            <rect
              x={x} y={padT} width={bw} height={ih}
              fill="transparent"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              style={{ cursor: 'pointer' }}
            />
          </g>
        );
      })}
      {labels && labels.map((l, i) => ((i % 5 === 0 || i === labels.length - 1) ? (
        <text key={'x' + i} x={i * (bw + gap) + bw / 2} y={h - 6} fill="#52525b" fontSize="10" textAnchor="middle" fontFamily="ui-monospace,monospace">
          {l}
        </text>
      ) : null))}
      {tip && (
        <g pointerEvents="none">
          <rect
            x={tip.x} y={tip.y} width={tip.w} height={tip.h} rx="6"
            fill="rgba(9,9,11,0.95)" stroke="rgba(163,230,53,0.4)" strokeWidth="1"
          />
          <text
            x={tip.x + tip.w / 2} y={tip.y + tip.h / 2 + 4}
            fill="#f4f4f5" fontSize="11" textAnchor="middle"
            fontFamily="ui-monospace,monospace"
          >
            {tip.text}
          </text>
          {/* connector dot */}
          <circle cx={tip.cx} cy={tip.y + tip.h} r="2.5" fill={color} />
        </g>
      )}
    </svg>
  );
}
