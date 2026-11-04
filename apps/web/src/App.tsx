import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import './App.css';

type Profile = {
  profile_id: string;
  profile_version: number;
  name: string;
  preset: string;
  identity: Record<string, unknown>;
  performance_defaults: Record<string, unknown>;
  pronunciation_dictionary: Record<string, unknown>[];
  created_at: string;
  updated_at: string;
};
const presets = [
  'Documentary Narrator',
  'Storyteller',
  'Conversational',
  'News Presenter',
  'Educational Presenter',
  'Audiobook Narrator',
];
const blank = (): Profile => ({
  profile_id: crypto.randomUUID(),
  profile_version: 1,
  name: '',
  preset: presets[0],
  identity: {},
  performance_defaults: {},
  pronunciation_dictionary: [],
  created_at: '',
  updated_at: '',
});
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api' + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail
              .map((d: { loc?: string[]; msg?: string }) => `${d.loc?.slice(1).join('.')}: ${d.msg}`)
              .join('; ')
          : `Request failed (${response.status})`,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
function Layout() {
  return (
    <div className="app">
      <aside>
        <Link className="brand" to="/">
          ◉ <span>VOCALIS<small>VOICE DESIGN LAB</small></span>
        </Link>
        <div className="navlabel">WORKSPACE</div>
        <nav>
          <NavLink end to="/">Dashboard</NavLink>
          <NavLink to="/studio">Voice studio</NavLink>
          <NavLink to="/presets">Personality presets</NavLink>
          <NavLink to="/library">Voice library</NavLink>
          <NavLink to="/tts">Text to speech</NavLink>
        </nav>
        <div className="side-note">
          <b>Independent by design</b>
          <p>Build a voice from its characteristics, not a recording.</p>
        </div>
      </aside>
      <main>
        <div className="topbar">
          <span>YOUR CREATIVE WORKSPACE</span>
          <span className="badge">● FOUNDATION</span>
        </div>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/studio" element={<Editor />} />
          <Route path="/studio/:id" element={<Editor />} />
          <Route path="/presets" element={<Presets />} />
          <Route path="/library" element={<Library />} />
          <Route path="/tts" element={<TTS />} />
        </Routes>
      </main>
    </div>
  );
}
function Dashboard() {
  return (
    <div className="page">
      <div className="eyebrow">WELCOME TO VOCALIS</div>
      <h1>
        A voice, entirely<br />
        <em>your own.</em>
      </h1>
      <p className="lead">
        Design unique voice identities from the ground up. Explore characteristics, create profiles, and build your voice library.
      </p>
      <div className="actions">
        <Link className="button" to="/studio">
          Create a voice →
        </Link>
        <Link className="button secondary" to="/library">
          Explore library
        </Link>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="orb">◉</div>
        <span>YOUR IDEAS, GIVEN A VOICE</span>
      </div>
      <div className="section-head">
        <div>
          <div className="eyebrow">GET STARTED</div>
          <h2>Your creative toolkit</h2>
        </div>
        <span>01 — 03</span>
      </div>
      <div className="cards">
        <Link to="/studio">
          <span>01 / CREATE</span>
          <h3>Voice studio ↗</h3>
          <p>Start with a personality and shape a voice identity.</p>
        </Link>
        <Link to="/presets">
          <span>02 / EXPLORE</span>
          <h3>Personality presets ↗</h3>
          <p>Find a starting point for your next creation.</p>
        </Link>
        <Link to="/library">
          <span>03 / ORGANISE</span>
          <h3>Voice library ↗</h3>
          <p>Keep your saved voice profiles in one place.</p>
        </Link>
      </div>
      <p className="notice">
        Experimental speech synthesis can attempt short English sentences. Results may be difficult to understand.
      </p>
    </div>
  );
}
type Preset = { name: string; identity: Record<string, unknown>; performance_defaults: Record<string, unknown> };
const identityFields = [
  { section: 'pitch', key: 'centre', label: 'Pitch centre', min: 80, max: 800, step: 1, fallback: 160, unit: 'Hz' },
  { section: 'depth', key: 'resonance_contribution', label: 'Depth', min: 0, max: 1, step: 0.01, fallback: 0.5, unit: '' },
  { section: 'resonance', key: 'brightness', label: 'Resonance brightness', min: 0, max: 1, step: 0.01, fallback: 0.5, unit: '' },
  { section: 'texture', key: 'intensity', label: 'Texture intensity', min: 0, max: 1, step: 0.01, fallback: 0.3, unit: '' },
  { section: 'articulation', key: 'precision', label: 'Articulation precision', min: 0, max: 1, step: 0.01, fallback: 0.5, unit: '' },
  { section: 'breathiness', key: 'intensity', label: 'Breathiness', min: 0, max: 1, step: 0.01, fallback: 0.2, unit: '' },
];
function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile>(blank);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!id);
  const [choices, setChoices] = useState<Preset[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  // Voice preview (Web Audio direct playback).
  const previewContextRef = useRef<AudioContext | null>(null);
  const previewBufferRef = useRef<AudioBuffer | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewAnalyserRef = useRef<AnalyserNode | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewResultRef = useRef<HTMLDivElement>(null);
  const [previewAudio, setPreviewAudio] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    request<Preset[]>('/presets/').then(setChoices).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (id) {
      request<Profile>(`/profiles/${encodeURIComponent(id)}`)
        .then(setProfile)
        .catch((e) => {
          setError(e.message);
          setLoadFailed(true);
        })
        .finally(() => setLoading(false));
    }
  }, [id]);

  const applyPreset = () => {
    const selected = choices.find((p) => p.name === profile.preset);
    if (selected && (!id || confirm('Replace this profile’s identity and performance settings with the preset?'))) {
      setProfile({ ...profile, identity: selected.identity, performance_defaults: selected.performance_defaults });
    }
  };

  const changeIdentity = (section: string, key: string, value: number) =>
    setProfile((p) => ({ ...p, identity: { ...p.identity, [section]: { ...(p.identity[section] as object || {}), [key]: value } } }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await request(id ? `/profiles/${encodeURIComponent(id)}` : '/profiles/', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify(profile),
      });
      navigate('/library');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const unlockPreview = () => {
    const ctx = previewContextRef.current || new AudioContext();
    previewContextRef.current = ctx;
    return { ctx, resumed: ctx.state === 'running' ? Promise.resolve() : ctx.resume() };
  };

  const playPreviewBuffer = (ctx: AudioContext, buffer: AudioBuffer) => {
    if (ctx.state !== 'running') throw new Error('Audio output is not running');
    if (previewAudioRef.current) previewAudioRef.current.pause();
    const source = ctx.createBufferSource();
    const analyser = ctx.createAnalyser();
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    previewSourceRef.current = source;
    previewAnalyserRef.current = analyser;
    source.onended = () => {
      if (previewSourceRef.current === source) {
        previewSourceRef.current = null;
        previewAnalyserRef.current = null;
        setPreviewPlaying(false);
      }
      source.disconnect();
      analyser.disconnect();
    };
    source.start();
    setPreviewPlaying(true);
    setPreviewError('');
    setTimeout(() => {
      if (previewSourceRef.current !== source) return;
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      for (const x of data) peak = Math.max(peak, Math.abs(x));
    }, 300);
  };

  const generatePreview = async () => {
    setPreviewError('');
    setPreviewBusy(true);
    setPreviewPlaying(false);
    setPreviewAudio('');
    previewBufferRef.current = null;
    if (previewSourceRef.current) {
      previewSourceRef.current.onended = null;
      previewSourceRef.current.stop();
      previewSourceRef.current.disconnect();
      previewAnalyserRef.current?.disconnect();
      previewSourceRef.current = null;
      previewAnalyserRef.current = null;
    }
    let output: ReturnType<typeof unlockPreview> | null = null;
    try {
      output = unlockPreview();
      void output.resumed.catch(() => {});
    } catch {}
    try {
      const response = await fetch('/api/engine/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Hello world.',
          identity: profile.identity,
          performance: profile.performance_defaults,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.detail === 'string' ? data.detail : `Preview failed (${response.status})`);
      }
      const bytes = await response.arrayBuffer();
      setPreviewAudio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
      try {
        const decoder = output?.ctx ?? new OfflineAudioContext(1, 1, 16000);
        const decoded = await decoder.decodeAudioData(bytes.slice(0));
        previewBufferRef.current = decoded;
        if (!output) throw new Error('Audio output unavailable');
        await Promise.race([
          output.resumed,
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Audio output did not start')), 2000)),
        ]);
        playPreviewBuffer(output.ctx, decoded);
      } catch {
        setPreviewError('Direct preview playback could not start. Use the standard player below.');
      }
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  };

  const replayPreview = () => {
    try {
      const { ctx, resumed } = unlockPreview();
      void resumed.then(() => {
        if (previewBufferRef.current) playPreviewBuffer(ctx, previewBufferRef.current);
      }).catch(() => {
        setPreviewError('Direct preview playback could not start. Try the standard player below.');
      });
    } catch {
      setPreviewError('Direct preview playback is unavailable. Try the standard player below.');
    }
  };

  useEffect(() => {
    return () => {
      if (previewSourceRef.current) {
        previewSourceRef.current.onended = null;
        previewSourceRef.current.stop();
        previewSourceRef.current.disconnect();
        previewSourceRef.current = null;
      }
      previewAnalyserRef.current?.disconnect();
      if (previewContextRef.current && previewContextRef.current.state !== 'closed') {
        void previewContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="page narrow">
      <div className="eyebrow">VOICE DESIGN</div>
      <h1>{id ? 'Edit your voice' : 'Create a voice'}</h1>
      <p className="lead">
        Define a stable identity and separate performance defaults. Some settings now control the experimental synthesizer; others are saved for future engine work.
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? (
        <p>Loading profile…</p>
      ) : loadFailed ? (
        <p>Could not load this profile. Return to the library and try again.</p>
      ) : (
        <form onSubmit={save} className="panel">
          <label>
            Voice name
            <input
              required
              maxLength={120}
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              placeholder="e.g. My narrator"
            />
          </label>
          <label>
            Personality starting point
            <select value={profile.preset} onChange={(e) => setProfile({ ...profile, preset: e.target.value })}>
              {presets.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <button type="button" className="button secondary" onClick={applyPreset} disabled={!choices.length}>
            Apply preset settings
          </button>
          <p className="muted">
            Applying a preset replaces identity and performance values. Changing the name alone does not change your settings.
          </p>
          <h3>Identity</h3>
          <div className="field-grid">
            {identityFields.map((f) => {
              const component = profile.identity[f.section] as Record<string, unknown> | undefined;
              const value = Number(component?.[f.key] ?? f.fallback);
              return (
                <label key={f.section}>
                  {f.label}
                  <span className="range-value">
                    {value} {f.unit}
                  </span>
                  <input
                    type="range"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={value}
                    onChange={(e) => changeIdentity(f.section, f.key, Number(e.target.value))}
                  />
                </label>
              );
            })}
          </div>
          <h3>Performance defaults</h3>
          <div className="field-grid">
            <label>
              Emotion
              <select
                value={String(profile.performance_defaults.emotion || 'neutral')}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    performance_defaults: { ...profile.performance_defaults, emotion: e.target.value },
                  })
                }
              >
                {[
                  'neutral',
                  'friendly',
                  'calm',
                  'confident',
                  'excited',
                  'serious',
                  'gentle',
                  'dramatic',
                  'concerned',
                  'reflective',
                ].map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </label>
            <label>
              Speaking pace{' '}
              <span className="range-value">
                {Number((profile.performance_defaults.speaking_pace as Record<string, unknown>)?.speed ?? 1)}×
              </span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={Number((profile.performance_defaults.speaking_pace as Record<string, unknown>)?.speed ?? 1)}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    performance_defaults: {
                      ...profile.performance_defaults,
                      speaking_pace: { ...(profile.performance_defaults.speaking_pace as object || {}), speed: Number(e.target.value) },
                    },
                  })
                }
              />
            </label>
            {['energy', 'loudness', 'expressiveness'].map((key) => (
              <label key={key}>
                {key}
                <span className="range-value">{Number(profile.performance_defaults[key] ?? 0.5)}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={Number(profile.performance_defaults[key] ?? 0.5)}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      performance_defaults: { ...profile.performance_defaults, [key]: Number(e.target.value) },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="muted">
            Pitch, depth, resonance brightness, breathiness, pace, energy and loudness affect the experimental engine. Other settings are not connected yet.
          </p>
          <h3>Voice preview</h3>
          <p className="muted">
            Hear what your current settings sound like through the experimental engine (says “Hello world.”).
          </p>
          {previewBusy ? (
            <button type="button" className="button" disabled>
              Generating preview…
            </button>
          ) : (
            <button type="button" className="button" onClick={generatePreview}>
              ▶ Listen to this voice
            </button>
          )}
          {previewError && <p className="error" role="alert">{previewError}</p>}
          {previewPlaying && <p role="status">Playing preview…</p>}
          <button className="button" type="submit">
            Save voice profile →
          </button>
        </form>
      )}
      {previewAudio && (
        <div ref={previewResultRef} className="audio-result" role="region" aria-label="Voice preview">
          <p className="audio-success" role="status">✓ Preview generated</p>
          <button type="button" className="button play-button" onClick={replayPreview}>
            ▶ Play preview again
          </button>
          {previewError && <p className="error" role="alert">{previewError}</p>}
          <p>
            Standard audio player (alternative):{' '}
            <audio ref={previewAudioRef} controls src={previewAudio} onPlaying={() => setPreviewPlaying(true)} onPause={() => setPreviewPlaying(false)} onEnded={() => setPreviewPlaying(false)} onError={() => setPreviewError('The browser could not play this preview WAV.')}>
              Your browser does not support audio playback.
            </audio>
          </p>
          <p>
            <a className="button secondary" href={previewAudio} download="vocalis-preview.wav">
              Download preview WAV
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
function Library() {
  const [items, setItems] = useState<Profile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = () =>
    request<Profile[]>('/profiles/')
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    void load();
  }, []);
  const remove = async (p: Profile) => {
    if (!confirm(`Delete “${p.name}”?`)) return;
    try {
      await request(`/profiles/${encodeURIComponent(p.profile_id)}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const duplicate = async (p: Profile) => {
    try {
      await request('/profiles/', {
        method: 'POST',
        body: JSON.stringify({ ...p, profile_id: crypto.randomUUID(), name: `${p.name} copy`.slice(0, 120) }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const exportProfile = (p: Profile) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vocalis-profile.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  const importProfile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const p = JSON.parse(await file.text());
      await request('/profiles/', { method: 'POST', body: JSON.stringify({ ...p, profile_id: crypto.randomUUID() }) });
      await load();
      setError('');
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`);
    } finally {
      e.target.value = '';
    }
  };
  return (
    <div className="page">
      <div className="eyebrow">YOUR COLLECTION</div>
      <h1>Voice library</h1>
      <p className="lead">Your saved voice identities, ready to refine.</p>
      <div className="actions">
        <Link className="button" to="/studio">
          + Create voice
        </Link>
        <label className="button secondary upload">
          Import JSON
          <input type="file" accept="application/json,.json" onChange={importProfile} />
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {loading ? (
        <p>Loading profiles…</p>
      ) : items.length === 0 ? (
        <div className="panel empty">
          <h3>No voices yet</h3>
          <p>Create your first profile to see it here.</p>
        </div>
      ) : (
        <div className="profile-list">
          {items.map((p) => (
            <article className="profile" key={p.profile_id}>
              <div>
                <span className="eyebrow">{p.preset}</span>
                <h3>{p.name}</h3>
              </div>
              <div className="profile-actions">
                <Link to={`/studio/${encodeURIComponent(p.profile_id)}`}>Edit / rename</Link>
                <button onClick={() => duplicate(p)}>Duplicate</button>
                <button onClick={() => exportProfile(p)}>Export</button>
                <button onClick={() => remove(p)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
function Presets() {
  return (
    <div className="page">
      <div className="eyebrow">FIND YOUR STARTING POINT</div>
      <h1>Personality presets</h1>
      <p className="lead">
        Choose a direction to organise your voice profiles. Presets provide adjustable parameter starting points, not trained voices. Apply one in the studio.
      </p>
      <div className="cards">
        {presets.map((p, i) => (
          <div key={p}>
            <span>0{i + 1} / PERSONALITY</span>
            <h3>{p}</h3>
            <p>An adjustable starting point available in the studio.</p>
          </div>
        ))}
      </div>
      <div className="actions">
        <Link className="button" to="/studio">
          Go to voice studio →
        </Link>
      </div>
    </div>
  );
}
type SinkAudioContext = AudioContext & { setSinkId?: (deviceId: string) => Promise<void> };
type SinkMediaElement = HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> };
type OutputDevices = MediaDevices & { selectAudioOutput?: () => Promise<MediaDeviceInfo> };
function TTS() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfileId] = useState('');
  const [text, setText] = useState('Hello world.');
  const [words, setWords] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [audio, setAudio] = useState('');
  const [playbackMessage, setPlaybackMessage] = useState('');
  const [playing, setPlaying] = useState(false);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [sinkId, setSinkId] = useState('');
  const [outputBusy, setOutputBusy] = useState(false);
  const [outputNotice, setOutputNotice] = useState('');
  const [mediaReady, setMediaReady] = useState(true);
  const mediaRequest = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const toneRef = useRef<OscillatorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const diagnosticSession = useRef(crypto.randomUUID());

  const trace = (event: string, extras: Record<string, unknown> = {}) => {
    const a = audioRef.current;
    void fetch('/api/engine/playback-diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: diagnosticSession.current,
        event,
        embedded: window.self !== window.top,
        ...(a
          ? {
              muted: a.muted,
              volume: a.volume,
              position: Number.isFinite(a.currentTime) ? a.currentTime : 0,
              ready_state: a.readyState,
            }
          : {}),
        ...extras,
      }),
    }).catch(() => {});
  };

  useEffect(() => {
    request<Profile[]>('/profiles/')
      .then((p) => {
        setProfiles(p);
        if (p.length) setProfileId(p[0].profile_id);
      })
      .catch((e) => setError(e.message));
    request<{ words: string[] }>('/engine/vocabulary')
      .then((v) => setWords(v.words))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!audio) return;
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return () => URL.revokeObjectURL(audio);
  }, [audio]);

  useEffect(() => {
    if (!audio || !audioRef.current) return;
    const player = audioRef.current as SinkMediaElement;
    if (!player.setSinkId) {
      if (sinkId)
        Promise.resolve().then(() => {
          setMediaReady(false);
          setOutputNotice('The standard player cannot select a device in this browser. Direct playback still uses your selected device.');
        });
      else Promise.resolve().then(() => setMediaReady(true));
      return;
    }
    const requestRef = mediaRequest;
    const version = ++requestRef.current;
    void player
      .setSinkId(sinkId)
      .then(() => {
        if (requestRef.current === version) setMediaReady(true);
      })
      .catch(() => {
        if (requestRef.current === version) {
          setMediaReady(false);
          setOutputNotice('The standard player could not use that output. Direct playback still uses your selected device.');
        }
      });
    return () => {
      requestRef.current++;
    };
  }, [audio, sinkId]);

  useEffect(() => {
    return () => {
      if (toneRef.current) {
        toneRef.current.onended = null;
        toneRef.current.stop();
        toneRef.current.disconnect();
        toneRef.current = null;
      }
      sourceRef.current?.stop();
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
      if (contextRef.current && contextRef.current.state !== 'closed') void contextRef.current.close();
    };
  }, []);

  const unlockAudio = () => {
    let ctx = contextRef.current;
    // Reuse a running context. If suspended, try to resume it (caller waits
    // with a timeout so we never hang forever). If closed or unusable,
    // create a fresh AudioContext.
    if (ctx && ctx.state === 'running') {
      return { ctx, resumed: Promise.resolve() };
    }
    if (ctx && ctx.state !== 'closed') {
      return { ctx, resumed: ctx.resume() };
    }
    ctx = new AudioContext();
    contextRef.current = ctx;
    return { ctx, resumed: ctx.state === 'running' ? Promise.resolve() : ctx.resume() };
  };

  const loadOutputs = async () => {
    setOutputNotice('');
    try {
      if (!navigator.mediaDevices?.enumerateDevices) throw new Error('Audio device listing is unavailable in this preview.');
      const found = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default');
      setOutputs(found);
      setOutputNotice(
        found.length
          ? 'Choose an output below. Some device names may be hidden until the browser grants access.'
          : 'No additional outputs were listed. Connect your headset and select it as the computer’s default output, or use Choose headset if available.',
      );
    } catch {
      setOutputNotice('This preview cannot list audio outputs. Select your headset in your computer’s sound settings instead.');
    }
  };

  const chooseOutput = async () => {
    try {
      const chosen = await (navigator.mediaDevices as OutputDevices).selectAudioOutput!();
      setOutputs((old) => (old.some((d) => d.deviceId === chosen.deviceId) ? old : [...old, chosen]));
    } catch {
      setOutputNotice('Headset selection was cancelled or not available.');
    }
  };

  const applyOutput = async (id: string) => {
    setOutputBusy(true);
    setOutputNotice('');
    try {
      const { ctx, resumed } = unlockAudio();
      void resumed.catch(() => {});
      const output = ctx as SinkAudioContext;
      if (!output.setSinkId) {
        if (id) throw new Error('This browser cannot select an output for direct playback. Use your computer’s sound settings.');
      } else await output.setSinkId(id);
      if (sourceRef.current) {
        sourceRef.current.onended = null;
        sourceRef.current.stop();
        sourceRef.current.disconnect();
        analyserRef.current?.disconnect();
        sourceRef.current = null;
        analyserRef.current = null;
      }
      if (toneRef.current) {
        toneRef.current.stop();
        toneRef.current = null;
      }
      audioRef.current?.pause();
      setPlaying(false);
      if (id !== sinkId) setMediaReady(!audio);
      setSinkId(id);
      setOutputNotice(id ? 'Selected output applied to direct audio.' : 'Using the computer’s default audio output.');
    } catch (e) {
      setOutputNotice((e as Error).message || 'Could not select this output. Use your computer’s sound settings.');
    } finally {
      setOutputBusy(false);
    }
  };

  const playTestTone = async () => {
    setPlaybackMessage('');
    try {
      const response = await fetch('/api/engine/beep');
      if (!response.ok) throw new Error(`Beep failed (${response.status})`);
      const bytes = await response.arrayBuffer();
      const blob = new Blob([bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      if (audioRef.current) audioRef.current.pause();
      audioRef.current!.src = url;
      audioRef.current!.play().catch(() => {
        // Autoplay may be blocked; the user can click the player controls.
      });
      setPlaybackMessage('');
    } catch {
      setPlaybackMessage('The browser could not play the test sound.');
    }
  };

  const playBuffer = (ctx: AudioContext, buffer: AudioBuffer) => {
    if (ctx.state !== 'running') throw new Error('Audio output is not running');
    if (audioRef.current) audioRef.current.pause();
    const source = ctx.createBufferSource();
    const analyser = ctx.createAnalyser();
    source.buffer = buffer;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    sourceRef.current = source;
    analyserRef.current = analyser;
    source.onended = () => {
      if (sourceRef.current === source) {
        sourceRef.current = null;
        analyserRef.current = null;
        setPlaying(false);
      }
      source.disconnect();
      analyser.disconnect();
    };
    source.start();
    setPlaying(true);
    setPlaybackMessage('');
    trace('web_audio_start', { detail: ctx.state });
    setTimeout(() => {
      if (sourceRef.current !== source) return;
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      let peak = 0;
      for (const x of data) peak = Math.max(peak, Math.abs(x));
      trace('web_audio_signal', { value: peak, detail: ctx.state });
    }, 300);
  };

  const replay = () => {
    try {
      const { ctx, resumed } = unlockAudio();
      void resumed
        .then(() => {
          if (bufferRef.current) playBuffer(ctx, bufferRef.current);
        })
        .catch((e: Error) => {
          trace('web_audio_error', { detail: e.name });
          setPlaybackMessage('Direct playback could not start. Try the standard player below.');
        });
    } catch (e) {
      trace('web_audio_error', { detail: (e as Error).name });
      setPlaybackMessage('Direct playback is unavailable. Try the standard player below.');
    }
  };

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setPlaybackMessage('');
    setPlaying(false);
    setBusy(true);
    setAudio('');
    setMediaReady(false);
    bufferRef.current = null;
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      sourceRef.current.stop();
      sourceRef.current.disconnect();
      analyserRef.current?.disconnect();
      sourceRef.current = null;
      analyserRef.current = null;
    }
    trace('generate_start');
    let output: ReturnType<typeof unlockAudio> | null = null;
    try {
      output = unlockAudio();
      void output.resumed.catch(() => {});
    } catch {}
    try {
      const response = await fetch('/api/engine/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, profile_id: profileId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.detail === 'string' ? data.detail : `Generation failed (${response.status})`);
      }
      const bytes = await response.arrayBuffer();
      trace('response', { value: bytes.byteLength });
      setAudio(URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })));
      // Always enable the standard HTML player as a reliable fallback,
      // independent of whether Web Audio direct playback works.
      setMediaReady(true);
      try {
        const decoder = output?.ctx ?? new OfflineAudioContext(1, 1, 16000);
        const decoded = await decoder.decodeAudioData(bytes.slice(0));
        bufferRef.current = decoded;
        const samples = decoded.getChannelData(0);
        let sum = 0;
        for (const sample of samples) sum += sample * sample;
        trace('decoded', { value: Math.sqrt(sum / samples.length) });
        if (!output) throw new Error('Audio output unavailable');
        await Promise.race([
          output.resumed,
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Audio output did not start')), 2000)),
        ]);
        playBuffer(output.ctx, decoded);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        trace('web_audio_error', { detail: msg });
        setPlaybackMessage('Direct playback could not start. Try the standard player below.');
      }
    } catch (e) {
      trace('generate_error', { detail: (e as Error).name });
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <div className="eyebrow">EARLY ENGINE EXPERIMENT</div>
      <h1>Text to speech</h1>
      <p className="lead">
        Try the first independent, hand-built formant synthesizer. It can attempt short English sentences using a small dictionary and spelling rules. It may mispronounce words and sound robotic.
      </p>
      <div className="panel sound-test">
        <h3>Audio output</h3>
        <p className="muted">
          Connect your wired or Bluetooth headset first. The computer’s default output is used unless your browser lets you choose another device.
        </p>
        <label>
          Output device
          <select value={sinkId} disabled={outputBusy} onChange={(e) => void applyOutput(e.target.value)}>
            <option value="">Computer default</option>
            {outputs.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Audio output ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <div className="output-actions">
          <button type="button" className="button secondary" disabled={outputBusy} onClick={() => void loadOutputs()}>
            Find audio devices
          </button>
          {typeof (navigator.mediaDevices as OutputDevices | undefined)?.selectAudioOutput === 'function' && (
            <button type="button" className="button secondary" disabled={outputBusy} onClick={() => void chooseOutput()}>
              Choose headset…
            </button>
          )}
        </div>
        {outputNotice && <p className="muted" role="status">{outputNotice}</p>}
        <h3>Sound check</h3>
        <p className="muted">Play a one-second beep to test browser audio. This does not use the speech engine.</p>
        <button type="button" className="button secondary" onClick={playTestTone}>
          ▶ Play test beep
        </button>
        {playbackMessage && !audio && <p className="error" role="alert">{playbackMessage}</p>}
      </div>
      <form className="panel" onSubmit={generate}>
        <label>
          Voice profile
          <select required value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            <option value="">Select a saved profile</option>
            {profiles.map((p) => (
              <option key={p.profile_id} value={p.profile_id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {!profiles.length && (
          <p className="muted">
            First <Link to="/studio">create and save a voice profile</Link>.
          </p>
        )}
        <label>
          Text (240 characters maximum)
          <textarea required maxLength={240} value={text} onChange={(e) => setText(e.target.value)} rows={4} />
        </label>
        <button type="submit" className="button" disabled={busy || !profileId}>
          {busy ? 'Generating audio…' : 'Generate experimental audio'}
        </button>
        <p className="muted">The app will try to play generated audio directly through your browser.</p>
        {busy && <p role="status">Generating your audio…</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {audio && (
          <div ref={resultRef} className="audio-result" role="region" aria-label="Generated audio">
            <p className="audio-success" role="status">✓ Audio generated</p>
            <button type="button" className="button play-button" onClick={replay}>
              ▶ Play generated audio
            </button>
            <p role="status">{playbackMessage || (playing ? 'Playing audio…' : 'Press Play to listen again.')}</p>
            <p>
              Standard audio player (alternative): {mediaReady ? '' : 'not available for this output yet.'}
            </p>
            <audio
              ref={audioRef}
              controls={mediaReady}
              src={audio}
              onPlaying={() => {
                if (sourceRef.current) {
                  sourceRef.current.onended = null;
                  sourceRef.current.stop();
                  sourceRef.current.disconnect();
                  analyserRef.current?.disconnect();
                  sourceRef.current = null;
                  analyserRef.current = null;
                }
                trace('playing');
                setPlaying(true);
                setPlaybackMessage('');
              }}
              onTimeUpdate={() => trace('progress')}
              onPause={() => {
                trace('pause');
                setPlaying(false);
              }}
              onEnded={() => {
                trace('ended');
                setPlaying(false);
              }}
              onError={() => {
                trace('media_error', { value: audioRef.current?.error?.code });
                setPlaybackMessage('The browser could not play this WAV. Try downloading it instead.');
              }}
            >
              Your browser does not support audio playback. Please download the WAV.
            </audio>
            <p>
              <a className="button secondary" href={audio} download="vocalis-experiment.wav">
                Download WAV
              </a>
            </p>
          </div>
        )}
      </form>
      <details className="panel">
        <summary>Dictionary starting words ({words.length})</summary>
        <p className="muted">
          The engine also guesses other English words; those guesses may be wrong. {words.join(', ') || 'Loading vocabulary…'}
        </p>
      </details>
    </div>
  );
}

export default function App() {
  return <BrowserRouter><Layout /></BrowserRouter>;
}
