export default function SolveViewer({ data, topic }) {
  return (
    <div className="viewer fade-up">
      <div className="viewer-header">
        <div className="viewer-title">{topic || 'Solution'}</div>
        <div className="viewer-badge">⚡ Solve</div>
      </div>

      {data?.quickAnswer && (
        <div className="content-block">
          <div className="block-label">Quick Answer</div>
          <div className="block-body"><p>{data.quickAnswer}</p></div>
        </div>
      )}

      {data?.stepByStep?.length > 0 && (
        <div className="content-block">
          <div className="block-label">Step by Step</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 8 }}>
            {data.stepByStep.map((s, i) => (
              <div key={i} className="solve-step">
                <div className="solve-step-num">{s.step || i + 1}</div>
                <div className="solve-step-body">
                  <div className="solve-step-title">{s.title}</div>
                  <div className="solve-step-content">{s.content}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.examples?.length > 0 && (
        <div className="content-block">
          <div className="block-label">Examples</div>
          <div className="block-body">
            <ul>{data.examples.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        </div>
      )}

      {data?.keyInsight && (
        <div className="content-block" style={{ background: 'rgba(124,92,252,0.06)', borderColor: 'rgba(124,92,252,0.2)' }}>
          <div className="block-label">Key Insight</div>
          <div className="block-body"><p>📌 {data.keyInsight}</p></div>
        </div>
      )}
    </div>
  );
}
