export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  if (window.navigator?.standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export function isIosSafariNotStandalone() {
  return isIos() && !isStandalone();
}
