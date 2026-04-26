import { useState } from 'react';

export default function QuizViewer({ data, topic }) {
  const questions = data?.questions || [];
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [done, setDone] = useState(false);

  if (!questions.length) return (
    <div className="error-card fade-up">
      <div className="error-title">⚠ No questions generated</div>
      <div className="error-body">Try generating with only Quiz selected so the AI can focus the full response on questions.</div>
    </div>
  );

  if (done) return (
    <div className="viewer fade-up">
      <div className="viewer-header">
        <div className="viewer-title">{topic || 'Quiz'}</div>
        <div className="viewer-badge">📝 Complete</div>
      </div>
      <div className="content-block quiz-score-card">
        <div className="quiz-score-num">{score}/{questions.length}</div>
        <div className="quiz-score-label">
          {score === questions.length ? '🎉 Perfect score!' : score >= questions.length * 0.7 ? '✅ Great job!' : '📚 Keep studying!'}
        </div>
        <button
          className="btn-primary"
          style={{ marginTop: 24 }}
          onClick={() => { setCurrent(0); setScore(0); setPicked(null); setDone(false); }}
        >
          Try Again
        </button>
      </div>
    </div>
  );

  const q = questions[current];
  const letters = ['A', 'B', 'C', 'D'];
  const progress = (current / questions.length) * 100;

  function select(idx) {
    if (picked !== null) return;
    setPicked(idx);
    if (idx === q.correct) setScore(s => s + 1);
    setTimeout(() => {
      if (current + 1 >= questions.length) setDone(true);
      else { setCurrent(c => c + 1); setPicked(null); }
    }, 1600);
  }

  return (
    <div className="viewer fade-up">
      <div className="viewer-header">
        <div className="viewer-title">{topic || 'Quiz'}</div>
        <div className="viewer-badge">📝 {current + 1}/{questions.length}</div>
      </div>
      <div className="content-block quiz-wrap">
        <div className="quiz-progress">
          <div className="quiz-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="quiz-q-num">Question {current + 1} of {questions.length}</div>
        <div className="quiz-question">{q.question}</div>
        <div className="quiz-options">
          {(q.options || []).map((opt, i) => {
            let cls = 'quiz-option';
            if (picked !== null) {
              if (i === q.correct) cls += ' correct';
              else if (i === picked) cls += ' wrong';
            }
            return (
              <button key={i} className={cls} onClick={() => select(i)}>
                <span className="quiz-option-letter">{letters[i]}</span>
                <span>{opt}</span>
              </button>
            );
          })}
        </div>
        {picked !== null && q.explanation && (
          <div className="quiz-explanation">💡 {q.explanation}</div>
        )}
      </div>
    </div>
  );
}
