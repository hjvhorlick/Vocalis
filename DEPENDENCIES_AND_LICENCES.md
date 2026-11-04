# DEPENDENCIES AND LICENCES — VOCALIS
## Version 2.0
**Last Updated:** 2026-11-04

### 3. Independent Technology Policy (Directive Part B, Section 3)
**Mandatory:** Every dependency must be recorded.
**Prohibited Dependencies (Vocalis speech-engine):**
- Piper source code
- Piper models
- Piper model weights
- Piper voice data
- Piper-derived hidden components
- Existing commercial TTS engines (actual generator)
- External speech-generation APIs
- External AI tokens for speech generation
- Unlicensed pretrained speech models
- Code copied from other speech engines and renamed

**Allowed Dependencies (with licence permitting commercial use):**
- Ordinary development libraries
- Scientific/mathematical libraries
- Acoustic processing libraries (non-proprietary)
- Web framework libraries (React, TypeScript, Vite, FastAPI)
- Database libraries (SQLite)
- Audio processing utilities (FFmpeg - if installed/licensed)
- Testing frameworks

### Dependency Register Template
```json
{
  "dependency_name": "string",
  "version": "string",
  "type": "frontend|backend|engine|development|test",
  "licence": "string (MIT|Apache-2.0|BSD|GPL|Commercial|etc.)",
  "commercial_usage_permitted": "boolean",
  "purpose": "string",
  "source": "string (npm|pip|github|local)",
  "last_verified": "ISO8601",
  "notes": "string (independence compliance, restrictions)"
}
```

### Current Dependencies (Stage 1 - Initial Inspection)
1. **Python 3.11.2**
   - Type: Development environment
   - Licence: Python Software Foundation Licence (commercial use permitted)
   - Purpose: Backend, Engine, Scripts
   - Source: System
   - Last Verified: 2026-11-04
   - Notes: Independent implementation base

2. **Node.js 22.22.3**
   - Type: Development environment
   - Licence: MIT (commercial use permitted)
   - Purpose: Frontend development
   - Source: System
   - Last Verified: 2026-11-04
   - Notes: Independent implementation base

3. **npm 10.9.8**
   - Type: Development environment
   - Licence: MIT (commercial use permitted)
   - Purpose: Frontend package management
   - Source: System
   - Last Verified: 2026-11-04
   - Notes: Independent implementation base

4. **Git**
   - Type: Development environment
   - Licence: GPL-2.0 (development tool, not engine dependency)
   - Purpose: Version control
   - Source: System
   - Last Verified: 2026-11-04
   - Notes: Repository management only

### Planned Dependencies (Stage 1 - Foundation)
1. **React** (Frontend) - MIT - Commercial use permitted
2. **TypeScript** (Frontend) - Apache-2.0 - Commercial use permitted
3. **Vite** (Frontend) - MIT - Commercial use permitted
4. **FastAPI** (Backend) - MIT - Commercial use permitted
5. **SQLite** (Backend/Data) - Public Domain - Commercial use permitted
6. **Pytest** (Tests) - MIT - Commercial use permitted
7. **NumPy/SciPy** (Engine/Acoustics) - BSD - Commercial use permitted (verify)
8. **FFmpeg** (Audio) - LGPL/GPL - Commercial use permitted (verify installation)

### Independence Compliance (Directive Part B, Section 3 & Part Q, Section 39)
- [ ] No Piper dependencies in `engine/vocalis_engine/`
- [ ] No external TTS API dependencies
- [ ] No external AI token dependencies
- [ ] All development libraries have commercial usage permits
- [ ] Source code history maintained (Git)
- [ ] Research records maintained (RESEARCH_REGISTER.md)
- [ ] Architecture versions tracked (ARCHITECTURE.md)
- [ ] Technical decisions recorded (TECHNICAL_DECISIONS.md)
- [ ] Dataset records maintained (DATASETS_AND_RIGHTS.md)
- [ ] Model versions tracked (MODEL_REGISTER.md)
- [ ] Test results recorded (TEST_RESULTS.md)
- [ ] Intellectual property review recommended for new methods (Directive Part Q, Section 39)

### Current Status (Stage 1)
- **Dependencies Registered:** Environment tools (Python, Node, npm, Git)
- **Planned Dependencies:** React, TypeScript, Vite, FastAPI, SQLite, Pytest, NumPy/SciPy (Stage 1)
- **Independence Verification:** Pending for engine modules (Stage 4)
- **Next Task:** Initialize frontend/backend/engine with planned dependencies (Stage 1)
