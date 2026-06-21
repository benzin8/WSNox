import { useRef } from "react";
import { Paperclip } from "lucide-react";

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm";

/**
 * Hidden `<input type="file">` driven by a paperclip button.
 *
 * Validates client-side caps (10 MB photo / 50 MB video) so the user gets an
 * instant rejection instead of a multi-second upload that 413s. The server
 * re-validates everything — this is purely a UX nicety.
 */
export function AttachmentPicker({ onPick, onPickMany, disabled }) {
  const inputRef = useRef(null);

  const validate = (file) => {
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      alert("Поддерживаются только фото и видео");
      return false;
    }
    const max = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > max) {
      alert(`Файл больше ${isVideo ? "50" : "10"} МБ — нельзя`);
      return false;
    }
    return true;
  };

  const handleChange = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";  // allow re-picking the same file(s)
    if (!picked.length) return;

    // Album = 2+ images. Videos aren't album-able in v1, so a multi-pick of
    // images opens the album composer; anything else sends the first file singly.
    const images = picked.filter((f) => f.type.startsWith("image/"));
    if (images.length >= 2 && onPickMany) {
      const valid = images.filter(validate).slice(0, 10);
      if (valid.length >= 2) { onPickMany(valid); return; }
      if (valid.length === 1) { onPick(valid[0]); return; }
      return;
    }
    const file = picked[0];
    if (validate(file)) onPick(file);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        title="Прикрепить фото или видео"
        aria-label="Прикрепить фото или видео"
        className="shrink-0 w-9 h-9 grid place-items-center rounded-xl text-zinc-400 hover:text-lime-400 hover:bg-zinc-800/60 transition-colors disabled:opacity-40 disabled:hover:text-zinc-400 disabled:hover:bg-transparent"
      >
        <Paperclip size={18} />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={handleChange}
        className="hidden"
      />
    </>
  );
}
