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
export function AttachmentPicker({ onPick, disabled }) {
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";  // allow re-picking the same file
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    if (!isImage && !isVideo) {
      alert("Поддерживаются только фото и видео");
      return;
    }
    const max = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > max) {
      alert(`Файл больше ${isVideo ? "50" : "10"} МБ — нельзя`);
      return;
    }
    onPick(file);
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
        onChange={handleChange}
        className="hidden"
      />
    </>
  );
}
