import React, { useState } from 'react';

export type VoiceAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface VoiceAvatarProps {
  /** Voice id, used to fall back to the convention-based portrait path. */
  id?: string;
  name: string;
  avatarImage?: string;
  color: string;
  size?: VoiceAvatarSize;
  /** Adds a soft pulsing ring while this voice is speaking. */
  speaking?: boolean;
  /** Small accent dot in the corner (used for the accent flag elsewhere). */
  className?: string;
}

/**
 * Portrait sizes. These are deliberately larger than the old initial-letter
 * chips (which topped out at 44px) so the persona art is actually readable.
 */
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
  speaking = false,
  className = '',
}) => {
  const [failed, setFailed] = useState(false);
  const src = avatarImage || (id ? `/voice-icons/${id}.webp` : undefined);
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  return (
    <div
      className={`relative shrink-0 overflow-hidden ring-1 ring-white/15 shadow-md ${SIZE_CLASSES[size]} ${
        speaking ? 'ring-2 ring-cyan-400/80 shadow-cyan-500/30' : ''
      } ${className}`}
      style={{ backgroundColor: color }}
      title={name}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={`${name} portrait`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center font-bold text-white uppercase"
          style={{ background: `linear-gradient(140deg, ${color}, ${color}99)` }}
        >
          {initial}
        </div>
      )}
      {speaking && (
        <span className="absolute inset-0 rounded-[inherit] ring-2 ring-cyan-300/60 animate-pulse pointer-events-none" />
      )}
    </div>
  );
};
