import { useState } from 'react';

export default function PracticeTestViewer({ data, topic }) {
  const sections = data?.sections || [];
  const [showAnswers, setShowAnswers] = useState({});

  function toggleAnswer(key) {
    setShowAnswers(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const totalQ = sections.reduce((a, s) => a + (s.questions?.length || 0), 0);

  return (
    <div className="viewer fade-up">
      <div className="viewer-header">
        <div className="viewer-title">{topic || 'Practice Test'}</div>
        <div className="viewer-badge">🎯 {totalQ} Questions</div>
      </div>

      {sections.map((sec, si) => (
        <div key={si} className="ptest-section" style={{ animationDelay: `${si * 0.05}s` }}>
          <div className="block-label">
            Section {si + 1} — {(sec.type || 'Questions').replace(/([A-Z])/g, ' $1').trim()}
          </div>
          {(sec.questions || []).map((q, qi) => {
            const key = `${si}-${qi}`;
            return (
              <div key={qi} style={{ marginBottom: 16 }}>
                <div className="ptest-q">Q{qi + 1}. {q.question}</div>
                {q.sampleAnswer && (
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 12, marginTop: 4, padding: '5px 10px' }}
                    onClick={() => toggleAnswer(key)}
                  >
                    {showAnswers[key] ? '▲ Hide answer' : '▼ Show sample answer'}
                  </button>
                )}
                {showAnswers[key] && q.sampleAnswer && (
                  <div className="ptest-answer">{q.sampleAnswer}</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
