# MODEL REGISTER — VOCALIS
## Version 2.0
**Last Updated:** 2026-11-04

### 20. Learning System Overview (Directive Part I, Section 20)
**Objective:** Independently developed trainable models to improve physical simulation aspects.
**Approach:** Lightweight architectures suitable for low-spec hardware (Intel Celeron N3350, 3.7GB RAM). Separate training for GPU.
**Location:** `models/` (configs, training, evaluation)

### 21. Separate Learning Tasks (Directive Part I, Section 21)

#### Model A: Duration predictor
- **Task:** Predict phoneme/syllable durations from linguistic context
- **Architecture:** Feed-forward / Recurrent (lightweight)
- **Input:** Normalised text, linguistic analysis, phoneme structure
- **Output:** Duration values (D(t))
- **Status:** Not yet implemented (Stage 8)
- **Training Data:** Licensed datasets with timing annotations (Stage 8)
- **Evaluation:** Duration accuracy, naturalness
- **Location:** `models/training/model_a_duration/`

#### Model B: Prosody predictor
- **Task:** Predict pitch, energy, rhythm from text and performance direction
- **Architecture:** Sequence model / Transformer (lightweight)
- **Input:** Sentence/phrase/word/syllable/phoneme structure, performance direction
- **Output:** F0(t), E(t), rhythm parameters
- **Status:** Not yet implemented (Stage 8)
- **Training Data:** Licensed datasets with prosody annotations (Stage 8)
- **Evaluation:** Pitch contour accuracy, energy variation, rhythm naturalness
- **Location:** `models/training/model_b_prosody/`

#### Model C: Articulation transition predictor
- **Task:** Learn neighbouring phoneme influence
- **Architecture:** Convolutional / Recurrent (lightweight)
- **Input:** Phoneme sequence, identity parameters
- **Output:** Articulation transition targets (A(t))
- **Status:** Not yet implemented (Stage 8)
- **Training Data:** Licensed datasets with articulation annotations (Stage 8)
- **Evaluation:** Transition smoothness, intelligibility
- **Location:** `models/training/model_c_articulation/`

#### Model D: Acoustic refinement
- **Task:** Improve acoustic output from physical/signal-processing system
- **Architecture:** Differentiable DSP / Neural acoustic refinement (lightweight)
- **Input:** Raw waveform, control variables
- **Output:** Refined waveform
- **Status:** Not yet implemented (Stage 8)
- **Training Data:** Synthetic material + licensed datasets (Stage 8)
- **Evaluation:** Signal-to-noise, harmonic structure, naturalness
- **Location:** `models/training/model_d_refinement/`

#### Model E: Natural variation planner
- **Task:** Learn appropriate variation while maintaining identity
- **Architecture:** Feed-forward / Sequence (lightweight)
- **Input:** Identity Profile, Performance Direction
- **Output:** Variation parameters (pitch, timing, energy, breathiness, articulation)
- **Status:** Not yet implemented (Stage 8)
- **Training Data:** Licensed datasets with variation annotations (Stage 8)
- **Evaluation:** Identity consistency, naturalness, variation appropriateness
- **Location:** `models/training/model_e_variation/`

### Model Configuration Format (Directive Part L, Section 29 & Part I, Section 23)
```json
{
  "model_id": "string",
  "model_type": "duration|prosody|articulation|refinement|variation",
  "version": "string (e.g., 1.0.0)",
  "architecture": "string (feed-forward|convolutional|recurrent|sequence|transformer|differentiable-dsp)",
  "training_config": {
    "dataset_id": "string",
    "epochs": "integer",
    "batch_size": "integer",
    "learning_rate": "float",
    "optimizer": "string",
    "loss_function": "string"
  },
  "hardware": {
    "training": "string (CPU|GPU|rental)",
    "inference": "string (CPU|Browser|GPU)"
  },
  "evaluation": {
    "metrics": "array[string]",
    "baseline_performance": "object",
    "current_performance": "object",
    "validation_score": "float"
  },
  "checkpoint_path": "string",
  "created_at": "ISO8601",
  "updated_at": "ISO8601",
  "licence": "string (independent implementation)",
  "commercial_usage_rights": "confirmed"
}
```

### Training and Inference Separation (Directive Part I, Section 23)
- **Training:** Separate scripts, rented GPU environments (later), reproducible, secure storage, version recording, validation before deployment
- **Inference:** Optimised for practical use, CPU execution (primary), Browser execution (investigate), low memory usage
- **Location:** `scripts/training/` (training scripts), `engine/vocalis_engine/refinement/` (inference)

### Model Register Maintenance
- **Record:** Architecture versions, training information, evaluation results
- **Separate Facts from Hypotheses:** Documented above
- **Commercial Usage Rights:** Must be confirmed for each model (Directive Part I, Section 22)
- **Intellectual Property:** Review recommended for new methods (Directive Part Q, Section 39)

### Current Status (Stage 1)
- **Models Registered:** None yet (Stage 8 requirement)
- **Baseline Performance:** Not yet measured (Stage 8 requirement)
- **Evaluation Metrics:** Not yet defined (Stage 8 requirement)
- **Next Task:** Establish training objective and baseline in Stage 8 (Directive Part I, Section 22)
