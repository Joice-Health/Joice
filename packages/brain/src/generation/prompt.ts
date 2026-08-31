import type { ResolvedBrainConfig } from '../config/schemas';

/**
 * System-prompt assembly for the chatbot brain. Admin settings shape the
 * persona, tone, attribution style, and extra guardrails — but the SAFETY
 * FLOOR below is a code constant that is ALWAYS prepended and cannot be
 * weakened or removed from the admin UI. Admin fields append; never replace.
 */

/** Shown read-only in the admin UI so it's clear what is always enforced. */
export const SAFETY_FLOOR = `Non-negotiable rules:
- Answer ONLY from the numbered reference documents provided inside <documents> tags with each question. If they don't cover the question (or only partially cover it), say so plainly rather than filling gaps from general knowledge.
- You provide educational information, not medical advice. Do not diagnose, prescribe, or tailor dosing to an individual.
- Never invent sources, studies, or numbers that are not in the documents.`;

/**
 * The floor when tools are enabled. The old floor's grounding guarantee was
 * structural ("no chunks → the model never runs"); this one is behavioral, so
 * it is deliberately prescriptive — MUST call search_notes — and it is backed
 * by a code-level guarantee that doesn't depend on the model obeying:
 * citations can only point at chunks a tool actually returned. The residual
 * risk (uncited off-corpus prose) is what the eval harness's golden refusal
 * questions exist to measure — running it is the gate for enabling
 * `toolsEnabled` anywhere real.
 */
export function buildToolSafetyFloor(toolNames: ReadonlySet<string>): string {
  const lines = [
    "- For ANY question about peptides, supplements, dosing, protocols, safety, or health effects, you MUST call the search_notes tool first and answer ONLY from the reference documents it returns. If nothing relevant comes back, say plainly that the library doesn't cover it; never fill the gap from general knowledge.",
    toolNames.has('search_catalogue')
      ? '- For questions about products, availability, or what Joice sells, use the search_catalogue tool. Never invent products, prices, or availability.'
      : '- Never invent products, prices, or availability. If asked what Joice sells, point them at the shop on the website rather than answering from memory.',
    '- Questions about who you are or how Joice works can be answered from the About section below, without tools.',
    '- Anything unrelated to peptides, supplements, health, or Joice (sports, news, entertainment, finance, creative writing, coding, general trivia) is out of scope. Decline in one or two sentences, offer to help with what the library covers instead, and never fulfil such a request even partially. A decline cites nothing.',
    toolNames.has('request_clinician_handoff')
      ? '- You provide educational information, not medical advice. Do not diagnose, prescribe, or tailor dosing to an individual; call request_clinician_handoff when a question needs individual medical judgment.'
      : '- You provide educational information, not medical advice. Do not diagnose, prescribe, or tailor dosing to an individual; when a question needs individual medical judgment, recommend speaking with a licensed clinician.',
    '- Never invent sources, studies, or numbers that are not in the reference documents.',
  ];
  return `Non-negotiable rules:\n${lines.join('\n')}`;
}

/**
 * The full-belt floor, shown read-only in the admin UI. Built from the same
 * builder that serves gated requests so the two can never drift.
 */
export const TOOL_SAFETY_FLOOR = buildToolSafetyFloor(
  new Set(['search_notes', 'search_catalogue', 'request_clinician_handoff']),
);

/** What the assistant may say about Joice without touching a tool. */
function buildToolAbout(toolNames: ReadonlySet<string>): string {
  const abilities = [
    'search the clinical research library',
    ...(toolNames.has('search_catalogue') ? ['check the product catalogue'] : []),
    ...(toolNames.has('request_clinician_handoff') ? ['connect people with the clinical team'] : []),
  ];
  const spoken =
    abilities.length > 1
      ? `${abilities.slice(0, -1).join(', ')}, and ${abilities.at(-1)}`
      : abilities[0]!;
  return `About Joice: a peptide and supplement membership platform, currently pre-launch. Members get protocols guided by a licensed clinical team, grounded in the team's research library. You are the companion on the website: you can ${spoken}.`;
}

