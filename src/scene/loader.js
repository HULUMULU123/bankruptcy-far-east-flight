// Читает manifest + три бинарника и склеивает чанки в один буфер на секцию (M2: статика, без стриминга).
const SECTIONS = [
  ['terrain', 'terrain.bin', ['pts', 'con']],
  ['buildings', 'buildings.bin', ['pts', 'edges', 'fill']],
  ['lines', 'lines.bin', ['ln']],
];

export async function loadCity(onProgress = () => {}) {
  const manifest = await (await fetch(import.meta.env.BASE_URL + 'data/manifest.json')).json();
  const out = {};
  let done = 0;
  for (const [layer, file, secs] of SECTIONS) {
    const buf = new Float32Array(await (await fetch(import.meta.env.BASE_URL + 'data/' + file)).arrayBuffer());
    for (const sec of secs) {
      let total = 0;
      for (const c of Object.values(manifest[layer])) if (c[sec]) total += c[sec][1];
      const a = new Float32Array(total * 4);
      let o = 0;
      for (const c of Object.values(manifest[layer])) {
        if (!c[sec]) continue;
        const [off, n] = c[sec];
        a.set(buf.subarray(off / 4, off / 4 + n * 4), o * 4);
        o += n;
      }
      out[`${layer}.${sec}`] = a;
    }
    onProgress(++done / SECTIONS.length);
  }
  return out;
}
