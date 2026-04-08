import { InstructionsSection } from '@/components/instructions/instructions-section';

export default async function InstructionBySlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <InstructionsSection initialSlug={slug} />;
}
