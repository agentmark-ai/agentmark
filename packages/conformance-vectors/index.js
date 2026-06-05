// Minimal JS loader. The package ships JSON fixtures; this file gives
// Node/TS consumers a single import surface. Python consumers read the
// JSON files directly (see prompt-core-python/tests/test_conformance_vectors.py).

const path = require("node:path");
const fs = require("node:fs");

function loadVector(name) {
  const p = path.join(__dirname, "vectors", `${name}.json`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

module.exports = {
  loadVector,
  vectorsDir: path.join(__dirname, "vectors"),
};
