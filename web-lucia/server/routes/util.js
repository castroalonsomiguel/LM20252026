export function pick(source, fields) {
  const out = {};
  for (const f of fields) if (source && source[f] !== undefined) out[f] = source[f];
  return out;
}
