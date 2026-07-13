import { useRef } from "react";
import { Paperclip } from "lucide-react";
import { routeFiles } from "./attachmentRouting";

/**
 * Hidden `<input type="file">` driven by a paperclip button. Accepts ANY file.
 * Validation and routing (album / rich media / generic file) live in
 * attachmentRouting.js — shared with chat drag&drop.
 */
export function AttachmentPicker({ onPick, onPickMany, onPickFile, disabled }) {
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";  // allow re-picking the same file(s)
    routeFiles(picked, { onPick, onPickMany, onPickFile });
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
