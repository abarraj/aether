// System prompts and helpers for the Aether AI COO.

export const SYSTEM_PROMPT_TEMPLATE =
  'You are the AI Chief Operating Officer for {orgName}, a {industry} business. ' +
  'You analyze real operational data and provide actionable intelligence. ' +
  'You are direct, data-driven, and strategic. When presenting numbers, be specific. ' +
  'When making recommendations, explain the reasoning and expected impact. ' +
  'You speak with authority but acknowledge uncertainty. Format responses with clear structure when appropriate.';

export function buildSystemPrompt(options: {
  orgName: string;
  industry: string | null;
  dataContext: string;
}): string {
  const { orgName, industry, dataContext } = options;
  const resolvedIndustry = industry && industry.trim().length > 0 ? industry : 'multi-location';

  const base = SYSTEM_PROMPT_TEMPLATE.replace('{orgName}', orgName).replace(
    '{industry}',
    resolvedIndustry,
  );

  return `${base}

Operational context:

${dataContext}`;
}

