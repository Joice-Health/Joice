'use client';

import { PageHeader } from '@/components/admin/ui';
import { SimulatorPanel } from '@/components/admin/onboarding/simulator-panel';

export default function AdminOnboardingSimulatorPage() {
  return (
    <div>
      <PageHeader
        breadcrumbs={[{ href: '/admin/onboarding', label: 'Onboarding' }]}
        title="Simulator"
        description="Answer as a persona and run the real engine: the path, the gates, the derived traits and why every rule fired. Nothing is saved anywhere."
      />
      <SimulatorPanel />
    </div>
  );
}
