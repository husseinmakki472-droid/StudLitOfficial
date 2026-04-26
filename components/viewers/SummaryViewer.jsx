export default function SummaryViewer({ data, topic }) {
  return (
    <div className="viewer fade-up">
      <div className="viewer-header">
        <div className="viewer-title">{topic || 'Summary'}</div>
        <div className="viewer-badge">📋 Summary</div>
      </div>

      {data?.overview && (
        <div className="content-block">
          <div className="block-label">Overview</div>
          <div className="block-body"><p>{data.overview}</p></div>
        </div>
      )}

      {data?.keyPoints?.length > 0 && (
        <div className="content-block">
          <div className="block-label">Key Takeaways</div>
          <ul className="kp-list">
            {data.keyPoints.map((p, i) => (
              <li key={i} className="kp-item">
                <span className="kp-dot" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data?.mustRemember && (
        <div className="must-remember">
          <div className="block-label">⭐ Must Remember</div>
          <div className="block-body" style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>
            {data.mustRemember}
          </div>
        </div>
      )}
    </div>
  );
}
