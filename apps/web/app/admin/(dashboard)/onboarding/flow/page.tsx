'use client';

import { PageHeader } from '@/components/admin/ui';
import { FlowEditor } from '@/components/admin/onboarding/flow-editor';

export default function AdminOnboardingFlowPage() {
  return (
    <div>
      <PageHeader
        breadcrumbs={[{ href: '/admin/onboarding', label: 'Onboarding' }]}
        title="Intake flow"
        description="Edit a draft, then publish. Published versions are frozen; live sessions keep the logic they started with unless only copy changed."
      />
      <FlowEditor />
    </div>
  );
}
