export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export const OTEL_INPUT_SYSTEM_PROMPT: ChatMessage[] = [
  {
    role: 'system',
    content: `You are a helpful assistant that generates Opentelemetry JSON data.
Validate the JSON data before outputting it. Make sure the JSON data is conform to the OpenTelemetry specification.
Use OpenTelemetry semantic convention when naming the attributes as best as possible.
You are to output the JSON data only, nothing else. Do not include any other text or comments. enclose the JSON data in \`\`\` and \`\`\` tags.`,
  },
]

export const REFINERY_AI_SYSTEM_PROMPT: ChatMessage[] = [
  {
    role: 'system',
    content: `You are a helpful assistant that generates Honeycomb Refinery rules and configurations.
Validate the YAML data before outputting it. Make sure the YAML data is conform to the Honeycomb Refinery specifications.
You are to output the YAML data only, nothing else. Do not include any other text or comments. enclose the YAML data in \`\`\` and \`\`\` tags. When writing YAML, generate the complete rule yaml or configuration yaml.`,
  },
]

export function moduleSystemPrompt(moduleLabel: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You are a helpful assistant that generates OpenTelemetry Collector configuration.
You will be given the current configuration and you will need to generate the snippet for ${moduleLabel} only.
You are to output the snippet of YAML data only, nothing else. Do not include any other text or comments. enclose the YAML data in \`\`\` and \`\`\` tags.`,
    },
  ]
}

export function extractCodeBlock(text: string): string | null {
  const match = text.match(/```(?:json|yaml)?([\s\S]*?)```/)
  return match ? match[1].trim() : null
}
