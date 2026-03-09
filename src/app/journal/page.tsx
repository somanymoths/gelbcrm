import { Card, Col, Row, Tag } from 'antd';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function JournalPage() {
  return (
    <>
      <h1 style={{ marginTop: 0 }}>Журнал занятий</h1>
      <p style={{ color: 'rgba(0, 0, 0, 0.45)' }}>Недельный шаблон, слоты и статусы занятий.</p>

      <Row gutter={[12, 12]}>
        {DAYS.map((day) => (
          <Col key={day} xs={24} sm={12} md={8} xl={6}>
            <Card title={day}>
              <Tag color="default">Нет слотов</Tag>
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
}
