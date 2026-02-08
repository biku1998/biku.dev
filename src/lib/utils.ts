export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .trim();
}

export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/** Words per minute for reading time (average adult). */
const READING_WPM = 200;

/**
 * Estimate reading time in minutes from markdown body.
 * Uses ~200 WPM; returns formatted string e.g. "3 min read".
 */
export function getReadingTime(markdownBody: string): string {
  const words = markdownBody.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.ceil(words / READING_WPM));
  return `${minutes} min read`;
}
