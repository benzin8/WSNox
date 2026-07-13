export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/**
 * Shared routing for attached AND dropped files — single source of truth for
 * the paperclip picker and chat drag&drop.
 *
 * Routing: 2+ images → album composer; a single image/video → rich media path;
 * anything else → generic file attachment. Client-side caps give an instant
 * rejection instead of a multi-second upload that 413s; the server re-validates.
 *
 * `notify` is injectable so the logic is testable outside a browser.
 */
export function routeFiles(picked, { onPick, onPickMany, onPickFile }, notify = (msg) => window.alert(msg)) {
  if (!picked.length) return;

  // Photo/video caps (10 MB photo, 50 MB video). Returns false + notifies on fail.
  const validateMedia = (file) => {
    const isVideo = file.type.startsWith("video/");
    const max = isVideo ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
    if (file.size > max) {
      notify(`Файл больше ${isVideo ? "50" : "10"} МБ — нельзя`);
      return false;
    }
    return true;
  };

  // Generic file cap (50 MB, any type).
  const validateFile = (file) => {
    if (file.size > MAX_FILE_BYTES) {
      notify("Файл больше 50 МБ — нельзя");
      return false;
    }
    return true;
  };

  // Album = 2+ images.
  const images = picked.filter((f) => f.type.startsWith("image/"));
  if (images.length >= 2 && onPickMany) {
    const valid = images.filter(validateMedia).slice(0, 10);
    if (valid.length >= 2) { onPickMany(valid); return; }
    if (valid.length === 1) { onPick(valid[0]); return; }
    return;
  }

  const file = picked[0];
  if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
    if (validateMedia(file)) onPick(file);          // rich media path
  } else if (onPickFile) {
    if (validateFile(file)) onPickFile(file);       // generic file path
  } else if (validateMedia(file)) {
    onPick(file);
  }
}
