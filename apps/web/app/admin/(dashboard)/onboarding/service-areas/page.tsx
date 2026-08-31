'use client';

import { useState } from 'react';
import { useServiceAreas, useUpdateOnboardingSettings, useUpdateServiceArea } from '@joice/api-client';
import { usStateName } from '@joice/utils';
import { Button, Input } from '@joice/ui';
import { Badge, Panel, ErrorState, PageHeader, Table, Td, Th } from '@/components/admin/ui';

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
  const [message, setMessage] = useState<string | null>(null);

  if (query.isPending) return <p className="mono-label text-muted">Loading…</p>;
  if (query.error) return <ErrorState error={query.error} />;
  const { items, settings } = query.data!;
  const open = items.filter((a) => a.status === 'open').length;

  return (
    <div>
      <PageHeader title="Service areas" />
      <p className="mb-6 max-w-3xl text-sm text-muted">
        {open} state{open === 1 ? '' : 's'} open. A change reaches visitors within about a minute and is
        audited on its own trail. Self-reported state is a courtesy filter; enforcement happens again at
        prescribing and shipping.
      </p>

      <Panel className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="mono-label text-muted">Minimum age (today: {settings.minimumAge})</span>
            <Input
              value={age}
              placeholder={String(settings.minimumAge)}
              inputMode="numeric"
              onChange={(e) => setAge(e.target.value)}
              className="h-10 max-w-28 px-3 text-sm"
            />
          </label>
          <Button
            size="sm"
            disabled={updateSettings.isPending || !age}
            onClick={() => {
              const value = Number(age);
              if (!Number.isInteger(value) || value < 13 || value > 21) {
                setMessage('The minimum age must be a whole number between 13 and 21.');
                return;
              }
              if (!window.confirm(`Set the age gate to ${value}? It applies to the next answer given.`)) return;
              updateSettings.mutate(
                { minimumAge: value },
                { onSuccess: () => { setMessage(`Minimum age is now ${value}.`); setAge(''); } },
              );
            }}
          >
            Update
          </Button>
          {message ? <p className="mono-label text-muted">{message}</p> : null}
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
                  <select
                    aria-label={`Status for ${usStateName(area.stateCode)}`}
                    value={area.status}
                    disabled={update.isPending}
                    onChange={(e) => {
                      const status = e.target.value as 'open' | 'notify' | 'closed';
                      if (!window.confirm(`Set ${usStateName(area.stateCode)} to "${status}"? Visitors see it within about a minute.`)) {
                        e.target.value = area.status;
                        return;
                      }
                      update.mutate({ code: area.stateCode, status });
                    }}
                    className="h-9 rounded-full bg-canvas px-3 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600/50"
                  >
                    <option value="open">open</option>
                    <option value="notify">notify</option>
                    <option value="closed">closed</option>
                  </select>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}
