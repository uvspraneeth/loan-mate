import { cn } from '@/lib/utils';

// LoanMate brand mark: a green money bag with a % (lending with interest).
// Same artwork as public/logo.svg.
export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 512 512" className={cn('h-8 w-8 shrink-0', className)} aria-hidden="true">
      <g fill="#059669" stroke="#059669" strokeWidth="8" strokeLinejoin="round">
        <path d="M166 30C196 34 222 26 238 12C248 4 264 4 274 12C290 26 316 34 346 30L324 90H188Z" />
        <rect x="161" y="116" width="190" height="28" rx="14" />
        <path d="M198 172H314C384 172 460 292 460 392C460 448 432 482 378 482H134C80 482 52 448 52 392C52 292 128 172 198 172Z" />
      </g>
      <g fill="none" stroke="#FFFFFF" strokeWidth="26" strokeLinecap="round">
        <ellipse cx="207" cy="302" rx="22" ry="27" />
        <ellipse cx="310" cy="357" rx="22" ry="27" />
        <path d="M297 272L215 390" />
      </g>
    </svg>
  );
}

export default function Logo({ className, markClassName, tagline = false }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <LogoMark className={markClassName} />
      <div>
        <p className="font-display font-bold text-slate-900 leading-none">LoanMate</p>
        {tagline && <p className="text-[10px] text-slate-400 mt-0.5">Simple lending. Clear payments.</p>}
      </div>
    </div>
  );
}
