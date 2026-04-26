import { useRouter } from 'next/router';
import { useState } from 'react';
import Layout from '../components/Layout';
import { useStudy } from '../context/StudyContext';

const METHODS = [
  { id: 'notes', icon: '📓', name: 'Notes', desc: 'Organized sections with key points and bullets' },
  { id: 'quiz', icon: '📝', name: 'Multiple Choice', desc: 'Interactive quiz with explanations' },
  { id: 'flashcards', icon: '🃏', name: 'Flashcards', desc: 'Flip cards for active recall practice' },
  { id: 'tutor', icon: '📖', name: 'Tutor Lesson', desc: 'In-depth lesson with explanations' },
  { id: 'summary', icon: '📋', name: 'Summary', desc: 'Key takeaways and must-remember points' },
  { id: 'fitb', icon: '✏️', name: 'Fill in the Blanks', desc: 'Test recall by filling missing words' },
  { id: 'practicetest', icon: '🎯', name: 'Written Test', desc: 'Short-answer questions with sample answers' },
  { id: 'podcast', icon: '🎙️', name: 'Podcast Script', desc: 'Conversational audio-style lesson script' },
  { id: 'keyconcepts', icon: '🔑', name: 'Key Concepts', desc: 'Glossary of important terms and definitions' },
  { id: 'studyplan', icon: '📅', name: 'Study Plan', desc: '7-day schedule to master the material' },
];

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Chinese', 'Japanese', 'Korean', 'Hindi'];

export default function SelectMethods({ theme, toggleTheme }) {
  const router = useRouter();
  const { uploadedFiles, selectedMethods, toggleMethod, language, setLanguage, topic, setTopic, generate } = useStudy();

  async function handleGenerate() {
    await generate();
    router.push('/study');
  }

  return (
    <Layout theme={theme} toggleTheme={toggleTheme}>
      <div className="select-page fade-up">
        <div className="step-header">
          <div className="step-badge">Step 2 of 3</div>
          <h1>What would you like to include?</h1>
        </div>
        <p className="select-subtitle">Choose all the methods you want in your study set</p>

        {/* Optional topic override */}
        <div style={{ marginBottom: 24 }}>
          <input
            type="text"
            placeholder="Topic or subject (optional — leave blank to use file content)"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            style={{
              width: '100%', background: 'var(--surface)', border: '1px solid var(--border2)',
              color: 'var(--text)', padding: '12px 16px', borderRadius: 'var(--radius-sm)',
              fontSize: 14, outline: 'none',
            }}
          />
        </div>

        <div className="methods-grid">
          {METHODS.map(m => (
            <button
              key={m.id}
              className={`method-card${selectedMethods.includes(m.id) ? ' selected' : ''}`}
              onClick={() => toggleMethod(m.id)}
            >
              <div className="method-card-check">✓</div>
              <div className="method-icon">{m.icon}</div>
              <div className="method-name">{m.name}</div>
              <div className="method-desc">{m.desc}</div>
            </button>
          ))}
        </div>

        <div className="select-footer">
          <div className="lang-group">
            <span className="lang-label">🌐 Language:</span>
            <select
              className="lang-select"
              value={language}
              onChange={e => setLanguage(e.target.value)}
            >
              {LANGUAGES.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button className="btn-secondary" onClick={() => router.push('/upload')}>
              ← Back
            </button>
            <button
              className="btn-primary"
              disabled={!selectedMethods.length}
              onClick={handleGenerate}
              style={{ minWidth: 160 }}
            >
              ⚡ Generate Study Set
            </button>
          </div>
        </div>

        {uploadedFiles.length > 0 && (
          <div style={{ marginTop: 20, fontSize: 13, color: 'var(--text2)' }}>
            📎 {uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} uploaded
            {' · '}
            <span style={{ color: 'var(--accent)' }}>
              {selectedMethods.length} method{selectedMethods.length !== 1 ? 's' : ''} selected
            </span>
          </div>
        )}
      </div>
    </Layout>
  );
}
