import { customAlphabet } from 'nanoid';
import {
  type Database,
  type WaitlistEntry,
  waitlistEntries,
  eq,
  lte,
  count,
} from '@joice/db';
import type { JoinWaitlistInput, WaitlistEntryView, WaitlistStats } from './schemas';

/** URL-safe, unambiguous alphabet (no 0/o/1/l/i) for human-shareable codes. */
const generateReferralCode = customAlphabet('23456789abcdefghjkmnpqrstuvwxyz', 8);

const MAX_CODE_ATTEMPTS = 5;

export interface JoinWaitlistArgs extends JoinWaitlistInput {
  ipHash?: string;
}

export function createWaitlistService(db: Database) {
  /** Count entries at or before this sequence — i.e. the entry's place in line. */
  async function positionOf(sequence: number): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(waitlistEntries)
      .where(lte(waitlistEntries.sequence, sequence));
    return row?.value ?? 0;
  }

  async function totalCount(): Promise<number> {
    const [row] = await db.select({ value: count() }).from(waitlistEntries);
    return row?.value ?? 0;
  }

  async function toView(entry: WaitlistEntry): Promise<WaitlistEntryView> {
    const [position, total] = await Promise.all([positionOf(entry.sequence), totalCount()]);
    return {
      referralCode: entry.referralCode,
      position,
      referralCount: entry.referralCount,
      totalCount: total,
    };
  }

  async function findByEmail(email: string): Promise<WaitlistEntry | undefined> {
    const [entry] = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.email, email))
      .limit(1);
    return entry;
  }

  async function findByReferralCode(code: string): Promise<WaitlistEntry | undefined> {
    const [entry] = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.referralCode, code))
      .limit(1);
    return entry;
  }

  return {
    /**
     * Idempotent join: an email that already exists simply re-returns its card,
     * so re-submitting never errors or creates duplicates. A valid `ref` attributes
     * the signup to its referrer and bumps their referral count in one transaction.
     */
    async join({ email, ref, ipHash }: JoinWaitlistArgs): Promise<WaitlistEntryView> {
      const existing = await findByEmail(email);
      if (existing) return toView(existing);

      // Resolve referrer up front (a self-referral is impossible: the new code
      // doesn't exist yet). Unknown codes are stored raw but not attributed.
      const referrer = ref ? await findByReferralCode(ref) : undefined;

      const inserted = await db.transaction(async (tx) => {
        let entry: WaitlistEntry | undefined;

        for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
          try {
            const [row] = await tx
              .insert(waitlistEntries)
              .values({
                email,
                referralCode: generateReferralCode(),
                referredByCode: ref ?? null,
                referredById: referrer?.id ?? null,
                ipHash: ipHash ?? null,
              })
              .returning();
            entry = row;
            break;
          } catch (err) {
            // Retry only on a referral_code collision; rethrow anything else
            // (e.g. a concurrent same-email insert hitting the unique index).
            if (isUniqueViolation(err, 'referral_code')) continue;
            throw err;
          }
        }

        if (!entry) throw new Error('Could not generate a unique referral code');

        if (referrer) {
          await tx
            .update(waitlistEntries)
            .set({ referralCount: referrer.referralCount + 1, updatedAt: new Date() })
            .where(eq(waitlistEntries.id, referrer.id));
        }

        return entry;
      });

      return toView(inserted);
    },

    async getByCode(code: string): Promise<WaitlistEntryView | null> {
      const entry = await findByReferralCode(code);
      return entry ? toView(entry) : null;
    },

    async getStats(): Promise<WaitlistStats> {
      return { totalCount: await totalCount() };
    },
  };
}

export type WaitlistService = ReturnType<typeof createWaitlistService>;

/** Best-effort detection of a Postgres unique-violation on a given column/constraint. */
function isUniqueViolation(err: unknown, needle: string): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: string; constraint_name?: string; message?: string };
  if (e.code !== '23505') return false;
  const haystack = `${e.constraint_name ?? ''} ${e.message ?? ''}`;
  return haystack.includes(needle);
}
