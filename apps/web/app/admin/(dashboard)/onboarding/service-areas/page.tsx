'use client';

import { useState } from 'react';
import { useServiceAreas, useUpdateOnboardingSettings, useUpdateServiceArea } from '@joice/api-client';
import { usStateName } from '@joice/utils';
import { Button, Input } from '@joice/ui';
import {
  Badge,
  ErrorState,
  PageHeader,
  Panel,
  PanelSkeleton,
  Table,
  Td,
  Th,
} from '@/components/admin/ui';
import { AdminSelect } from '@/components/admin/fields';
import { useConfirm } from '@/components/admin/confirm';
import { useToast } from '@/components/admin/toast';

const CRUMBS = [{ href: '/admin/onboarding', label: 'Onboarding' }];

const STATUS_TONE = { open: 'active', notify: 'pending', closed: 'suspended' } as const;

/**
 * Where Joice serves, and the age gate. A separate surface with its own audit
 * actions on purpose: opening a state is a business decision, not a copy
 * change. Self-reported state is a courtesy filter; enforcement happens again
 * at prescribing and at the shipping address.
 */
export default function AdminServiceAreasPage() {
  const query = useServiceAreas();
  const update = useUpdateServiceArea();
  const updateSettings = useUpdateOnboardingSettings();
  const [age, setAge] = useState('');
  const toast = useToast();
  const confirm = useConfirm();

  if (query.isPending) {
    return (
      <div>
        <PageHeader breadcrumbs={CRUMBS} title="Service areas" />
        <PanelSkeleton />
      </div>
    );
  }
  if (query.error) return <ErrorState error={query.error} />;
  const { items, settings } = query.data!;
  const open = items.filter((a) => a.status === 'open').length;

  const onUpdateAge = async () => {
    const value = Number(age);
    if (!Number.isInteger(value) || value < 13 || value > 21) {
      toast('The minimum age must be a whole number between 13 and 21.', { tone: 'danger' });
      return;
    }
    const ok = await confirm({
      title: `Set the age gate to ${value}?`,
      body: 'It applies to the next answer given.',
      confirmLabel: 'Set age +',
    });
    if (!ok) return;
    updateSettings.mutate(
      { minimumAge: value },
      {
        onSuccess: () => {
          toast(`Minimum age is now ${value}.`);
          setAge('');
        },
        onError: (error) =>
          toast(error instanceof Error ? error.message : 'Update failed.', { tone: 'danger' }),
      },
    );
  };

  const onSetStatus = async (stateCode: string, status: 'open' | 'notify' | 'closed') => {
    const ok = await confirm({
      title: `Set ${usStateName(stateCode)} to "${status}"?`,
      body: 'Visitors see it within about a minute; the change is audited.',
      confirmLabel: 'Change +',
    });
    if (!ok) return;
    update.mutate(
      { code: stateCode, status },
      {
        onSuccess: () => toast(`${usStateName(stateCode)} is now ${status}.`),
        onError: (error) =>
          toast(error instanceof Error ? error.message : 'Change failed.', { tone: 'danger' }),
      },
    );
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={CRUMBS}
        title="Service areas"
        description={`${open} state${open === 1 ? '' : 's'} open. A change reaches visitors within about a minute and is audited on its own trail. Self-reported state is a courtesy filter; enforcement happens again at prescribing and shipping.`}
      />

      <Panel className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="mono-label text-muted">Minimum age (today: {settings.minimumAge})</span>
            <Input
              value={age}
              placeholder={String(settings.minimumAge)}
              inputMode="numeric"
              onChange={(e) => setAge(e.target.value)}
              className="h-10 max-w-28 bg-canvas px-3 text-sm"
            />
          </label>
          <Button size="sm" disabled={updateSettings.isPending || !age} onClick={() => void onUpdateAge()}>
            Update
          </Button>
        </div>
      </Panel>

      <Panel>
        <Table>
          <thead>
            <tr>
              <Th>State</Th>
              <Th>Status</Th>
              <Th>Note</Th>
              <Th>Changed by</Th>
              <Th>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((area) => (
              <tr key={area.stateCode}>
                <Td>
                  {usStateName(area.stateCode)} <span className="mono-label text-muted">{area.stateCode}</span>
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[area.status as keyof typeof STATUS_TONE] ?? 'pending'}>{area.status}</Badge>
                </Td>
                <Td className="max-w-56 truncate">{area.note ?? ''}</Td>
                <Td className="max-w-40 truncate">{area.updatedBy ?? ''}</Td>
                <Td>
                  <AdminSelect
                    size="sm"
                    aria-label={`Status for ${usStateName(area.stateCode)}`}
                    value={area.status}
                    disabled={update.isPending}
                    onChange={(e) =>
                      void onSetStatus(area.stateCode, e.target.value as 'open' | 'notify' | 'closed')
                    }
                  >
                    <option value="open">open</option>
                    <option value="notify">notify</option>
                    <option value="closed">closed</option>
                  </AdminSelect>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
