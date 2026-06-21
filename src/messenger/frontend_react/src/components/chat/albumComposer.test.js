// Plain node assertions — repo has no test runner. Run: node albumComposer.test.js
import assert from "node:assert";
import { removeAt, move } from "./albumComposer.js";

assert.deepEqual(removeAt(["a", "b", "c"], 1), ["a", "c"]);
assert.deepEqual(move(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
assert.deepEqual(move(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
assert.deepEqual(move(["a", "b", "c"], 1, 1), ["a", "b", "c"]);

console.log("albumComposer: all assertions passed");
