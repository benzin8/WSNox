import { useRef, useEffect, useCallback } from 'react';

/**
 * Edge-swipe hook for iOS-style back gesture.
 *
 * @param {Object} opts
 * @param {React.RefObject} opts.containerRef - element that receives touch events
 * @param {boolean} opts.enabled - only active when true (e.g. mobileView === 'chat')
 * @param {number} [opts.edgeZone=20] - px from left edge where gesture starts
 * @param {number} [opts.threshold=0.3] - fraction of width to trigger
 * @param {number} [opts.velocityThreshold=0.5] - px/ms to trigger
 * @param {(progress: number) => void} opts.onDrag - called with 0..1 during drag
 * @param {() => void} opts.onSwipeComplete - called when swipe triggers navigation
 * @param {() => void} opts.onSwipeCancel - called when swipe cancelled
 */
export function useEdgeSwipe({
  containerRef,
  enabled,
  edgeZone = 20,
  threshold = 0.3,
  velocityThreshold = 0.5,
  onDrag,
  onSwipeComplete,
  onSwipeCancel,
}) {
  const stateRef = useRef({
    tracking: false,
    startX: 0,
    startY: 0,
    startTime: 0,
    directionLocked: false,
    isHorizontal: false,
  });

  const handleTouchStart = useCallback(
    (e) => {
      if (!enabled) return;
      const touch = e.touches[0];
      if (touch.clientX > edgeZone) return;

      stateRef.current = {
        tracking: true,
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        directionLocked: false,
        isHorizontal: false,
      };
    },
    [enabled, edgeZone],
  );

  const handleTouchMove = useCallback(
    (e) => {
      const s = stateRef.current;
      if (!s.tracking) return;

      const touch = e.touches[0];
      const dx = touch.clientX - s.startX;
      const dy = touch.clientY - s.startY;

      // Lock direction after 10px movement
      if (!s.directionLocked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        s.directionLocked = true;
        s.isHorizontal = Math.abs(dx) > Math.abs(dy);
        if (!s.isHorizontal) {
          // Vertical scroll — abort
          s.tracking = false;
          return;
        }
      }

      if (!s.directionLocked || !s.isHorizontal) return;

      // Only allow right-swipe (positive dx)
      const progress = Math.max(0, Math.min(1, dx / (containerRef.current?.offsetWidth || 375)));
      onDrag(progress);

      // Prevent vertical scroll while swiping
      e.preventDefault();
    },
    [containerRef, onDrag],
  );

  const handleTouchEnd = useCallback(
    (e) => {
      const s = stateRef.current;
      if (!s.tracking || !s.directionLocked || !s.isHorizontal) {
        s.tracking = false;
        return;
      }

      const touch = e.changedTouches[0];
      const dx = touch.clientX - s.startX;
      const elapsed = Date.now() - s.startTime;
      const velocity = dx / elapsed; // px/ms
      const width = containerRef.current?.offsetWidth || 375;
      const fraction = dx / width;

      s.tracking = false;

      if (fraction > threshold || velocity > velocityThreshold) {
        onSwipeComplete();
      } else {
        onSwipeCancel();
      }
    },
    [containerRef, threshold, velocityThreshold, onSwipeComplete, onSwipeCancel],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Use passive: false for touchmove so we can preventDefault
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [containerRef, handleTouchStart, handleTouchMove, handleTouchEnd]);
}
