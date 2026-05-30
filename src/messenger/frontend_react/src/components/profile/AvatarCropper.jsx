import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { X, Check } from "lucide-react";
import { getCroppedBlob } from "./cropImage";

export function AvatarCropper({ src, onCancel, onConfirm }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onCropComplete = useCallback((_areaPercent, areaPixels) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    setBusy(true);
    setError("");
    try {
      const blob = await getCroppedBlob(src, croppedAreaPixels, 512, 0.92);
      onConfirm(blob);
    } catch (e) {
      setError("Не удалось обрезать изображение");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="relative w-[22rem] max-w-[95vw] bg-zinc-900 border border-zinc-800/80 rounded-2xl shadow-2xl p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-zinc-100">Обрезать фото</h3>
          <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-200">
            <X size={18} />
          </button>
        </div>
        <div className="relative w-full h-64 bg-zinc-950 rounded-xl overflow-hidden">
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="w-full accent-lime-400"
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-xl text-sm text-zinc-300 border border-zinc-700/60 hover:border-zinc-600"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !croppedAreaPixels}
            className="flex-1 flex items-center justify-center gap-2 bg-lime-400 text-zinc-900 text-sm font-semibold py-2 rounded-xl hover:bg-lime-300 active:scale-[0.97] transition-all duration-300 disabled:opacity-50"
          >
            <Check size={14} />
            {busy ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
