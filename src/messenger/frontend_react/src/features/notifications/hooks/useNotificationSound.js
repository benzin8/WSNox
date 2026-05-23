import { useEffect, useRef } from "react";
import { playTone } from "../audio/tones.js";

/**
 * Играет тон при изменении `trigger`. Не звучит на первом mount.
 */
export function useNotificationSound({ trigger, enabled, sample }) {
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!enabled || !trigger) return;
    playTone(sample);
  }, [trigger, enabled, sample]);
}
