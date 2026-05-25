const POSITIONS = {
  top:    { x: 50,  y: -6,  size: 520, blur: 130 },
  bottom: { x: 50,  y: 106, size: 560, blur: 140 },
  left:   { x: -8,  y: 50,  size: 480, blur: 130 },
  right:  { x: 108, y: 50,  size: 480, blur: 130 },
  tl:     { x: 8,   y: 12,  size: 340, blur: 110 },
  br:     { x: 92,  y: 88,  size: 340, blur: 110 },
};

const STEP = {
  email: {
    scale: 1.0,
    weights: { top: 0.10, bottom: 0.08, left: 0.07, right: 0.13, tl: 0.05, br: 0.10 },
  },
  code: {
    scale: 1.6,
    weights: { top: 0.15, bottom: 0.13, left: 0.10, right: 0.10, tl: 0.12, br: 0.08 },
  },
  login: {
    scale: 1.8,
    weights: { top: 0.08, bottom: 0.18, left: 0.09, right: 0.14, tl: 0.06, br: 0.14 },
  },
  register: {
    scale: 2.4,
    weights: { top: 0.14, bottom: 0.14, left: 0.12, right: 0.12, tl: 0.13, br: 0.13 },
    extraCenter: { x: 50, y: 50, size: 820, op: 0.18, blur: 170 },
  },
};

function Orb({ x, y, size, op, blur }) {
  return (
    <div
      aria-hidden="true"
      className="absolute pointer-events-none rounded-full"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        background: `rgba(163,230,53, ${op})`,
        filter: `blur(${blur}px)`,
      }}
    />
  );
}

export function AuthBackdrop({ step = 'email' }) {
  const config = STEP[step] ?? STEP.email;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Object.entries(POSITIONS).map(([key, pos]) => (
        <Orb
          key={key}
          x={pos.x}
          y={pos.y}
          size={pos.size}
          blur={pos.blur}
          op={config.weights[key] * config.scale}
        />
      ))}
      {config.extraCenter && (
        <Orb
          x={config.extraCenter.x}
          y={config.extraCenter.y}
          size={config.extraCenter.size}
          blur={config.extraCenter.blur}
          op={config.extraCenter.op}
        />
      )}
    </div>
  );
}
