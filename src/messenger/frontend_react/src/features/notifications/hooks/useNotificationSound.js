import { useEffect } from "react";
import { playTone } from "../audio/tones.js";

/**
 * Играет тон при изменении `trigger`. `trigger = 0` на первом mount
 * — защита от холостого срабатывания.
 */
export function useNotificationSound({ trigger, enabled, sample }) {
  useEffect(() => {
    if (!trigger) return;
    if (!enabled) return;
    playTone(sample);
  }, [trigger, enabled, sample]);
}
