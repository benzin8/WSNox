/**
 * Catmull-Rom → cubic Bézier path для гладких area/line графиков.
 * Порт из handoff_dashboard/dashboard.js без изменений.
 */
export function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function scalePoints(data, w, h, pad = 2) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  return data.map((v, i) => [
    (i / (data.length - 1 || 1)) * w,
    h - pad - ((v - min) / span) * (h - pad * 2),
  ]);
}

export function fmt(n) {
  return n.toLocaleString('ru-RU');
}

export function fmtK(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}