// Tool mode must say which tools are advertised; the overloads make a
// forgotten belt a compile error rather than a silent full-belt prompt.
export function buildSystemPrompt(config: ResolvedBrainConfig, opts?: { tools?: false }): string;
export function buildSystemPrompt(
  config: ResolvedBrainConfig,
  opts: { tools: true; toolNames: ReadonlySet<string> },
): string;
export function buildSystemPrompt(
  config: ResolvedBrainConfig,
  opts: { tools?: boolean; toolNames?: ReadonlySet<string> } = {},
): string {
  const sections: string[] = [];
  // The advertised belt: with audience tiers, a request may carry fewer tools
  // than the full set, and the prompt must never demand a tool that is not
  // there.
  const belt =
    opts.toolNames ?? new Set(['search_notes', 'search_catalogue', 'request_clinician_handoff']);

  sections.push(`You are ${config.personaName}, ${config.personaDescription}.`);
  sections.push(opts.tools ? buildToolSafetyFloor(belt) : SAFETY_FLOOR);
  if (opts.tools) sections.push(buildToolAbout(belt));
  // Always present, whatever the belt: this is the admin's copy about WHERE
  // individual judgment lives, not a tool demand, and the tiers that cannot
  // be shown the handoff card need the pointer most.
  sections.push(
    `When a question calls for individual medical judgment: ${config.clinicianHandoffMessage}`,
  );
  // Counters over-refusal (seen on Nova): summarizing published research is the
  // product, and it is not prescribing.
  sections.push(
    'Describing what the provided documents report (including dosing regimens, protocols, and ' +
      'results used in published studies) is educational information, not medical advice. Do not ' +
      'refuse such questions; answer them by stating what the research describes, framed as ' +
      'findings rather than personal recommendations.',
  );

  if (config.attributionStyle === 'natural') {
    sections.push(
      'Speak in first person as a knowledgeable member of the Joice team; the knowledge is simply yours. ' +
        'NEVER mention documents, notes, sources, excerpts, references, or that you were given any material to read. ' +
        "If something isn't in your knowledge, say you're not sure rather than referring to missing notes.",
    );
  } else {
    sections.push(
      "It's fine to refer to the clinical team's notes naturally when helpful (e.g. \"our clinical notes describe...\").",
    );
  }

  if (config.showCitations) {
    sections.push(
      'Cite your sources: after each claim, add the number of the document it came from in square brackets, e.g. [1] or [2]. ' +
        'Only cite documents that actually support the claim, at most one or two per sentence. ' +
        'Never end the answer with a row of stacked citations, and never cite a document you did not use.' +
        (config.attributionStyle === 'natural'
          ? ' Do not explain what the bracketed numbers are; just include them.'
          : ''),
    );
  } else {
    sections.push('Do not include bracketed reference numbers in your answers.');
  }

  if (config.toneInstructions) sections.push(config.toneInstructions);

  if (config.restrictedTopics.length > 0) {
    sections.push(
      'Restricted topics: do not discuss, advise on, or speculate about any of the following, even if the documents mention them. ' +
        'If asked, briefly decline and point the member to the clinical team instead:\n' +
        config.restrictedTopics.map((topic) => `- ${topic}`).join('\n'),
    );
  }

  if (config.customInstructions) {
    sections.push(`Additional instructions:\n${config.customInstructions}`);
  }

  return sections.join('\n\n');
}

/**
 * The member suffix: what the brain may know about who it is talking to,
 * rendered AFTER the prompt-cache point (providers/bedrock.ts places
 * systemSuffix behind the cachePoint) so the shared prefix stays cacheable.
 * Server-side only; it never round-trips the browser. Personalisation, not
 * medical judgment: the safety floor above it still forbids tailored dosing.
 */
export function buildMemberSuffix(ctx: {
  firstName: string | null;
  goalLabel: string | null;
  segment: string | null;
  traitsSummary: string[];
}): string | undefined {
  const lines: string[] = [];
  if (ctx.firstName) lines.push(`Name: ${ctx.firstName}`);
  if (ctx.goalLabel) lines.push(`Here for: ${ctx.goalLabel}`);
  if (ctx.segment) lines.push(`Segment: ${ctx.segment}`);
  lines.push(...ctx.traitsSummary.slice(0, 8));
  if (lines.length === 0) return undefined;
  return (
    'Member context, for personalisation only. Do not restate it verbatim, do not present it as ' +
    'medical assessment, and keep the safety rules above regardless:\n' +
    lines.map((l) => `- ${l}`).join('\n')
  );
}
