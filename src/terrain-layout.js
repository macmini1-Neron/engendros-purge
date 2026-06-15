// Pure chunk-grid planner for the terrain mesh. NO THREE import → node-testable.
// A map spans [-extent, +extent] on both X and Z (so its side is extent*2 metres).
// We tile it into square chunks of `chunkSize` metres; the final row/col is clamped
// to the map edge so chunks never overflow the playable bounds.
export function planChunks(extent, chunkSize) {
  if (!(extent > 0) || !(chunkSize > 0)) {
    throw new Error(`planChunks: extent and chunkSize must be > 0 (got ${extent}, ${chunkSize})`);
  }
  const span = extent * 2;
  const n = Math.ceil(span / chunkSize); // chunks per axis
  const chunks = [];
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const minX = -extent + ix * chunkSize;
      const minZ = -extent + iz * chunkSize;
      const maxX = Math.min(minX + chunkSize, extent);
      const maxZ = Math.min(minZ + chunkSize, extent);
      chunks.push({
        ix, iz,
        minX, minZ, maxX, maxZ,
        sizeX: maxX - minX,
        sizeZ: maxZ - minZ,
        centerX: (minX + maxX) / 2,
        centerZ: (minZ + maxZ) / 2,
      });
    }
  }
  return chunks;
}
