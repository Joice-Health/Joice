import { describe, expect, test } from 'bun:test';
import type { Database } from '@joice/db';
import { createLabUploadsService } from './lab-uploads-service';

function stubDb(selects: unknown[][], returning: unknown[][] = []) {
  const log: Array<{ op: string; args: unknown[] }> = [];
  const make = (op: string, args: unknown[]): Record<string, unknown> => {
    log.push({ op, args });
    const resolveTo = op === 'select' ? () => selects.shift() ?? [] : () => returning.shift() ?? [];
    const chain: Record<string, unknown> = {};
    const step = (name: string) => (...a: unknown[]) => {
      log.push({ op: `${op}.${name}`, args: a });
      return chain;
    };
    for (const name of ['from', 'where', 'orderBy', 'values', 'set', 'returning']) chain[name] = step(name);
    chain.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(resolveTo()).then(onOk, onErr);
    return chain;
  };
  const db = {
    select: (...a: unknown[]) => make('select', a),
    insert: (t: unknown) => make('insert', [t]),
    update: (t: unknown) => make('update', [t]),
  };
  return { db: db as unknown as Database, log };
}

const row = {
  id: 'u1',
  memberId: 'm1',
  s3Key: 'labs/m1/fixed-id',
  filename: 'labs.pdf',
  contentType: 'application/pdf',
  sizeBytes: 1000,
  status: 'uploaded',
  createdAt: new Date('2026-08-30T12:00:00Z'),
  updatedAt: new Date('2026-08-30T12:00:00Z'),
};

const presignFor = (calls: unknown[]) => ({
  presignPut: async (input: unknown) => {
    calls.push(input);
    return 'https://signed.example/put';
  },
});

describe('lab uploads', () => {
  test('create records the row, presigns exactly that key, and never returns the key', async () => {
    const calls: unknown[] = [];
    const { db, log } = stubDb([], [[row]]);
    const svc = createLabUploadsService(db, { presign: presignFor(calls) }, { newId: () => 'fixed-id' });
    const result = await svc.create('m1', { filename: 'labs.pdf', contentType: 'application/pdf', sizeBytes: 1000 });
    const inserted = log.find((l) => l.op === 'insert.values')!.args[0];
    expect(inserted).toMatchObject({ memberId: 'm1', s3Key: 'labs/m1/fixed-id', contentType: 'application/pdf' });
    expect(calls).toEqual([{ key: 'labs/m1/fixed-id', contentType: 'application/pdf', sizeBytes: 1000 }]);
    expect(result.uploadUrl).toBe('https://signed.example/put');
    expect(result.upload).toEqual({
      id: 'u1',
      filename: 'labs.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1000,
      createdAt: '2026-08-30T12:00:00.000Z',
    });
    expect(JSON.stringify(result.upload)).not.toContain('s3');
  });

  test('create refuses a disallowed content type and an oversized file before any write', async () => {
    const calls: unknown[] = [];
    const { db, log } = stubDb([]);
    const svc = createLabUploadsService(db, { presign: presignFor(calls) });
    await expect(
      svc.create('m1', { filename: 'x.zip', contentType: 'application/zip' as never, sizeBytes: 10 }),
    ).rejects.toThrow();
    await expect(
      svc.create('m1', { filename: 'x.pdf', contentType: 'application/pdf', sizeBytes: 26 * 1024 * 1024 }),
    ).rejects.toThrow();
    expect(log.filter((l) => l.op === 'insert')).toEqual([]);
    expect(calls).toEqual([]);
  });

  test('list returns the view shape, remove reports whether an owned row changed', async () => {
    const { db } = stubDb([[row]], [[{ ...row, status: 'removed' }]]);
    const svc = createLabUploadsService(db, { presign: presignFor([]) });
    const items = await svc.listForMember('m1');
    expect(items).toHaveLength(1);
    expect(Object.keys(items[0]!).sort()).toEqual(['contentType', 'createdAt', 'filename', 'id', 'sizeBytes']);
    expect(await svc.remove('m1', 'u1')).toBe(true);
  });

  test('remove of a row that is not yours (or already removed) is false', async () => {
    const { db } = stubDb([], [[]]);
    const svc = createLabUploadsService(db, { presign: presignFor([]) });
    expect(await svc.remove('someone-else', 'u1')).toBe(false);
  });
});
