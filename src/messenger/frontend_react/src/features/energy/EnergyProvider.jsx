import { useState, useCallback, useMemo } from 'react';
import { EnergyContext } from './EnergyContext';

const INITIAL = {
  x: 50,
  y: 50,
  size: 520,
  opacity: 0,
  blur: 130,
  duration: 600,
  phase: 'idle',
};

export function EnergyProvider({ children }) {
  const [orb, setOrb] = useState(INITIAL);

  const moveTo = useCallback((next) => {
    setOrb((prev) => ({ ...prev, ...next }));
  }, []);

  const beginTransit = useCallback(() => {
    setOrb({
      x: 50, y: 50,
      size: 1900,
      opacity: 0.22,
      blur: 200,
      duration: 950,
      phase: 'transit',
    });
  }, []);

  const settleInChat = useCallback(() => {
    setOrb({
      x: 72, y: 32,
      size: 620,
      opacity: 0.15,
      blur: 140,
      duration: 900,
      phase: 'chat-idle',
    });
  }, []);

  const randomInChat = useCallback(() => {
    setOrb((prev) => ({
      ...prev,
      x: 30 + Math.random() * 60,
      y: 18 + Math.random() * 64,
      size: 480 + Math.random() * 420,
      opacity: 0.13 + Math.random() * 0.10,
      blur: 130 + Math.random() * 40,
      duration: 1000,
      phase: 'chat-idle',
    }));
  }, []);

  const value = useMemo(
    () => ({ orb, moveTo, beginTransit, settleInChat, randomInChat }),
    [orb, moveTo, beginTransit, settleInChat, randomInChat],
  );

  return <EnergyContext.Provider value={value}>{children}</EnergyContext.Provider>;
}
