'use client';

import { PageHeader } from '@/components/admin/ui';
import { SimulatorPanel } from '@/components/admin/onboarding/simulator-panel';

export default function AdminOnboardingSimulatorPage() {
  return (
    <div>
      <PageHeader title="Simulator" />
      <p className="mb-6 max-w-3xl text-sm text-muted">
        Answer as a persona and run the real engine: the path, the gates, the derived traits and why every
        rule fired. Nothing is saved anywhere.
      </p>
      <SimulatorPanel />
    </div>
  );
}
