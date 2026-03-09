export default function JournalPage() {
  return (
    <main className="panel">
      <h2>Журнал занятий</h2>
      <p style={{ color: '#475569' }}>Недельный шаблон, слоты и статусы занятий.</p>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
          <section className="panel" key={d}>
            <strong>{d}</strong>
            <p style={{ color: '#475569' }}>Нет слотов</p>
          </section>
        ))}
      </div>
    </main>
  );
}
