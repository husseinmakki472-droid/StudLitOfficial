import Link from 'next/link';
import { useStudy } from '../context/StudyContext';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';
import NotesViewer from './viewers/NotesViewer';
import QuizViewer from './viewers/QuizViewer';
import FlashcardsViewer from './viewers/FlashcardsViewer';
import TutorViewer from './viewers/TutorViewer';
import SummaryViewer from './viewers/SummaryViewer';
import FITBViewer from './viewers/FITBViewer';
import KeyConceptsViewer from './viewers/KeyConceptsViewer';
import PracticeTestViewer from './viewers/PracticeTestViewer';
import SolveViewer from './viewers/SolveViewer';
import StudyPlanViewer from './viewers/StudyPlanViewer';
import PodcastViewer from './viewers/PodcastViewer';

const VIEWERS = {
  notes: NotesViewer,
  quiz: QuizViewer,
  flashcards: FlashcardsViewer,
  tutor: TutorViewer,
  summary: SummaryViewer,
  fitb: FITBViewer,
  keyconcepts: KeyConceptsViewer,
  practicetest: PracticeTestViewer,
  solve: SolveViewer,
  studyplan: StudyPlanViewer,
  podcast: PodcastViewer,
};

export default function StudyWorkspace({ theme, toggleTheme }) {
  const { results, loading, error, selectedMethods, activeMethod, topic, uploadedFiles } = useStudy();

  const fileContext = uploadedFiles
    .filter(f => f.textContent)
    .map(f => f.textContent.slice(0, 2000))
    .join('\n\n');

  return (
    <div style={{ paddingTop: 'var(--header-h)' }}>
      {/* Header bar */}
      <div className="ws-topbar">
        <div className="ws-topbar-left">
          <Link href="/" className="ws-logo">Stud<span>Lit</span></Link>
          {topic && <div className="ws-topic-badge">{topic}</div>}
        </div>
        <div className="ws-topbar-right">
          <Link href="/select" className="btn-ghost" style={{ fontSize: 13 }}>← New Set</Link>
          <button className="theme-toggle" onClick={toggleTheme}>{theme === 'dark' ? '☀️' : '🌙'}</button>
        </div>
      </div>

      <div className="workspace">
        <Sidebar />

        <main className="workspace-main">
          <div className="workspace-content">
            {loading && <LoadingState />}
            {error && (
              <div className="error-card fade-up">
                <div className="error-title">⚠ Generation failed</div>
                <div className="error-body">{error}</div>
                <Link href="/select" style={{ display: 'inline-block', marginTop: 12, color: 'var(--accent)', fontSize: 14 }}>
                  ← Try again
                </Link>
              </div>
            )}
            {!loading && !error && results && activeMethod && (() => {
              const data = results[activeMethod];
              const Viewer = VIEWERS[activeMethod];
              if (!Viewer) return <div className="error-card"><div className="error-body">No viewer for "{activeMethod}"</div></div>;
              if (!data) return (
                <div className="error-card fade-up">
                  <div className="error-title">⚠ {activeMethod}</div>
                  <div className="error-body">No data was returned for this method. Try generating again with only this method selected.</div>
                </div>
              );
              return <Viewer data={data} topic={topic} />;
            })()}
            {!loading && !error && !results && (
              <div className="loading-state">
                <div style={{ fontSize: 40 }}>📚</div>
                <p>Your study set will appear here after generation.</p>
                <Link href="/select" className="btn-primary" style={{ marginTop: 8 }}>Start Studying →</Link>
              </div>
            )}
          </div>
        </main>

        <aside className="workspace-chat">
          <ChatPanel context={fileContext} topic={topic} />
        </aside>
      </div>

      <style jsx>{`
        .ws-topbar {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          height: var(--header-h);
          background: rgba(15,15,19,0.9);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 20px; gap: 16px;
        }
        :global([data-theme="light"]) .ws-topbar { background: rgba(240,240,248,0.9); }
        .ws-topbar-left, .ws-topbar-right { display: flex; align-items: center; gap: 12px; }
        .ws-logo {
          font-family: var(--font-head); font-size: 20px; font-weight: 800;
          background: linear-gradient(135deg, #fff 30%, var(--accent2));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        :global([data-theme="light"]) .ws-logo {
          background: linear-gradient(135deg, #1a1a2e 30%, var(--accent));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .ws-logo :global(span) { color: var(--accent2); -webkit-text-fill-color: var(--accent2); }
        .ws-topic-badge {
          font-size: 13px; color: var(--text2);
          background: var(--surface2); border: 1px solid var(--border);
          padding: 4px 12px; border-radius: 99px;
          max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .workspace { display: flex; height: calc(100vh - var(--header-h)); overflow: hidden; }
        .workspace-main { flex: 1; overflow-y: auto; background: var(--bg); }
        .workspace-content { padding: 28px; max-width: 820px; }
        .workspace-chat { width: var(--chat-w); background: var(--bg2); border-left: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
        @media (max-width: 900px) { .workspace-chat { display: none; } }
      `}</style>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-state fade-in">
      <div className="spinner" />
      <p>Processing content…</p>
      <p style={{ fontSize: 13, marginTop: 4 }}>This usually takes 10–20 seconds</p>
    </div>
  );
}
