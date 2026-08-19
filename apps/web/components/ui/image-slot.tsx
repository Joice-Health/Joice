import Image from 'next/image';
import { cn } from '@joice/ui';
import { publicAssetExists } from '@/lib/assets';

/**
 * A photo, or the designed slot for one. Photography for the site is still
 * being shot; until a file lands at `public/<src>` the slot renders the organic
 * green field from the deck (dark, so white mono reads on it). Server-only.
 *
 * `hue` nudges the field so a list of slots does not read as one repeated tile.
 */
export function ImageSlot({
  src,
  alt,
  className,
  sizes = '100vw',
  priority = false,
  hue = 128,
  children,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  hue?: number;
  children?: React.ReactNode;
}) {
  const hasImage = publicAssetExists(src);
  return (
    <div className={cn('relative overflow-hidden bg-ink', className)}>
      {hasImage ? (
        <Image src={`/${src}`} alt={alt} fill priority={priority} sizes={sizes} className="object-cover" />
      ) : (
        <div
          aria-hidden
          className="organic-field absolute inset-0"
          style={{ '--h': hue } as React.CSSProperties}
        />
      )}
      {children}
    </div>
  );
}
