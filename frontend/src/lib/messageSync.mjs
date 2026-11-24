function stable(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).sort();
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().map((key) => [key, stable(value[key])]);
  }
  return value;
}

export function messageViewChanged(prev, next) {
  if (prev === next) return false;
  if (!prev || !next) return true;
  if (prev.message_id !== next.message_id) return true;
  if ((prev.file_url || '') !== (next.file_url || '')) return true;
  if (!!prev.deleted !== !!next.deleted) return true;
  if (JSON.stringify(stable(prev.reactions || {})) !== JSON.stringify(stable(next.reactions || {}))) {
    return true;
  }
  return JSON.stringify(stable(prev.read_by || [])) !== JSON.stringify(stable(next.read_by || []));
}
