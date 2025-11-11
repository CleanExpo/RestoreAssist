import ScopeBuilder from '@/components/scope/ScopeBuilder';

export default function ScopePage({ params }: { params: { id: string } }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <ScopeBuilder reportId={params.id} />
    </div>
  );
}
