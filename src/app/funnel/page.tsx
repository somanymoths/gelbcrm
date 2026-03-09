const STAGES = [
  'Заинтересовался',
  'Квалификация',
  'Знакомство',
  'Оплата',
  'На занятиях',
  'Последнее занятие',
  'Отказался',
  'Перестал заниматься'
];

export default function FunnelPage() {
  return (
    <main className="panel">
      <h2>Воронка</h2>
      <p style={{ color: '#475569' }}>Канбан с этапами и карточками учеников.</p>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {STAGES.map((stage) => (
          <section key={stage} className="panel">
            <strong>{stage}</strong>
            <p style={{ color: '#475569' }}>0 учеников</p>
          </section>
        ))}
      </div>
    </main>
  );
}
