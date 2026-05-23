import { slugify } from '../utils/slug.js';

export function imageLabel(index: number, alt: string): string {
  return alt && alt !== 'Image' ? alt : `图 ${index}`;
}

export function imageStem(index: number, alt: string): string {
  const seed = alt && alt !== 'Image' ? alt : 'image';
  return `${String(index).padStart(2, '0')}-${slugify(seed)}`;
}
