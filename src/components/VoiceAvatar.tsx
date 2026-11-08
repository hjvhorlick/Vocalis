import React, { useState } from 'react';

export type VoiceAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface VoiceAvatarProps {
  /** Voice id; also used to resolve the portrait path. */
  id?: string;
  name: string;
  avatarImage?: string;
  color: string;
  size?: VoiceAvatarSize;
  /** Extra classes for the wrapper. */
  className?: string;
}

/**
 * Persona portrait. Deliberately larger than the initial-letter chips it
 * replaced (which topped out at 44px) so the artwork is actually readable.
 */
/** Rendered pixel size per variant, used for the width/height attributes. */
const PIXELS: Record<VoiceAvatarSize, number> = {
  xs: 36,
  sm: 48,
  md: 64,
  lg: 80,
  xl: 96,
};

const SIZE_CLASSES: Record<VoiceAvatarSize, string> = {
  xs: 'w-9 h-9 rounded-lg text-[11px]',
  sm: 'w-12 h-12 rounded-xl text-sm',
  md: 'w-16 h-16 rounded-2xl text-lg',
  lg: 'w-20 h-20 rounded-2xl text-xl',
  xl: 'w-24 h-24 rounded-3xl text-2xl',
};

export const VoiceAvatar: React.FC<VoiceAvatarProps> = ({
  id,
  name,
  avatarImage,
  color,
  size = 'md',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);
  const src = avatarImage || (id ? `/voice-icons/${id}.webp` : undefined);
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  return (
    <div
      className={`relative shrink-0 overflow-hidden ring-1 ring-white/15 shadow-md ${SIZE_CLASSES[size]} ${className}`}
      style={{ backgroundColor: color }}
      title={name}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={`${name} portrait`}
          loading="lazy"
          decoding="async"
          // The largest avatar is 96px, so 192px covers a 2x display.
          srcSet={`${src} 1x, ${src} 2x`}
          width={PIXELS[size]}
          height={PIXELS[size]}
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        // Custom voices have no portrait art, so give them a deliberate
        // monogram treatment rather than a flat colour square.
        <div
          className="relative w-full h-full flex items-center justify-center font-extrabold text-white uppercase tracking-tight"
          style={{
            background: `radial-gradient(120% 120% at 30% 20%, ${color}ee 0%, ${color} 45%, #0b1020 100%)`,
          }}
        >
          <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">{initial}</span>
          <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/35 to-transparent" />
        </div>
      )}
    </div>
  );
};
