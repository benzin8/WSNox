import { useRef } from "react";
import { Paperclip } from "lucide-react";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Hidden `<input type="file">` driven by a paperclip button. Accepts ANY file.
 *
 * Routing: 2+ images → album composer; a single image/video → rich media path;
 * anything else → generic file attachment. Client-side caps give an instant
 * rejection instead of a multi-second upload that 413s; the server re-validates.
 */
export function AttachmentPicker({ onPick, onPickMany, onPickFile, disabled }) {
  const inputRef = useRef(null);

  // Photo/video caps (10 MB photo, 50 MB video). Returns false + alerts on fail.
  const validateMedia = (file) => {
    const isVideo = file.type.startsWith("video/");
    const max = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > max) {
      alert(`Файл больше ${isVideo ? "50" : "10"} МБ — нельзя`);
      return false;
    }
    return true;
  };

  // Generic file cap (50 MB, any type).
  const validateFile = (file) => {
    if (file.size > MAX_FILE_BYTES) {
      alert("Файл больше 50 МБ — нельзя");
      return false;
    }
    return true;
  };

  const handleChange = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";  // allow re-picking the same file(s)
    if (!picked.length) return;

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
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title="Прикрепить файл"
        aria-label="Прикрепить файл"
        className="shrink-0 w-9 h-9 grid place-items-center rounded-xl text-zinc-400 hover:text-lime-400 hover:bg-zinc-800/60 transition-colors disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:bg-transparent"
      >
        <Paperclip size={18} />
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleChange}
        className="hidden"
      />
    </>
  );
}
