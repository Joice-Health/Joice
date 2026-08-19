'use client';

import { PageHeader } from '@/components/admin/ui';
import { FlowEditor } from '@/components/admin/onboarding/flow-editor';

export default function AdminOnboardingFlowPage() {
  return (
    <div>
      <PageHeader title="Intake flow" />
      <p className="mb-6 max-w-3xl text-sm text-muted">
        Edit a draft, then publish. Published versions are frozen; live sessions keep the logic they
        started with unless only copy changed.
      </p>
      <FlowEditor />
    </div>
  );
}
