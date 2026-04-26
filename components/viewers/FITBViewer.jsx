import { useState } from 'react';

export default function FITBViewer({ data, topic }) {
  const sentences = data?.sentences || [];
  const [revealed, setRevealed] = useState({});

  function reveal(si, bi) {
    setRevealed(prev => ({ ...prev, [`${si}-${bi}`]: true }));
  }

  return (
    <div className="viewer fade-up">
      <div className="viewer-header">
        <div className="viewer-title">{topic || 'Fill in the Blanks'}</div>
        <div className="viewer-badge">✏️ {sentences.length} Sentences</div>
      </div>

      <div className="content-block">
        <div className="block-label">Tap the blanks to reveal answers</div>
        {sentences.map((item, si) => {
          const parts = (item.text || '').split('___');
          const blanks = item.blanks || [];
          return (
            <p key={si} className="fitb-sentence" style={{ marginBottom: 16 }}>
              {parts.map((part, pi) => (
                <span key={pi}>
                  {part}
                  {pi < parts.length - 1 && (
                    <span
                      className={`fitb-blank${revealed[`${si}-${pi}`] ? ' revealed' : ''}`}
                      onClick={() => reveal(si, pi)}
                    >
                      {revealed[`${si}-${pi}`] ? blanks[pi] : '______'}
                    </span>
                  )}
                </span>
              ))}
            </p>
          );
        })}
      </div>
    </div>
  );
}
