import React, { useState } from 'react';

export const COMPANY_LOGO_SRC =
  '/assets/aistudio/Arcadia_logo_with_red_A_triangle_and_tire_i-dot_aa9ee0e8.webp';

export const DEFAULT_SHOP_NAME = 'Arcadia Tire Co.';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'print';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<BrandLogoProps['size']>, string> = {
  sm: 'h-9 w-[74px]',
  md: 'h-14 w-[116px]',
  lg: 'h-[92px] w-[192px]',
  print: 'h-[46pt] w-[96pt]',
};

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 'md', className = '' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  if (imgFailed) {
    return (
      <div
        className={`bg-white flex items-center gap-1.5 px-1 select-none shrink-0 ${SIZE_CLASSES[size]} ${className}`}
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
      className={`bg-white overflow-hidden flex items-center justify-center shrink-0 ${SIZE_CLASSES[size]} ${className}`}
    >
      <img
        src={COMPANY_LOGO_SRC}
        alt={DEFAULT_SHOP_NAME}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className="w-full h-full object-cover object-[50%_52%] select-none"
      />
    </div>
  );
};
