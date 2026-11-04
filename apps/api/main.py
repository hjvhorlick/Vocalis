from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
import sys
from pydantic import BaseModel, Field, ConfigDict
from typing import Literal
from typing import List, Optional
import sqlite3
import os
from pathlib import Path
import json
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "engine"))
from vocalis_engine.synthesis.experimental import LEXICON, UnsupportedText, synthesize
from datetime import datetime
from collections import deque

app = FastAPI(
    title="Vocalis API",
    description="Independent Speech-Generation Platform Backend (Version 2.0)",
    version="2.0.0"
)

# Database initialization (SQLite - Initial Prototype per Directive Part K)
DB_PATH = os.environ.get("VOCALIS_DB_PATH", str(Path(__file__).resolve().parent / "vocalis_prototype.db"))

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS voice_profiles (
            profile_id TEXT PRIMARY KEY,
            profile_version INTEGER DEFAULT 1,
            name TEXT,
            preset TEXT,
            identity_json TEXT,
            performance_defaults_json TEXT,
            pronunciation_dictionary_json TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# Version 1 Voice DNA. Unknown legacy keys are retained to prevent data loss.
class DNAComponent(BaseModel):
    model_config = ConfigDict(extra="allow", allow_inf_nan=False)

class Pitch(DNAComponent):
    centre: float = Field(default=160.0, ge=80, le=800)
    fine_adjustment: float = Field(default=0, ge=-1, le=1)

class Depth(DNAComponent):
    resonance_contribution: float = Field(default=0.5, ge=0, le=1)

class Resonance(DNAComponent):
    brightness: float = Field(default=0.5, ge=0, le=1)

class Texture(DNAComponent):
    intensity: float = Field(default=0.3, ge=0, le=1)

class Articulation(DNAComponent):
    precision: float = Field(default=0.5, ge=0, le=1)

class Breathiness(DNAComponent):
    intensity: float = Field(default=0.2, ge=0, le=1)

class VoiceIdentityProfile(DNAComponent):
    pitch: Pitch = Field(default_factory=Pitch)
    depth: Depth = Field(default_factory=Depth)
    resonance: Resonance = Field(default_factory=Resonance)
    texture: Texture = Field(default_factory=Texture)
    articulation: Articulation = Field(default_factory=Articulation)
    accent: dict = Field(default_factory=dict)
    breathiness: Breathiness = Field(default_factory=Breathiness)
    natural_variation: dict = Field(default_factory=dict)
    vocal_age_character: dict = Field(default_factory=dict)
    personality_starting_point: str = ""

class SpeakingPace(DNAComponent):
    speed: float = Field(default=1.0, ge=0.5, le=2.0)

class PerformanceDirection(DNAComponent):
    emotion: Literal["neutral", "friendly", "calm", "confident", "excited", "serious", "gentle", "dramatic", "concerned", "reflective"] = "neutral"
    speaking_pace: SpeakingPace = Field(default_factory=SpeakingPace)
    energy: float = Field(default=0.5, ge=0, le=1)
    loudness: float = Field(default=0.5, ge=0, le=1)
    pitch_range_adjustment: float = Field(default=0.0, ge=-1, le=1)
    pitch_movement: dict = Field(default_factory=dict)
    sentence_emphasis: List[str] = Field(default_factory=list)
    word_emphasis: List[str] = Field(default_factory=list)
    pauses: dict = Field(default_factory=dict)
    breathing: dict = Field(default_factory=dict)
    dramatic_intensity: float = Field(default=0.0, ge=0, le=1)
    conversational_delivery: bool = False
    expressiveness: float = Field(default=0.5, ge=0, le=1)

class VoiceProfile(DNAComponent):
    profile_id: str = Field(min_length=1, max_length=128, pattern=r".*\S.*")
    profile_version: Literal[1] = 1
    name: str = Field(min_length=1, max_length=120, pattern=r".*\S.*")
    preset: str = Field(min_length=1, max_length=120, pattern=r".*\S.*")
    identity: VoiceIdentityProfile = Field(default_factory=VoiceIdentityProfile)
    performance_defaults: PerformanceDirection = Field(default_factory=PerformanceDirection)
    pronunciation_dictionary: List[dict] = Field(default_factory=list)
    created_at: str = ""
    updated_at: str = ""

# These are parameter starting points, not recorded or trained voices.
PRESET_VALUES = {
    "Documentary Narrator": (125, .75, .35, .4, .75, .12, .9, "confident"),
    "Storyteller": (160, .6, .45, .45, .6, .25, .95, "gentle"),
    "Conversational": (180, .4, .6, .25, .45, .2, 1.05, "friendly"),
    "News Presenter": (155, .5, .6, .15, .9, .1, 1.0, "confident"),
    "Educational Presenter": (175, .45, .6, .2, .8, .15, .95, "calm"),
    "Audiobook Narrator": (150, .6, .45, .3, .7, .2, .95, "neutral"),
}

def preset_data(name: str):
    pitch, depth, brightness, texture, precision, breathiness, speed, emotion = PRESET_VALUES[name]
    return {
        "name": name,
        "identity": VoiceIdentityProfile(pitch={"centre": pitch}, depth={"resonance_contribution": depth},
            resonance={"brightness": brightness}, texture={"intensity": texture},
            articulation={"precision": precision}, breathiness={"intensity": breathiness},
            personality_starting_point=name).model_dump(),
        "performance_defaults": PerformanceDirection(speaking_pace={"speed": speed}, emotion=emotion).model_dump(),
    }

@app.get("/presets/")
def list_presets():
    return [preset_data(name) for name in PRESET_VALUES]

# API Endpoints (Stage 1 Foundation)
@app.get("/")
def read_root():
    return {"message": "Vocalis API Foundation (Stage 1) - Independent Speech-Generation Platform", "version": "2.0.0"}

@app.post("/profiles/", response_model=VoiceProfile)
def create_profile(profile: VoiceProfile):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    profile.created_at = now
    profile.updated_at = now
    
    if cursor.execute("SELECT 1 FROM voice_profiles WHERE profile_id = ?", (profile.profile_id,)).fetchone():
        conn.close()
        raise HTTPException(status_code=409, detail="Profile already exists")
    cursor.execute('''
        INSERT INTO voice_profiles (profile_id, profile_version, name, preset, identity_json, performance_defaults_json, pronunciation_dictionary_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        profile.profile_id, profile.profile_version, profile.name, profile.preset,
        json.dumps(profile.identity.model_dump()),
        json.dumps(profile.performance_defaults.model_dump()),
        json.dumps(profile.pronunciation_dictionary),
        profile.created_at, profile.updated_at
    ))
    conn.commit()
    conn.close()
    return profile

@app.get("/profiles/{profile_id}", response_model=VoiceProfile)
def get_profile(profile_id: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM voice_profiles WHERE profile_id = ?', (profile_id,))
    row = cursor.fetchone()
    conn.close()
    
    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    return VoiceProfile(
        profile_id=row[0],
        profile_version=row[1],
        name=row[2],
        preset=row[3],
        identity=VoiceIdentityProfile(**json.loads(row[4])),
        performance_defaults=PerformanceDirection(**json.loads(row[5])),
        pronunciation_dictionary=json.loads(row[6]),
        created_at=row[7],
        updated_at=row[8]
    )

@app.get("/profiles/")
def list_profiles():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM voice_profiles')
    rows = cursor.fetchall()
    conn.close()
    
    profiles = []
    for row in rows:
        profiles.append(VoiceProfile(
            profile_id=row[0],
            profile_version=row[1],
            name=row[2],
            preset=row[3],
            identity=VoiceIdentityProfile(**json.loads(row[4])),
            performance_defaults=PerformanceDirection(**json.loads(row[5])),
            pronunciation_dictionary=json.loads(row[6]),
            created_at=row[7],
            updated_at=row[8]
        ))
    return profiles


@app.put("/profiles/{profile_id}", response_model=VoiceProfile)
def update_profile(profile_id: str, profile: VoiceProfile):
    if profile_id != profile.profile_id:
        raise HTTPException(status_code=400, detail="Profile ID does not match")
    existing = get_profile(profile_id)
    profile.created_at = existing.created_at
    profile.updated_at = datetime.now().isoformat()
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""UPDATE voice_profiles SET profile_version=?, name=?, preset=?, identity_json=?,
                     performance_defaults_json=?, pronunciation_dictionary_json=?, updated_at=? WHERE profile_id=?""",
                     (profile.profile_version, profile.name, profile.preset, json.dumps(profile.identity.model_dump()),
                      json.dumps(profile.performance_defaults.model_dump()), json.dumps(profile.pronunciation_dictionary),
                      profile.updated_at, profile_id))
    return profile

@app.delete("/profiles/{profile_id}", status_code=204)
def delete_profile(profile_id: str):
    with sqlite3.connect(DB_PATH) as conn:
        result = conn.execute("DELETE FROM voice_profiles WHERE profile_id = ?", (profile_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Profile not found")

# Short-lived playback diagnostics: no text, audio, profile or personal information.
# Kept in memory only so the developer can trace media events in an embedded preview.
class PlaybackDiagnostic(BaseModel):
    session: str = Field(min_length=1, max_length=64)
    event: Literal['generate_start', 'response', 'generate_error', 'decoded', 'decode_error',
                   'play_request', 'play_rejected', 'playing', 'pause', 'ended', 'media_error', 'progress',
                   'web_audio_start', 'web_audio_error', 'web_audio_signal', 'web_audio_end',
                   'test_tone_start', 'test_tone_signal', 'test_tone_error', 'test_tone_end']
    value: Optional[float] = None
    detail: Optional[str] = Field(default=None, max_length=120)
    muted: Optional[bool] = None
    volume: Optional[float] = Field(default=None, ge=0, le=1)
    position: Optional[float] = Field(default=None, ge=0)
    ready_state: Optional[int] = Field(default=None, ge=0, le=4)
    embedded: Optional[bool] = None

playback_diagnostics = deque(maxlen=100)

@app.post("/engine/playback-diagnostics", status_code=204)
def record_playback_diagnostic(diagnostic: PlaybackDiagnostic):
    playback_diagnostics.append({"timestamp": datetime.now().isoformat(), **diagnostic.model_dump(exclude_none=True)})

@app.get("/engine/playback-diagnostics")
def get_playback_diagnostics():
    return list(playback_diagnostics)

class GenerateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=240)
    profile_id: Optional[str] = Field(default=None, max_length=128)
    identity: Optional[VoiceIdentityProfile] = None
    performance: Optional[PerformanceDirection] = None

@app.get("/engine/vocabulary")
def engine_vocabulary():
    return {"words": sorted(LEXICON), "max_characters": 240,
            "status": "experimental", "note": "Unknown English words use approximate spelling rules; pronunciation and intelligibility are not established."}

@app.post("/engine/generate", response_class=Response)
def generate_speech(request: GenerateRequest):
    if request.identity is not None:
        identity = request.identity.model_dump()
        performance = (request.performance or PerformanceDirection()).model_dump()
    else:
        if not request.profile_id:
            raise HTTPException(status_code=422, detail="Provide a saved profile_id or inline voice identity.")
        profile = get_profile(request.profile_id)
        identity = profile.identity.model_dump()
        performance = (request.performance or profile.performance_defaults).model_dump()
    try:
        audio = synthesize(request.text, identity, performance)
    except UnsupportedText as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
