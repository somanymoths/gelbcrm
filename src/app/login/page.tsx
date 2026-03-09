import { redirect } from 'next/navigation';
import { Card, Space } from 'antd';
import { LoginForm } from '@/components/login-form';
import { getCurrentSession } from '@/lib/auth';

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) {
    redirect(session.role === 'admin' ? '/funnel' : '/journal');
  }

  return (
    <div style={{ maxWidth: 520, margin: '24px auto' }}>
      <Card>
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <h1 style={{ margin: '0 0 8px', fontSize: 30, lineHeight: 1.2 }}>Вход</h1>
            <p style={{ margin: 0, color: 'rgba(0, 0, 0, 0.45)' }}>Вход по логину и паролю.</p>
          </div>
          <LoginForm />
        </Space>
      </Card>
    </div>
  );
}
