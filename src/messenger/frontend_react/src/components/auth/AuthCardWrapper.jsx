import { useEnergy } from '../../features/energy';

export function AuthCardWrapper({ children, className = '' }) {
  const { orb } = useEnergy();
  const exiting = orb.phase === 'transit';
  return (
    <div
      className={`relative w-full max-w-md ${className}`}
      style={{
        transition: 'opacity 600ms ease, transform 600ms ease, filter 600ms ease',
        opacity: exiting ? 0 : 1,
        transform: exiting ? 'scale(0.92)' : 'scale(1)',
        filter: exiting ? 'blur(8px)' : 'blur(0)',
      }}
    >
      {children}
    </div>
  );
}
