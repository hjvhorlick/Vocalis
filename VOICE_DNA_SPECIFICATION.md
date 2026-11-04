# VOICE DNA SPECIFICATION — VOCALIS
## Version 2.0
**Last Updated:** 2026-11-04

### 8. Voice DNA (Directive Part D)
Internal representation of constructed voice identity. Separate from temporary performance instructions.

### 8.1 Voice Identity Profile (Stable Characteristics)
```json
{
  "profile_id": "string (unique-id)",
  "profile_version": "integer (1+)",
  "name": "string",
  "preset": "string (documentary|storyteller|conversational|news|educational|audiobook)",
  "identity": {
    "pitch": {
      "level": "enum (low|medium-low|medium|medium-high|high)",
      "fine_adjustment": "float (-1.0 to 1.0)",
      "centre": "float (Hz)"
    },
    "depth": {
      "level": "enum (shallow|medium|deep)",
      "resonance_contribution": "float (0.0 to 1.0)",
      "spectral_character": "string"
    },
    "resonance": {
      "vocal_tract_configuration": "object",
      "formant_frequencies": "array[float]",
      "spectral_envelope": "object"
    },
    "texture": {
      "characteristics": "array[enum (warm|smooth|soft|clear|rich|breathy|bright|raspy)]",
      "intensity": "float (0.0 to 1.0)"
    },
    "articulation": {
      "style": "enum (relaxed|neutral|clear|crisp|precise)",
      "transition_planning": "boolean"
    },
    "accent": {
      "language": "string (en-US default)",
      "configuration": "object",
      "pronunciation_rules": "array"
    },
    "breathiness": {
      "frequency": "float",
      "intensity": "float",
      "contextual": "boolean"
    },
    "natural_variation": {
      "pitch_range": "float",
      "timing_range": "float",
      "energy_range": "float",
      "articulation_range": "float"
    },
    "vocal_age_character": {
      "type": "enum (youthful|mature|older)",
      "intensity": "float"
    },
    "personality_starting_point": "string"
  },
  "created_at": "ISO8601 timestamp",
  "updated_at": "ISO8601 timestamp"
}
```

### 8.2 Performance Direction (Temporary Instructions)
```json
{
  "performance_id": "string",
  "emotion": "enum (neutral|friendly|calm|confident|excited|serious|gentle|dramatic|concerned|reflective)",
  "speaking_pace": {
    "speed": "float (0.5 to 2.0)",
    "preserve_phoneme_duration": "boolean",
    "syllable_timing": "boolean"
  },
  "energy": "float (0.0 to 1.0)",
  "loudness": "float (0.0 to 1.0)",
  "pitch_range_adjustment": "float (-1.0 to 1.0)",
  "pitch_movement": "object",
  "sentence_emphasis": "array[string]",
  "word_emphasis": "array[string]",
  "pauses": {
    "duration": "float",
    "style": "string"
  },
  "breathing": {
    "frequency": "float",
    "intensity": "float"
  },
  "dramatic_intensity": "float",
  "conversational_delivery": "boolean",
  "expressiveness": "float"
}
```

### 10. Six Initial Personality Starting Points (Directive Part E)
1. **Documentary Narrator**: Mature, Warm, Clear, Controlled, Confident, Moderate/Deep pitch, Measured delivery, Natural emphasis, Professional
2. **Storyteller**: Warm, Expressive, Flexible emotional range, Natural pauses, Varied pitch, Engaging rhythm, Gentle/Dramatic
3. **Conversational**: Friendly, Natural, Relaxed, Medium pitch, Informal articulation, Flexible timing, Less rigid
4. **News Presenter**: Clear, Professional, Controlled, Confident, Precise articulation, Consistent pacing, Appropriate emphasis
5. **Educational Presenter**: Clear, Patient, Approachable, Explanatory, Natural pauses, Understandable pronunciation
6. **Audiobook Narrator**: Consistent, Comfortable, Natural rhythm, Expressive (not theatrical), Good transitions, Breathing/Pauses

### 24. Initial Identity Targets (Directive Part J)
- **Voice A (Documentary)**: Mature, Warm, Deep, Clear, Rich resonance, Calm, Confident, Measured
- **Voice B (Conversational)**: Medium pitch, Friendly, Lively, Relaxed, Natural articulation, Flexible rhythm, Expressive
- **Voice C (Storyteller)**: Gentle, Warm, Soft, Expressive, Flexible pitch, Natural pauses, Emotional range

### 29. Profile Format (Directive Part L)
Versioned JSON format with validation, ranges, defaults, migration rules. Portable, independent of web session. No stored recordings as substitute for configuration.

### Validation Rules
- Pitch range: 80Hz - 800Hz (adjustable)
- Depth: 0.0 - 1.0 resonance contribution
- Texture intensity: 0.0 - 1.0
- Pace speed: 0.5x - 2.0x
- Energy/Loudness: 0.0 - 1.0
- Profile version: Incremental migration support

### Implemented profile subset (2026-11-04)
API profile version 1 currently validates pitch centre (80–800 Hz), pitch fine adjustment (−1–1), depth/resonance contribution, resonance brightness, texture intensity, articulation precision and breathiness intensity (all 0–1). Performance defaults include speaking pace (0.5–2), a defined emotion list, energy, loudness, expressiveness and dramatic intensity (0–1), and pitch-range adjustment (−1–1). Omitted fields receive defaults. Six presets provide editable starting parameter values; they are not trained voices and their sonic effects are not yet known. Identity and performance defaults are stored separately.

Legacy version 1 profiles with the earlier `level` fields can still be read: those fields are retained but are not converted to physical parameters; newly introduced numerical parameters receive defaults. No automatic conversion is claimed. Unsupported profile versions are rejected. Complete validation for other legacy fields, migrations beyond version 1, pronunciation and real engine interpretation remain future work.
