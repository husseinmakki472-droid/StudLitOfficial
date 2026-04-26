export default function NotesViewer({ data, topic }) {
  const sections = data?.sections || [];
  return (
    <div className="viewer fade-up">
      <div className="viewer-header">
        <div className="viewer-title">{topic || 'Notes'}</div>
        <div className="viewer-badge">📓 {sections.length} Sections</div>
      </div>
      {sections.map((s, i) => (
        <div key={i} className="notes-section" style={{ animationDelay: `${i * 0.05}s` }}>
          <div className="notes-heading">{s.heading}</div>
          {s.content && <p className="notes-content">{s.content}</p>}
          {s.bullets?.length > 0 && (
            <ul className="notes-bullets">
              {s.bullets.map((b, j) => (
                <li key={j} className="notes-bullet">{b}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
