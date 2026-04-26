import { useState } from 'react';

export default function FlashcardsViewer({ data, topic }) {
  const cards = data?.cards || [];
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (!cards.length) return (
    <div className="error-card fade-up">
      <div className="error-title">⚠ No cards generated</div>
    </div>
  );

  const card = cards[index];
  const progress = ((index + 1) / cards.length) * 100;

  function next() { setFlipped(false); setIndex(i => Math.min(i + 1, cards.length - 1)); }
  function prev() { setFlipped(false); setIndex(i => Math.max(i - 1, 0)); }

  return (
    <div className="viewer fade-up">
      <div className="viewer-header">
        <div className="viewer-title">{topic || 'Flashcards'}</div>
        <div className="viewer-badge">🃏 {cards.length} Cards</div>
      </div>

      <div className="fc-wrap">
        <div className="fc-progress">
          <div className="fc-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="fc-nav">
          <div className="fc-count">Card {index + 1} of {cards.length}</div>
          <div className="fc-arrows">
            <button className="fc-arrow" onClick={prev} disabled={index === 0}>←</button>
            <button className="fc-arrow" onClick={next} disabled={index === cards.length - 1}>→</button>
          </div>
        </div>

        <div className="fc-card-area" onClick={() => setFlipped(f => !f)}>
          <div className={`fc-card${flipped ? ' flipped' : ''}`}>
            <div className="fc-face">
              <div className="fc-face-label">Question</div>
              <div className="fc-face-text">{card.front}</div>
              <div className="fc-hint">Tap to reveal answer</div>
            </div>
            <div className="fc-face fc-face-back">
              <div className="fc-face-label">Answer</div>
              <div className="fc-face-text">{card.back}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
