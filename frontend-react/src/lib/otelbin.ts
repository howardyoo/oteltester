export function formatForOtelbin(configYaml: string): string {
  return configYaml
    .replace(/\*/g, '**')
    .replace(/_/g, '*_')
    .replace(/\(/g, '*C')
    .replace(/\)/g, '*D')
    .replace(/\n/g, '*N')
    .replace(/#/g, '*H')
    .replace(/ /g, '_')
}

export function getOtelbinUrl(configYaml: string, collectorVersion?: string): string {
  const version = collectorVersion && collectorVersion !== '0.0.0' ? collectorVersion : '0.116.1'
  const formatted = encodeURIComponent(formatForOtelbin(configYaml))
  const distro = encodeURIComponent(`&distro=otelcol-contrib~&distroVersion=v${version}~`)
  return `https://otelbin.com/?#config=*${formatted}%7E${distro}`
}
