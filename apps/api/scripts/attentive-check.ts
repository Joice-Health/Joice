/**
 * Validates an Attentive API key before it goes anywhere near a deploy:
 *
 *   ATTENTIVE_API_KEY=... bun apps/api/scripts/attentive-check.ts
 *
 * Calls GET /v1/me and prints the company the key belongs to. Never prints
 * the key; a rejection prints the HTTP status only. Exit 1 on any failure so
 * it can gate a runbook step.
 */
import { z } from 'zod';
import { AttentiveRequestError, createAttentiveClient } from '@joice/marketing';

const env = z.object({ ATTENTIVE_API_KEY: z.string().min(1) }).parse(process.env);

async function main(): Promise<void> {
  const client = createAttentiveClient({ apiKey: env.ATTENTIVE_API_KEY });
  try {
    const account = await client.me();
    console.log(
      `Attentive key OK: ${account.companyName} (company ${account.companyId}), app "${account.applicationName}", domain ${account.attentiveDomainName}`,
    );
  } catch (error) {
    if (error instanceof AttentiveRequestError) {
      console.error(`Attentive rejected the key: HTTP ${error.status}`);
    } else {
      console.error(`Could not reach Attentive: ${(error as Error).name}`);
    }
    process.exit(1);
  }
}

void main();
