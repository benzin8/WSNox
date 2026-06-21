import { Download, Loader2, File as FileIcon } from "lucide-react";

// Extension → badge colour, grouped by file kind. Anything unknown gets the
// brand lime. Tailwind needs the full class strings statically, so they're
// spelled out rather than built from a template.
const EXT_COLOR = {
  pdf: "bg-red-500",
  doc: "bg-blue-500", docx: "bg-blue-500", rtf: "bg-blue-500", odt: "bg-blue-500", pages: "bg-blue-500",
  txt: "bg-zinc-500", md: "bg-zinc-500",
  xls: "bg-emerald-500", xlsx: "bg-emerald-500", csv: "bg-emerald-500", ods: "bg-emerald-500",
  ppt: "bg-orange-500", pptx: "bg-orange-500", key: "bg-orange-500",
  zip: "bg-amber-500", rar: "bg-amber-500", "7z": "bg-amber-500", tar: "bg-amber-500", gz: "bg-amber-500",
  js: "bg-violet-500", ts: "bg-violet-500", jsx: "bg-violet-500", tsx: "bg-violet-500", json: "bg-violet-500",
  html: "bg-violet-500", css: "bg-violet-500", py: "bg-violet-500", go: "bg-violet-500", rs: "bg-violet-500",
  java: "bg-violet-500", c: "bg-violet-500", cpp: "bg-violet-500", sh: "bg-violet-500",
  mp3: "bg-pink-500", wav: "bg-pink-500", flac: "bg-pink-500", m4a: "bg-pink-500",
  apk: "bg-green-600", exe: "bg-sky-600", dmg: "bg-sky-600",
};

function extColor(ext) {
  return EXT_COLOR[ext] || "bg-lime-500";
}

function formatBytes(n) {
  if (typeof n !== "number" || n < 0) return "";
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

/**
 * A file attachment chip with a colourful extension badge, filename and size.
 * Renders transparently inside the message bubble (like VoiceMessage), so text
 * colours flip with `isOut`. Tap = open / download the file.
 */
export function FileCard({ filename, ext, sizeBytes, url, isUploading, progress, isOut }) {
  const label = (ext || "").toUpperCase().slice(0, 4);
  const nameCls = isOut ? "text-zinc-900" : "text-zinc-100";
  const subCls = isOut ? "text-zinc-800/70" : "text-zinc-400";

  const content = (
    <div className="flex items-center gap-3 min-w-[180px]">
      <div className={`shrink-0 w-11 h-11 rounded-lg grid place-items-center text-white ${extColor(ext)}`}>
        {isUploading
          ? <Loader2 size={18} className="animate-spin" />
          : label
            ? <span className="text-[11px] font-bold leading-none">{label}</span>
            : <FileIcon size={20} />}
      </div>
      <div className="min-w-0">
        <div className={`text-sm font-medium truncate ${nameCls}`}>{filename || "Файл"}</div>
        <div className={`text-xs flex items-center gap-1 ${subCls}`}>
          {isUploading
            ? <span>{typeof progress === "number" ? `${progress}%` : "загрузка…"}</span>
            : (
              <>
                {formatBytes(sizeBytes) && <span>{formatBytes(sizeBytes)}</span>}
                <span>·</span>
                <Download size={12} />
                <span>скачать</span>
              </>
            )}
        </div>
      </div>
    </div>
  );

  if (isUploading || !url) {
    return <div onClick={(e) => e.stopPropagation()}>{content}</div>;
  }
  return (
    <a
      href={url}
      download={filename}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="block hover:opacity-90 transition-opacity"
    >
      {content}
    </a>
  );
}
