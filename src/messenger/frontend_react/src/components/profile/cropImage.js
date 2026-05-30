// Crops a portion of an image source (data URL or http URL) to a square Blob.
// croppedAreaPixels: { x, y, width, height } as returned by react-easy-crop onCropComplete.

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

export async function getCroppedBlob(src, croppedAreaPixels, outputSize = 512, quality = 0.92) {
  const img = await loadImage(src);
  const canvas = document.createElement('canvas');
  const side = Math.min(croppedAreaPixels.width, croppedAreaPixels.height);
  const target = Math.min(side, outputSize);
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(
    img,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    side,
    side,
    0,
    0,
    target,
    target,
  );
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      quality,
    );
  });
}
