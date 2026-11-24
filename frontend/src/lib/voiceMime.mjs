export function preferredVoiceMime(isTypeSupported) {
  const supports = (type) => {
    try {
      return typeof isTypeSupported === 'function' && !!isTypeSupported(type);
    } catch (e) {
      return false;
    }
  };
  if (supports('audio/webm')) return 'audio/webm';
  if (supports('audio/mp4')) return 'audio/mp4';
  return '';
}
