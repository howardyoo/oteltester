/* eslint-disable @typescript-eslint/no-explicit-any */

function newTraceId() {
  return crypto.randomUUID().replace(/-/g, '')
}

function newSpanId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
}

const templateRegex = /\{\{.*?\}\}/

function convertToNano(value: unknown): number | null {
  if (typeof value !== 'string') {
    return typeof value === 'number' && !Number.isNaN(value) ? value : null
  }
  const timeRegex = /^(\d+(\.\d+)?)\s*(s|ms|m|h)$/
  const match = value.match(timeRegex)
  if (match) {
    const num = parseFloat(match[1])
    switch (match[3]) {
      case 'ms':
        return num * 1_000_000
      case 's':
        return num * 1_000_000_000
      case 'm':
        return num * 60 * 1_000_000_000
      case 'h':
        return num * 60 * 60 * 1_000_000_000
    }
  }
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function findLargestTime(json: any): bigint {
  let maxTime: number | null = null

  function traverse(obj: any) {
    if (typeof obj !== 'object' || obj === null) return
    for (const key of Object.keys(obj)) {
      if (key.endsWith('UnixNano')) {
        const convertedTime = convertToNano(obj[key])
        if (convertedTime !== null) {
          maxTime = maxTime === null ? convertedTime : Math.max(convertedTime, maxTime)
          obj[key] = convertedTime.toString()
        }
      } else if (typeof obj[key] === 'object') {
        traverse(obj[key])
      }
    }
  }

  traverse(json)
  return BigInt(maxTime ?? 0)
}

function applyTraceTemplate(
  json: any,
  newIds: boolean,
  stripTime: boolean,
  idMap: Record<string, string>,
  currTime: bigint,
  largestTime: bigint,
) {
  if (!json.resourceSpans) return json

  const spansWithTime: any[] = []
  json.resourceSpans.forEach((rs: any) => {
    rs.scopeSpans?.forEach((ss: any) => {
      ss.spans?.forEach((span: any) => {
        if (templateRegex.test(span.traceId)) {
          if (idMap[span.traceId]) span.traceId = idMap[span.traceId]
          else {
            const id = newTraceId()
            idMap[span.traceId] = id
            span.traceId = id
          }
        } else if (newIds) {
          if (idMap[span.traceId]) span.traceId = idMap[span.traceId]
          else {
            const id = newTraceId()
            idMap[span.traceId] = id
            span.traceId = id
          }
        }

        if (templateRegex.test(span.spanId)) {
          if (idMap[span.spanId]) span.spanId = idMap[span.spanId]
          else {
            const id = newSpanId()
            idMap[span.spanId] = id
            span.spanId = id
          }
        } else if (newIds) {
          if (idMap[span.spanId]) span.spanId = idMap[span.spanId]
          else {
            const id = newSpanId()
            idMap[span.spanId] = id
            span.spanId = id
          }
        }

        span.links?.forEach((link: any) => {
          if (templateRegex.test(link.traceId)) {
            if (!idMap[link.traceId]) idMap[link.traceId] = newTraceId()
            link.traceId = idMap[link.traceId]
          } else if (newIds) {
            if (!idMap[link.traceId]) idMap[link.traceId] = newTraceId()
            link.traceId = idMap[link.traceId]
          }
          if (templateRegex.test(link.spanId)) {
            if (!idMap[link.spanId]) idMap[link.spanId] = newSpanId()
            link.spanId = idMap[link.spanId]
          } else if (newIds && idMap[link.spanId]) {
            link.spanId = idMap[link.spanId]
          }
        })

        span.events?.forEach((event: any) => {
          if (event.timeUnixNano && stripTime) {
            const newTime = currTime - (largestTime - BigInt(event.timeUnixNano))
            event.timeUnixNano = newTime.toString()
          }
        })

        if (span.parentSpanId) {
          if (templateRegex.test(span.parentSpanId)) {
            if (idMap[span.parentSpanId]) span.parentSpanId = idMap[span.parentSpanId]
          } else if (newIds) {
            if (idMap[span.parentSpanId]) span.parentSpanId = idMap[span.parentSpanId]
            else {
              const id = newSpanId()
              idMap[span.parentSpanId] = id
              span.parentSpanId = id
            }
          }
        }

        const startTimeNano = BigInt(span.startTimeUnixNano)
        if (stripTime || startTimeNano < currTime) {
          spansWithTime.push(span)
        }
      })
    })
  })

  spansWithTime.forEach((span) => {
    const newStart = currTime - (largestTime - BigInt(span.startTimeUnixNano))
    const newEnd = currTime - (largestTime - BigInt(span.endTimeUnixNano))
    span.startTimeUnixNano = newStart.toString()
    span.endTimeUnixNano = newEnd.toString()
  })

  return json
}

function applyLogTemplate(
  json: any,
  newIds: boolean,
  stripTime: boolean,
  idMap: Record<string, string>,
  currTime: bigint,
  largestTime: bigint,
) {
  if (!json.resourceLogs) return json

  const logsWithTime: any[] = []
  json.resourceLogs.forEach((rl: any) => {
    rl.scopeLogs?.forEach((sl: any) => {
      sl.logRecords?.forEach((lr: any) => {
        const logTimeNano = BigInt(lr.timeUnixNano)
        if (stripTime || logTimeNano < currTime) logsWithTime.push(lr)

        if (lr.traceId) {
          if (templateRegex.test(lr.traceId) || newIds) {
            if (!idMap[lr.traceId]) idMap[lr.traceId] = newTraceId()
            lr.traceId = idMap[lr.traceId]
          }
        }
        if (lr.spanId) {
          if (templateRegex.test(lr.spanId) || newIds) {
            if (!idMap[lr.spanId]) idMap[lr.spanId] = newSpanId()
            lr.spanId = idMap[lr.spanId]
          }
        }
      })
    })
  })

  logsWithTime.forEach((lr) => {
    const newTime = currTime - (largestTime - BigInt(lr.timeUnixNano))
    lr.timeUnixNano = newTime.toString()
    lr.observedTimeUnixNano = newTime.toString()
  })

  return json
}

function applyDatapointTemplate(
  datapoints: any[] | undefined,
  currTime: bigint,
  stripTime: boolean,
  datapointsWithTime: any[],
) {
  datapoints?.forEach((dp) => {
    const dataPointTimeNano = BigInt(dp.timeUnixNano)
    if (stripTime || dataPointTimeNano < currTime) {
      datapointsWithTime.push(dp)
    }
  })
}

function applyMetricTemplate(
  json: any,
  stripTime: boolean,
  currTime: bigint,
  largestTime: bigint,
) {
  if (!json.resourceMetrics) return json

  const datapointsWithTime: any[] = []
  json.resourceMetrics.forEach((rm: any) => {
    rm.scopeMetrics?.forEach((sm: any) => {
      sm.metrics?.forEach((m: any) => {
        applyDatapointTemplate(m.sum?.dataPoints, currTime, stripTime, datapointsWithTime)
        applyDatapointTemplate(m.gauge?.dataPoints, currTime, stripTime, datapointsWithTime)
        applyDatapointTemplate(m.histogram?.dataPoints, currTime, stripTime, datapointsWithTime)
        applyDatapointTemplate(
          m.exponentialHistogram?.dataPoints,
          currTime,
          stripTime,
          datapointsWithTime,
        )
      })
    })
  })

  datapointsWithTime.forEach((dp) => {
    const newTime = currTime - (largestTime - BigInt(dp.timeUnixNano))
    dp.timeUnixNano = newTime.toString()
    dp.startTimeUnixNano = newTime.toString()
  })

  return json
}

export function applyTemplate(json: any, newIds = false, stripTime = false) {
  const currTime = BigInt(Date.now()) * BigInt(1_000_000)
  const idMap: Record<string, string> = {}
  const largestTime = findLargestTime(json)

  const items = Array.isArray(json) ? json : [json]
  items.forEach((item) => {
    applyTraceTemplate(item, newIds, stripTime, idMap, currTime, largestTime)
    applyLogTemplate(item, newIds, stripTime, idMap, currTime, largestTime)
    applyMetricTemplate(item, stripTime, currTime, largestTime)
  })

  return json
}
