export const parseFileSize = (
  value: string | number,
  fallback = 10 * 1024 * 1024,
): number => {
  if (!value) return fallback;

  // If numeric, assume bytes
  if (typeof value === 'number') return value;

  const val = value.toLowerCase().trim();

  const regex = /^(\d+(?:\.\d+)?)(kb|mb|gb|b)$/i;
  const match = val.match(regex);

  if (!match) return fallback;

  const size = parseFloat(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'b':
      return size;
    case 'kb':
      return size * 1024;
    case 'mb':
      return size * 1024 * 1024;
    case 'gb':
      return size * 1024 * 1024 * 1024;
    default:
      return fallback;
  }
};
