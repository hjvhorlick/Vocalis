import React from 'react';
import { Building2, Droplets, Info, Volume2 } from 'lucide-react';
import {
  ROOM_ENVIRONMENTS,
  roomEnvironmentForId,
  type RoomEnvironmentId,
} from '../utils/roomEnvironment';

interface RoomEnvironmentStudioProps {
  environmentId: RoomEnvironmentId;
  wet: number;
  onEnvironmentChange: (environmentId: RoomEnvironmentId) => void;
  onWetChange: (wet: number) => void;
  compact?: boolean;
}

/**
 * Delivery acoustics are intentionally selected outside voice-identity controls.
 * Every non-dry option is explicitly a modelled room, not a claimed recording of
 * a named venue.
 */
export const RoomEnvironmentStudio: React.FC<RoomEnvironmentStudioProps> = ({
  environmentId,
  wet,
  onEnvironmentChange,
  onWetChange,
  compact = false,
}) => {
  const selected = roomEnvironmentForId(environmentId);
  return (
    <section className={`rounded-2xl border border-cyan-900/70 bg-cyan-950/15 ${compact ? 'p-4' : 'p-5'} space-y-4`} aria-label="Room Environment Studio">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-cyan-500/15 p-2 text-cyan-300"><Building2 className="h-4 w-4" /></div>
        <div>
          <h3 className="text-sm font-bold text-cyan-100">Room Environment Studio</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
            A post-render delivery layer. It never changes the stored original voice source or voice identity.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ROOM_ENVIRONMENTS.map(room => {
          const chosen = room.id === environmentId;
          return (
            <button
              type="button"
              key={room.id}
              onClick={() => { onEnvironmentChange(room.id); onWetChange(room.wet); }}
              className={`rounded-xl border p-3 text-left transition-colors ${chosen ? 'border-cyan-400 bg-cyan-400/10 shadow-[0_0_18px_rgba(34,211,238,0.08)]' : 'border-slate-700/80 bg-slate-950/40 hover:border-slate-600'}`}
              aria-pressed={chosen}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-100">{room.name}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${room.kind === 'dry' ? 'bg-slate-700 text-slate-300' : 'bg-cyan-500/15 text-cyan-300'}`}>{room.kind}</span>
              </span>
              <span className="mt-1.5 block text-[11px] leading-relaxed text-slate-400">{room.description}</span>
              {room.kind === 'modelled' && <span className="mt-2 block font-mono text-[10px] text-slate-500">RT60 {room.rt60.toFixed(2)}s · {room.sourceDistanceM.toFixed(1)}m</span>}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3.5">
        <div className="flex items-center justify-between gap-3 text-xs">
          <label htmlFor="room-wet" className="flex items-center gap-2 font-medium text-slate-200"><Droplets className="h-3.5 w-3.5 text-cyan-300" /> Room blend</label>
          <output className="font-mono text-cyan-300">{Math.round(wet * 100)}%</output>
        </div>
        <input
          id="room-wet"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={wet}
          disabled={selected.kind === 'dry'}
          onChange={event => onWetChange(Number(event.target.value))}
          className="mt-3 h-1.5 w-full cursor-pointer accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
        />
        <div className="mt-2 flex gap-2 text-[10px] leading-relaxed text-slate-500"><Info className="mt-0.5 h-3 w-3 shrink-0" />
          {selected.kind === 'dry'
            ? 'Dry Reference bypasses room processing. Choose it for voice identity review.'
            : `Modelled response: ${selected.preDelayMs} ms pre-delay, approximately ${selected.rt60.toFixed(2)} s RT60, late-field damping near ${(selected.highFrequencyDampingHz / 1000).toFixed(1)} kHz. This is not a measured named room.`}
        </div>
      </div>
      {!compact && <p className="flex items-center gap-2 text-[10px] text-slate-500"><Volume2 className="h-3 w-3" /> The selected environment and exact recipe are written to every contract render manifest.</p>}
    </section>
  );
};
