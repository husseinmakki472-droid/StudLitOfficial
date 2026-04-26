export default function KeyConceptsViewer({ data, topic }) {
  const concepts = data?.concepts || [];
  return (
    <div className="viewer fade-up">
      <div className="viewer-header">
        <div className="viewer-title">{topic || 'Key Concepts'}</div>
        <div className="viewer-badge">🔑 {concepts.length} Terms</div>
      </div>
      <div className="concept-grid">
        {concepts.map((c, i) => (
          <div key={i} className="concept-card" style={{ animationDelay: `${i * 0.04}s` }}>
            <div className="concept-term">{c.term}</div>
            <div className="concept-def">{c.definition}</div>
            {c.importance && <div className="concept-importance">{c.importance}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
