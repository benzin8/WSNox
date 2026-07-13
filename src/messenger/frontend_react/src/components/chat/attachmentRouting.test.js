// Plain node assertions — repo has no test runner. Run: node attachmentRouting.test.js
import assert from "node:assert";
import { routeFiles } from "./attachmentRouting.js";

const MB = 1024 * 1024;
const img = (size = MB) => ({ type: "image/jpeg", size });
const vid = (size = MB) => ({ type: "video/mp4", size });
const doc = (size = MB) => ({ type: "application/pdf", size });

function run(files, { album = true, file = true } = {}) {
  const calls = { pick: [], many: [], file: [], alerts: [] };
  routeFiles(
    files,
    {
      onPick: (f) => calls.pick.push(f),
      onPickMany: album ? (fs) => calls.many.push(fs) : undefined,
      onPickFile: file ? (f) => calls.file.push(f) : undefined,
    },
    (msg) => calls.alerts.push(msg),
  );
  return calls;
}

// Empty input → no-op
assert.deepEqual(run([]), { pick: [], many: [], file: [], alerts: [] });

// Single image → rich media path
let c = run([img()]);
assert.equal(c.pick.length, 1);
assert.equal(c.many.length + c.file.length + c.alerts.length, 0);

// Single video → rich media path
c = run([vid()]);
assert.equal(c.pick.length, 1);

// Single generic file → file path
c = run([doc()]);
assert.deepEqual([c.pick.length, c.file.length], [0, 1]);

// 2+ images → album
c = run([img(), img()]);
assert.equal(c.many.length, 1);
assert.equal(c.many[0].length, 2);

// Album capped at 10 images
c = run(Array.from({ length: 12 }, () => img()));
assert.equal(c.many[0].length, 10);

// Oversized photo in album is dropped with an alert; 1 valid left → single media
c = run([img(11 * MB), img()]);
assert.equal(c.alerts.length, 1);
assert.equal(c.pick.length, 1);
assert.equal(c.many.length, 0);

// Oversized photo (>10 MB) alone → rejected
c = run([img(11 * MB)]);
assert.deepEqual([c.pick.length, c.alerts.length], [0, 1]);

// Video up to 50 MB is fine, above — rejected
assert.equal(run([vid(49 * MB)]).pick.length, 1);
assert.equal(run([vid(51 * MB)]).alerts.length, 1);

// Generic file above 50 MB → rejected
c = run([doc(51 * MB)]);
assert.deepEqual([c.file.length, c.alerts.length], [0, 1]);

// Mixed drop (image + pdf) → routes by the first file, no album
c = run([img(), doc()]);
assert.deepEqual([c.pick.length, c.many.length], [1, 0]);

// No onPickFile handler → generic file falls back to media validation (legacy path)
c = run([doc()], { file: false });
assert.equal(c.pick.length, 1);

console.log("attachmentRouting: all assertions passed");
