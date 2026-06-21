// Pick a collage layout from the photo count.
// 2-4 get bespoke shapes; 5-10 fall back to a tidy 3-per-row grid.
// Returns { kind, rows } where rows is an array of tiles-per-row.
export function pickAlbumLayout(n) {
  if (n <= 1) return { kind: "single", rows: [1] };
  if (n === 2) return { kind: "two", rows: [2] };
  if (n === 3) return { kind: "one-plus-two", rows: [1, 2] }; // 1 big col + 2 stacked
  if (n === 4) return { kind: "grid", rows: [2, 2] };
  // 5..10 → 3 per row, remainder on the last row
  const rows = [];
  let left = Math.min(n, 10);
  while (left > 0) {
    rows.push(Math.min(3, left));
    left -= 3;
  }
  return { kind: "grid", rows };
}
