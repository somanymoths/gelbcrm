import { redirect } from 'next/navigation';
import { Card, CardContent } from '@/components/ui';
import { LoginForm } from '@/components/login-form';
import { getCurrentSession } from '@/lib/auth';

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) {
    redirect(session.role === 'admin' ? '/funnel' : '/journal');
  }

  return (
    <div className="mx-auto my-6 max-w-[520px]">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h1 className="mb-2 text-3xl leading-tight">Вход</h1>
            <p className="m-0 text-muted-foreground">Вход по логину и паролю.</p>
          </div>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
