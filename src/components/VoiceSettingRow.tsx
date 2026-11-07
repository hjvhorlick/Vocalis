import React from 'react';

/**
 * One settings row in the .vls Voice Creator: the switch, the label, the slider and
 * the A/B test on a single line.
 *
 * It is a separate component so it can be rendered and asserted in a test without a
 * browser — the reason this file exists is that the switch has to be *at* the
 * slider, and that is a layout claim worth checking rather than describing.
 */
export interface VoiceSettingRowProps {
  label: string;
  hint: string;
  /** Whether the setting is applied. Off means bypassed, not zeroed. */
  on: boolean;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  testing?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onChange: (value: number) => void;
  onTest?: () => void;
}

/** The chips a tone row offers; the same six the manipulator uses. */
export const TONE_OPTIONS = [
  { id: 'natural', label: 'Natural Clean' },
  { id: 'deep', label: 'Deep Cinema' },
  { id: 'energetic', label: 'High Energy' },
  { id: 'whisper', label: 'Soft Whisper' },
  { id: 'radio', label: '1930s Radio' },
  { id: 'robot', label: 'Cyber Droid' },
] as const;

/**
 * The delivery-character row: one switch and six chips.
 *
 * It exists because a tone preset is a setting like any other and was the one
 * control on the page without a way to switch it off — which made it impossible to
 * tell whether the character or the recording was what a voice file sounded like.
 */
export const VoiceToneRow: React.FC<{
  on: boolean;
  tone: string;
  hint: string;
  testing?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onSelect: (tone: string) => void;
  onTest?: () => void;
}> = ({ on, tone, hint, testing = false, disabled = false, onToggle, onSelect, onTest }) => (
  <div data-setting="tone" className={`rounded-xl border px-3 py-2.5 ${on ? 'border-slate-800 bg-slate-950/40' : 'border-slate-800/60 bg-slate-950/20'}`}>
    <div className="flex flex-wrap items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Tone character on or off"
        onClick={onToggle}
        title={on ? 'Tone character is applied' : 'Tone character is bypassed'}
        className={`flex h-5 w-10 shrink-0 items-center rounded-full border px-0.5 transition-colors ${
          on ? 'border-emerald-400/60 bg-emerald-500' : 'border-slate-600 bg-slate-700'
        }`}
      >
        <span className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0'}`} />
      </button>
      <span className={`w-[4.5rem] shrink-0 text-[11px] font-semibold ${on ? 'text-slate-200' : 'text-slate-500'}`}>
        Tone
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
        {TONE_OPTIONS.map((option) => {
          const active = on && tone === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!on || disabled}
              onClick={() => onSelect(option.id)}
              aria-pressed={active}
              className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-40 ${
                active
                  ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-100'
                  : 'border-slate-700 text-slate-400 enabled:hover:border-indigo-500 enabled:hover:text-white'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <span className={`w-11 shrink-0 text-right text-[11px] tabular-nums ${on ? 'text-slate-300' : 'text-slate-600'}`}>
        {on ? tone : 'off'}
      </span>
      {onTest && (
        <button
          type="button"
          onClick={onTest}
          disabled={disabled}
          className={`shrink-0 rounded-md border px-1.5 py-1 text-[10px] font-semibold disabled:opacity-40 ${
            testing ? 'border-amber-400/60 bg-amber-500/20 text-amber-200' : 'border-slate-700 text-slate-400 hover:border-indigo-500 hover:text-white'
          }`}
          title="Play the sentence with this tone, then with tone bypassed"
        >
          {testing ? 'Stop' : 'A/B'}
        </button>
      )}
    </div>
    <p className="mt-1 pl-[3.25rem] text-[11px] leading-snug text-slate-500">
      {on ? hint : 'Tone is bypassed for this voice file.'}
    </p>
  </div>
);

export const VoiceSettingRow: React.FC<VoiceSettingRowProps> = ({
  label,
  hint,
  on,
  value,
  min,
  max,
  step,
  format,
  testing = false,
  disabled = false,
  onToggle,
  onChange,
  onTest,
}) => (
  <div
    data-setting={label.toLowerCase()}
    className={`rounded-xl border px-3 py-2.5 transition-colors ${
      on ? 'border-slate-800 bg-slate-950/40' : 'border-slate-800/60 bg-slate-950/20'
    }`}
  >
    {/* Switch, name, slider and value on one line: the switch belongs to the slider. */}
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${label} on or off`}
        onClick={onToggle}
        title={on ? `${label} is applied` : `${label} is bypassed`}
        className={`flex h-5 w-10 shrink-0 items-center rounded-full border px-0.5 transition-colors ${
          on ? 'border-emerald-400/60 bg-emerald-500' : 'border-slate-600 bg-slate-700'
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </button>
      <span className={`w-[4.5rem] shrink-0 text-[11px] font-semibold ${on ? 'text-slate-200' : 'text-slate-500'}`}>
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={!on || disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded bg-slate-700 accent-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
      />
      <span className={`w-11 shrink-0 text-right text-[11px] tabular-nums ${on ? 'text-slate-300' : 'text-slate-600'}`}>
        {on ? format(value) : 'off'}
      </span>
      {onTest && (
        <button
          type="button"
          onClick={onTest}
          disabled={disabled}
          className={`shrink-0 rounded-md border px-1.5 py-1 text-[10px] font-semibold disabled:opacity-40 ${
            testing
              ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
              : 'border-slate-700 text-slate-400 hover:border-indigo-500 hover:text-white'
          }`}
          title={`Play the sentence with ${label} as set, then with it bypassed`}
        >
          {testing ? 'Stop' : 'A/B'}
        </button>
      )}
    </div>
    <p className="mt-1 pl-[3.25rem] text-[11px] leading-snug text-slate-500">
      {on ? hint : `${label} is bypassed for this voice file.`}
    </p>
  </div>
);
