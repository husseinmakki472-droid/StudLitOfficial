import { useStudy } from '../context/StudyContext';
import { useRouter } from 'next/router';

const METHOD_META = {
  notes:       { icon: '📓', label: 'Notes' },
  quiz:        { icon: '📝', label: 'Quiz' },
  flashcards:  { icon: '🃏', label: 'Flashcards' },
  tutor:       { icon: '📖', label: 'Tutor Lesson' },
  summary:     { icon: '📋', label: 'Summary' },
  fitb:        { icon: '✏️', label: 'Fill in the Blanks' },
  practicetest:{ icon: '🎯', label: 'Written Test' },
  podcast:     { icon: '🎙️', label: 'Podcast' },
  keyconcepts: { icon: '🔑', label: 'Key Concepts' },
  studyplan:   { icon: '📅', label: 'Study Plan' },
  solve:       { icon: '⚡', label: 'Solve' },
};

export default function Sidebar() {
  const { selectedMethods, activeMethod, setActiveMethod, results } = useStudy();
  const router = useRouter();

  return (
    <aside className="workspace-sidebar">
      <div className="sidebar-section">
        <div className="sidebar-section-label">Your Set</div>
        {selectedMethods.map(id => {
          const meta = METHOD_META[id] || { icon: '📄', label: id };
          const hasData = results && results[id];
          return (
            <button
              key={id}
              className={`sidebar-item${activeMethod === id ? ' active' : ''}`}
              onClick={() => setActiveMethod(id)}
            >
              <span className="sidebar-item-icon">{meta.icon}</span>
              <span style={{ flex: 1 }}>{meta.label}</span>
              {results && !hasData && <span style={{ fontSize: 11, color: 'var(--red)' }}>✕</span>}
            </button>
          );
        })}
      </div>

      <div className="sidebar-section" style={{ marginTop: 8 }}>
        <button className="sidebar-add" onClick={() => router.push('/select')}>
          <span>+</span> Add Method
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <div className="sidebar-section" style={{ paddingBottom: 8 }}>
        <button className="sidebar-item" onClick={() => router.push('/upload')} style={{ color: 'var(--text2)' }}>
          <span className="sidebar-item-icon">🔄</span> New Upload
        </button>
      </div>
    </aside>
  );
}
