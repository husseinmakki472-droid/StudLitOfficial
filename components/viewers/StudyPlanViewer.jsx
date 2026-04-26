export default function StudyPlanViewer({ data, topic }) {
  const steps = data?.steps || [];
  return (
    <div className="viewer fade-up">
      <div className="viewer-header">
        <div className="viewer-title">{topic || 'Study Plan'}</div>
        <div className="viewer-badge">📅 {data?.totalDays || steps.length} Days</div>
      </div>
      <div className="plan-steps">
        {steps.map((s, i) => (
          <div key={i} className="plan-day" style={{ animationDelay: `${i * 0.04}s` }}>
            <div className="plan-day-badge">Day {s.day || i + 1}</div>
            <div className="plan-day-body">
              <div className="plan-day-title">
                {s.title}
                {s.duration && <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 13, marginLeft: 10 }}>⏱ {s.duration}</span>}
              </div>
              <div className="plan-tasks">
                {(s.tasks || []).map((t, j) => (
                  <div key={j} className="plan-task">{t}</div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
