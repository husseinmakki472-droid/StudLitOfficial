import { useState, useRef, useEffect } from 'react';

export default function ChatPanel({ context, topic }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `Hi! I'm your StudLit tutor. Ask me anything about ${topic || 'this material'}.` }
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update greeting when topic changes
  useEffect(() => {
    if (topic) {
      setMessages([{ role: 'assistant', content: `Hi! I'm your StudLit tutor. Ask me anything about ${topic}.` }]);
    }
  }, [topic]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);
    try {
      const res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages.slice(-8),
          context: context || '',
        }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'Sorry, I had trouble with that.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error — please try again.' }]);
    } finally {
      setSending(false);
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <span>🤖</span> Ask AI Tutor
      </div>

      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg${m.role === 'user' ? ' user' : ''}`}>
            <div className={`chat-avatar${m.role === 'assistant' ? ' ai' : ' user'}`}>
              {m.role === 'assistant' ? '🤖' : '👤'}
            </div>
            <div className="chat-bubble">{m.content}</div>
          </div>
        ))}
        {sending && (
          <div className="chat-msg">
            <div className="chat-avatar ai">🤖</div>
            <div className="chat-bubble" style={{ color: 'var(--text2)' }}>
              <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-wrap">
        <textarea
          className="chat-input"
          rows={1}
          placeholder="Ask me anything about the material…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
        />
        <button className="chat-send" onClick={send} disabled={sending || !input.trim()}>
          ↑
        </button>
      </div>
    </div>
  );
}
