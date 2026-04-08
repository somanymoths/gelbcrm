import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';

const UPLOAD_ROOT = path.join(process.cwd(), 'public', 'uploads', 'instructions');

export async function POST(request: NextRequest) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ code: 'BAD_REQUEST', message: 'Файл не найден' }, { status: 400 });
  }

  const ext = getFileExtension(file.name);
  const fileName = `${Date.now()}-${randomUUID()}${ext}`;
  await mkdir(UPLOAD_ROOT, { recursive: true });

  const absolutePath = path.join(UPLOAD_ROOT, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(absolutePath, bytes);

  return NextResponse.json({
    url: `/uploads/instructions/${fileName}`
  });
}

function getFileExtension(name: string): string {
  const normalized = name.trim();
  if (!normalized.includes('.')) return '';
  const ext = normalized.slice(normalized.lastIndexOf('.'));
  return ext.length <= 24 ? ext : '';
}
