import Link from 'next/link';
import { Button, Card, Space } from 'antd';

export default function ForbiddenPage() {
  return (
    <div style={{ maxWidth: 560 }}>
      <Card>
        <Space orientation="vertical" size={12}>
          <h1 style={{ margin: 0, fontSize: 32, lineHeight: 1.2 }}>403</h1>
          <p style={{ margin: 0 }}>Недостаточно прав для просмотра раздела.</p>
          <Link href="/">
            <Button type="primary">На главную</Button>
          </Link>
        </Space>
      </Card>
    </div>
  );
}
