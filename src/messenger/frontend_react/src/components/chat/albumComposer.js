// Pure helpers for the album review tray.
export function removeAt(arr, i) {
  return arr.filter((_, idx) => idx !== i);
}

export function move(arr, from, to) {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}
