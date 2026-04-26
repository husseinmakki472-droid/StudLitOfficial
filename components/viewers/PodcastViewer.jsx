import { useState, useEffect, useRef } from 'react';

export default function PodcastViewer({ data, topic }) {
  const script = data?.script || '';
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const uttRef = useRef(null);

  useEffect(() => {
    setSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
    return () => window.speechSynthesis?.cancel();
  }, []);

  function togglePlay() {
    if (!supported) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    } else {
      const utt = new SpeechSynthesisUtterance(script);
      utt.rate = 0.95;
      utt.onend = () => setSpeaking(false);
      uttRef.current = utt;
      window.speechSynthesis.speak(utt);
      setSpeaking(true);
    }
  }

  return (
    <div className="viewer fade-up">
      <div className="viewer-header">
        <div className="viewer-title">{topic || 'Podcast'}</div>
        <div className="viewer-badge">🎙️ Podcast Script</div>
      </div>

      {supported && (
        <div className="content-block" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            className={speaking ? 'btn-secondary' : 'btn-primary'}
            onClick={togglePlay}
          >
            {speaking ? '⏹ Stop' : '▶ Listen'}
          </button>
          <span style={{ fontSize: 13, color: 'var(--text2)' }}>
            {speaking ? 'Playing via text-to-speech…' : 'Play this script with your device\'s voice'}
          </span>
        </div>
      )}

      <div className="content-block">
        <div className="block-label">Script</div>
        <div className="block-body">
          <p className="podcast-script">{script}</p>
        </div>
      </div>
    </div>
  );
}
