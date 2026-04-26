import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import Link from 'next/link';

export default function Home({ theme, toggleTheme }) {
  return (
    <Layout theme={theme} toggleTheme={toggleTheme}>
      <div className="home-page fade-in">
        <div className="home-hero">
          <div className="home-badge">AI-Powered Study Platform</div>
          <h1 className="home-title">
            Study smarter,<br />not harder.
          </h1>
          <p className="home-sub">
            Upload any lesson, PDF, or notes. StudLit turns it into flashcards, quizzes, a tutor lesson, and more — instantly.
          </p>
          <Link href="/upload" className="btn-primary" style={{ fontSize: 17, padding: '14px 36px' }}>
            Start Studying →
          </Link>
        </div>

        <div className="home-modes">
          {MODES.map(m => (
            <div key={m.id} className="home-mode-card">
              <div className="home-mode-icon">{m.icon}</div>
              <div className="home-mode-name">{m.name}</div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .home-page {
          max-width: 800px; margin: 0 auto;
          padding: 80px 24px 100px;
          display: flex; flex-direction: column; align-items: center;
          text-align: center;
        }
        .home-badge {
          display: inline-block;
          background: rgba(124,92,252,0.12); border: 1px solid rgba(124,92,252,0.3);
          color: var(--accent); font-size: 13px; font-weight: 600;
          padding: 5px 14px; border-radius: 99px; margin-bottom: 20px;
        }
        .home-title {
          font-family: var(--font-head); font-size: 56px; font-weight: 800;
          line-height: 1.1; margin-bottom: 20px;
          background: linear-gradient(135deg, var(--text) 40%, var(--accent2));
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .home-sub { color: var(--text2); font-size: 18px; line-height: 1.6; max-width: 540px; margin-bottom: 36px; }
        .home-modes {
          display: flex; flex-wrap: wrap; justify-content: center; gap: 12px;
          margin-top: 56px;
        }
        .home-mode-card {
          background: var(--surface); border: 1px solid var(--border);
          border-radius: var(--radius); padding: 16px 20px;
          display: flex; align-items: center; gap: 10px;
          font-size: 14px; font-weight: 500;
          transition: var(--transition);
        }
        .home-mode-card:hover { border-color: var(--accent); transform: translateY(-2px); }
        .home-mode-icon { font-size: 20px; }
        @media (max-width: 640px) {
          .home-title { font-size: 38px; }
          .home-sub { font-size: 16px; }
        }
      `}</style>
    </Layout>
  );
}

const MODES = [
  { id: 'notes', icon: '📓', name: 'Notes' },
  { id: 'quiz', icon: '📝', name: 'Quiz' },
  { id: 'flashcards', icon: '🃏', name: 'Flashcards' },
  { id: 'tutor', icon: '📖', name: 'Tutor Lesson' },
  { id: 'summary', icon: '📋', name: 'Summary' },
  { id: 'fitb', icon: '✏️', name: 'Fill in the Blanks' },
  { id: 'podcast', icon: '🎙️', name: 'Podcast' },
  { id: 'practicetest', icon: '🎯', name: 'Written Test' },
];
