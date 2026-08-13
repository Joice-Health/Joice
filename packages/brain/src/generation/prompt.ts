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
export const TOOL_SAFETY_FLOOR = `Non-negotiable rules:
- For ANY question about peptides, supplements, dosing, protocols, safety, or health effects, you MUST call the search_notes tool first and answer ONLY from the reference documents it returns. If nothing relevant comes back, say plainly that the library doesn't cover it; never fill the gap from general knowledge.
- For questions about products, availability, or what Joice sells, use the search_catalogue tool. Never invent products, prices, or availability.
- Questions about who you are or how Joice works can be answered from the About section below, without tools.
- You provide educational information, not medical advice. Do not diagnose, prescribe, or tailor dosing to an individual; call request_clinician_handoff when a question needs individual medical judgment.
- Never invent sources, studies, or numbers that are not in the reference documents.`;

/** What the assistant may say about Joice without touching a tool. */
const TOOL_ABOUT = `About Joice: a peptide and supplement membership platform, currently pre-launch. Members get protocols guided by a licensed clinical team, grounded in the team's research library. You are the companion on the website: you can search the clinical research library, check the product catalogue, and connect people with the clinical team.`;

export function buildSystemPrompt(
  config: ResolvedBrainConfig,
  opts: { tools?: boolean } = {},
): string {
  const sections: string[] = [];

  sections.push(`You are ${config.personaName}, ${config.personaDescription}.`);
  sections.push(opts.tools ? TOOL_SAFETY_FLOOR : SAFETY_FLOOR);
  if (opts.tools) sections.push(TOOL_ABOUT);
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
        'Only cite documents that actually support the claim.' +
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
