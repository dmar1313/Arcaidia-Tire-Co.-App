import React, { useState } from 'react';

export const COMPANY_LOGO_SRC = '/logo/wordmark.png';

export const COMPANY_ICON_SRC = '/logo/icon.png';

export const DEFAULT_SHOP_NAME = 'Arcadia Tire Co.';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'print';
  variant?: 'wordmark' | 'icon';
  className?: string;
}

// Wordmark is 958x443 (2.16:1) — boxes match that ratio so object-contain
// never crops the tread arch or the "TIRE CO." line. Icon is square.
const SIZE_CLASSES: Record<NonNullable<BrandLogoProps['size']>, string> = {
  sm: 'h-9 w-[78px]',
  md: 'h-14 w-[121px]',
  lg: 'h-[92px] w-[199px]',
  print: 'h-[46pt] w-[100pt]',
};

const ICON_SIZE_CLASSES: Record<NonNullable<BrandLogoProps['size']>, string> = {
  sm: 'h-9 w-9',
  md: 'h-14 w-14',
  lg: 'h-[92px] w-[92px]',
  print: 'h-[46pt] w-[46pt]',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  variant = 'wordmark',
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  const src = variant === 'icon' ? COMPANY_ICON_SRC : COMPANY_LOGO_SRC;
  const sizeClass =
    variant === 'icon' ? ICON_SIZE_CLASSES[size] : SIZE_CLASSES[size];

  if (imgFailed) {
    return (
      <div
        className={`bg-white flex items-center gap-1.5 px-1 select-none shrink-0 ${sizeClass} ${className}`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
          <path d="M12 3L3 20h4.5L12 11l4.5 9H21L12 3z" fill="#0F172A" />
          <path d="M12 13l-3 7h6l-3-7z" fill="#C81E2B" />
        </svg>
        <span className="font-bold tracking-tight text-slate-900 text-xs whitespace-nowrap">
          ARCADIA
        </span>
      </div>
    );
  }

  return (
    <div
      className={`bg-white overflow-hidden flex items-center justify-center shrink-0 ${sizeClass} ${className}`}
    >
      <img
        src={src}
        alt={DEFAULT_SHOP_NAME}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className="w-full h-full object-contain select-none"
      />
    </div>
  );
};
