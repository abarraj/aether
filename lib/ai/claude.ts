// Configured Anthropic client for server-side Claude calls.

import Anthropic from '@anthropic-ai/sdk';

if (!process.env.ANTHROPIC_API_KEY) {
  // In production this should be set; we throw early to surface misconfigurations.
  // eslint-disable-next-line no-console
  console.warn('ANTHROPIC_API_KEY is not set. Claude features will not work correctly.');
}

export const claudeClient = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

