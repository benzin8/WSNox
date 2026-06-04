import { useEffect } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";

export function ProfileShell({ onClose, children, variant = "view" }) {
  const isMobile = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      >
        <div
          className="relative w-full max-h-[92vh] overflow-hidden bg-zinc-900/95 border-t border-zinc-800/80 shadow-2xl animate-sheetUp flex flex-col"
          style={{
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
          }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          {/* Grabber */}
          <div className="flex justify-center pt-2 pb-1 shrink-0">
            <span className="block h-1 w-10 rounded-full bg-zinc-700/70" />
          </div>
          <div className={`flex-1 min-h-0 ${variant === "view" ? "overflow-y-auto" : "flex flex-col overflow-hidden"}`}>
            {children}
          </div>
        </div>
      </div>
    );
  }

  // Desktop: centered modal
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="relative w-[22rem] max-w-[95vw] max-h-[90vh] overflow-hidden bg-zinc-900/95 border border-zinc-800/80 rounded-[28px] shadow-2xl animate-popIn flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={`flex-1 min-h-0 ${variant === "view" ? "overflow-y-auto" : "flex flex-col overflow-hidden"}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
