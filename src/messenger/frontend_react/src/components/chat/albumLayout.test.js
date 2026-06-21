// Plain node assertions — repo has no test runner. Run: node albumLayout.test.js
import assert from "node:assert";
import { pickAlbumLayout } from "./albumLayout.js";

// 2 → one row of two
assert.equal(pickAlbumLayout(2).rows.length, 1);
assert.equal(pickAlbumLayout(2).rows[0], 2);

// 3 → big + two stacked
assert.equal(pickAlbumLayout(3).kind, "one-plus-two");

// 4 → 2x2
assert.deepEqual(pickAlbumLayout(4).rows, [2, 2]);

// 6 → grid of 3 per row, two rows
assert.equal(pickAlbumLayout(6).kind, "grid");
assert.deepEqual(pickAlbumLayout(6).rows, [3, 3]);

// 10 → grid 3,3,3,1
assert.deepEqual(pickAlbumLayout(10).rows, [3, 3, 3, 1]);

console.log("albumLayout: all assertions passed");
