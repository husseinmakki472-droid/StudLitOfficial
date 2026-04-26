function sanitize(str) {
  return (str || '')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/<(?!\/?strong\b)[^>]*>/gi, '');
}

export default function TutorViewer({ data, topic }) {
  const sections = data?.sections || [];
  const title = data?.title || topic || 'Tutor Lesson';

  return (
    <div className="viewer fade-up">
      <div className="viewer-header">
        <div className="viewer-title">{topic || title}</div>
        <div className="viewer-badge">📖 {sections.length} Sections</div>
      </div>

      <div className="tutor-lesson">
        <h1 className="lesson-title">{title}</h1>
        {sections.map((s, i) => {
          const paras = Array.isArray(s.paragraphs) && s.paragraphs.length
            ? s.paragraphs
            : s.content ? [s.content] : [];
          return (
            <div key={i} className="lesson-section" style={{ animationDelay: `${i * 0.07}s` }}>
              <h2 className="lesson-section-heading">{s.heading}</h2>
              {paras.map((p, j) => (
                <p
                  key={j}
                  className="lesson-paragraph"
                  dangerouslySetInnerHTML={{ __html: sanitize(p) }}
                />
              ))}
              {s.keyTakeaway && (
                <div className="lesson-takeaway">
                  📌 {s.keyTakeaway}
                </div>
              )}
              {s.thinkAboutIt && (
                <div className="lesson-think">
                  <span className="lesson-think-label">Think About It</span>
                  <p className="lesson-think-q">{s.thinkAboutIt}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
