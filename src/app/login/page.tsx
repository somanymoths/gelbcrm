import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { Card, CardContent } from '@/components/ui/card';
import { getCurrentSession } from '@/lib/auth';

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) {
    redirect(session.role === 'admin' ? '/funnel' : '/journal');
  }

  return (
    <div className="mx-auto my-6 max-w-[520px]">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div>
            <h1 className="mb-2 mt-0 text-3xl leading-tight">Вход</h1>
            <p className="m-0 text-sm text-muted-foreground">Вход по логину и паролю.</p>
          </div>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
