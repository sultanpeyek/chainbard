/**
 * BrandLockup — the plume mark + "chainbard" wordmark, locked up and linking
 * home. `size="lg"` is header scale, `size="sm"` is footer scale. The mark
 * inherits amber via text-amber on the link so PlumeMark's currentColor reads.
 */
import Link from 'next/link';
import { PlumeMark } from './plume-mark';
import { Wordmark } from './wordmark';

export function BrandLockup({ size }: { size: 'sm' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <Link href="/" aria-label="chainbard — home" className="flex items-center gap-2.5 text-amber">
      <PlumeMark className={`rounded-[4px] ${lg ? 'h-7 w-7' : 'h-[22px] w-[22px]'}`} />
      <Wordmark className={lg ? 'text-xl' : 'text-lg'} />
    </Link>
  );
}
