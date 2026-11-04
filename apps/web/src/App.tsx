import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';

// Screens (Placeholders for Stage 2)
const Dashboard = () => (
  <div className="screen">
    <h1>Vocalis Dashboard</h1>
    <div className="shortcuts">
      <Link to="/studio" className="btn">Create Voice</Link>
      <Link to="/library" className="btn">Voice Library</Link>
      <Link to="/tts" className="btn">Text-to-Speech Studio</Link>
    </div>
    <p>Welcome to Vocalis — Independent Speech-Generation Platform (Version 2.0)</p>
    <p><strong>Status:</strong> Stage 1 Foundation Complete. Stage 2 Interface Connecting.</p>
    <p><strong>Live Preview:</strong> Working. API connected at http://127.0.0.1:8000</p>
  </div>
);

const VoiceCreationStudio = () => (
  <div className="screen">
    <h1>Voice Creation Studio</h1>
    <p>Stage 2: Personality selection, Identity controls, Pitch/Depth, Texture, Resonance, Accent, Articulation, Pace, Emotion, Breathing/Pauses.</p>
    <p>Status: Interface shell (Engine connection in Stage 4)</p>
    <Link to="/" className="btn">Back to Dashboard</Link>
  </div>
);

const PersonalityPresets = () => (
  <div className="screen">
    <h1>Personality Presets</h1>
    <ul>
      <li>Documentary Narrator</li>
      <li>Storyteller</li>
      <li>Conversational</li>
      <li>News Presenter</li>
      <li>Educational Presenter</li>
      <li>Audiobook Narrator</li>
    </ul>
    <Link to="/" className="btn">Back to Dashboard</Link>
  </div>
);

const AdvancedControls = () => (
  <div className="screen">
    <h1>Advanced Controls</h1>
    <p>Detailed adjustment of voice parameters (Experimental/Unavailable)</p>
    <Link to="/" className="btn">Back to Dashboard</Link>
  </div>
);

const VoiceLibrary = () => (
  <div className="screen">
    <h1>Voice Library</h1>
    <p>Save, Rename, Edit, Duplicate, Delete, Import, Export, Reuse</p>
    <Link to="/" className="btn">Back to Dashboard</Link>
  </div>
);

const TextToSpeechStudio = () => (
  <div className="screen">
    <h1>Text-to-Speech Studio</h1>
    <p>Enter text, Select voice, Select performance, Generate, Preview, Regenerate, Export</p>
    <p>Status: Interface shell (Engine connection in Stage 4)</p>
    <Link to="/" className="btn">Back to Dashboard</Link>
  </div>
);

const Settings = () => (
  <div className="screen">
    <h1>Settings</h1>
    <p>Audio, Application, User settings</p>
    <Link to="/" className="btn">Back to Dashboard</Link>
  </div>
);

function App() {
  return (
    <Router>
      <div className="vocalis-app">
        <nav className="navbar">
          <h2>VOCALIS</h2>
          <div className="nav-links">
            <Link to="/">Dashboard</Link>
            <Link to="/studio">Studio</Link>
            <Link to="/presets">Presets</Link>
            <Link to="/library">Library</Link>
            <Link to="/tts">TTS Studio</Link>
            <Link to="/settings">Settings</Link>
          </div>
        </nav>
        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/studio" element={<VoiceCreationStudio />} />
            <Route path="/presets" element={<PersonalityPresets />} />
            <Route path="/advanced" element={<AdvancedControls />} />
            <Route path="/library" element={<VoiceLibrary />} />
            <Route path="/tts" element={<TextToSpeechStudio />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
export const PREVIEW_HOST = '5173-ig36biymqf4ashthbb4mp.e2b.app';
