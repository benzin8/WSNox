import { useEnergy } from './useEnergy';

const TRANSITION_EASING = 'cubic-bezier(.65,0,.35,1)';

export function EnergyOrb() {
  const { orb } = useEnergy();
  const transitDuration = orb.duration;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed rounded-full"
      style={{
        left: `${orb.x}%`,
        top: `${orb.y}%`,
        width: orb.size,
        height: orb.size,
        transform: 'translate(-50%, -50%)',
        background: `rgba(163,230,53, ${orb.opacity})`,
        filter: `blur(${orb.blur}px)`,
        transition: [
          `left ${transitDuration}ms ${TRANSITION_EASING}`,
          `top ${transitDuration}ms ${TRANSITION_EASING}`,
          `width ${transitDuration}ms ${TRANSITION_EASING}`,
          `height ${transitDuration}ms ${TRANSITION_EASING}`,
          `opacity ${transitDuration}ms ease`,
          `filter ${transitDuration}ms ease`,
        ].join(', '),
        willChange: 'left, top, width, height, opacity',
        zIndex: orb.phase === 'transit' ? 40 : 0,
      }}
    />
  );
}
