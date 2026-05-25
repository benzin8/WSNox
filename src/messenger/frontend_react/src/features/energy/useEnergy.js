import { useContext } from 'react';
import { EnergyContext } from './EnergyContext';

export function useEnergy() {
  const ctx = useContext(EnergyContext);
  if (!ctx) {
    throw new Error('useEnergy must be used inside <EnergyProvider />');
  }
  return ctx;
}
