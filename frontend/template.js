function new_trace_id() {
    return crypto.randomUUID().replace(/-/g, '');
}

function new_span_id() {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function apply_trace_template(json) {
    if (json.resourceSpans) {
        const curr_time = BigInt(Date.now()) * BigInt(1000000);
        var idMap = {};
        json.resourceSpans.forEach(rs => {
            if (rs.scopeSpans) {
                rs.scopeSpans.forEach(ss => {
                    if (ss.spans) {
                        ss.spans.forEach(span => {
                            if (span.traceId.match(template_regex) ) {
                                if (idMap[span.traceId]) {
                                    span.traceId = idMap[span.traceId];
                                } else {
                                    var new_id = new_trace_id();
                                    idMap[span.traceId] = new_id;
                                    span.traceId = new_id;
                                }
                            }
                            if (span.spanId.match(template_regex) ) {
                                if (idMap[span.spanId]) {
                                    span.spanId = idMap[span.spanId];
                                } else {
                                    var new_id = new_span_id();
                                    idMap[span.spanId] = new_id;
                                    span.spanId = new_id;
                                }
                            }
                            if (span.parentSpanId && span.parentSpanId.match(template_regex)) {
                                if (idMap[span.parentSpanId]) {
                                    span.parentSpanId = idMap[span.parentSpanId];
                                }
                            }
                            const startTimeNano = BigInt(span.startTimeUnixNano);
                            if (startTimeNano < curr_time) {
                                const newStartTime = curr_time + startTimeNano;
                                span.startTimeUnixNano = newStartTime.toString();
                                span.endTimeUnixNano = (newStartTime + BigInt(span.endTimeUnixNano)).toString();
                            }
                        });
                    }
                });
            }
        });
    }
    return json;
}

function apply_log_template(json) {
    if (json.resourceLogs) {
        const curr_time = BigInt(Date.now()) * BigInt(1000000);
        var idMap = {};
        json.resourceLogs.forEach(rl => {
            if (rl.scopeLogs) {
                rl.scopeLogs.forEach(sl => {
                    if (sl.logRecords) {
                        sl.logRecords.forEach(lr => {
                            const logTimeNano = BigInt(lr.timeUnixNano);
                            if (logTimeNano < curr_time) {
                                const newLogTime = curr_time + logTimeNano;
                                lr.timeUnixNano = newLogTime.toString();
                                lr.observedTimeUnixNano = newLogTime.toString();
                            }
                        });
                    }
                });
            }
        });
    }
    return json;
}

function apply_datapoint_template(datapoints, curr_time) {
    if(datapoints) {
        datapoints.forEach(dp => {
            const dataPointTimeNano = BigInt(dp.timeUnixNano);
            if (dataPointTimeNano < curr_time) {
                const newDataPointTime = curr_time + dataPointTimeNano;
                dp.timeUnixNano = newDataPointTime.toString();
                dp.startTimeUnixNano = newDataPointTime.toString();
            }
        });
    }
}

function apply_metric_template(json) {
    if (json.resourceMetrics) {
        const curr_time = BigInt(Date.now()) * BigInt(1000000);
        var idMap = {};
        json.resourceMetrics.forEach(rm => {
            if (rm.scopeMetrics) {
                rm.scopeMetrics.forEach(sm => {
                    if (sm.metrics) {
                        sm.metrics.forEach(m => {

                            if (m.sum) {
                                apply_datapoint_template(m.sum.dataPoints, curr_time);
                            }

                            if (m.gauge) {
                                apply_datapoint_template(m.gauge.dataPoints, curr_time);
                            }

                            if (m.histogram) {
                                apply_datapoint_template(m.histogram.dataPoints, curr_time);
                            }

                            if (m.exponentialHistogram) {
                                apply_datapoint_template(m.exponentialHistogram.dataPoints, curr_time);
                            }
                        });
                    }
                });
            }
        });
    }
    return json;
}

// regex for applying templates
const template_regex = /\{\{.*?\}\}/g;

// apply template rules to the json object, and return the new json object
function apply_template(json) {
    if (Array.isArray(json)) {
        json.forEach(item => {
            apply_trace_template(item);
            apply_log_template(item);
            apply_metric_template(item);
        });
    } else {
        apply_trace_template(json);
        apply_log_template(json);
        apply_metric_template(json);
    }
    return json;
}

function init_template() {

    if (template_dir == null) {
        console.error('Template directory is not set:', template_dir);
        return;
    }

    // setup templates for each button.
    document.getElementById("trace_simple").addEventListener("click", () => {
        // load up the simple trace json into the text area 'otel_input'
        if(template_dir) {
            fetch('/api/get_json?path=' + template_dir + "/simple_trace.json")
                .then(response => response.json())
                .then(json => {
                    //document.getElementById('otel_input').textContent = JSON.stringify(json, null, 2);
                    otelcol_json_input.setValue(JSON.stringify(json, null, 2));
                })
                .catch(error => console.error('Error fetching otelcol config:', error));
        }
    });

    document.getElementById("trace_medium").addEventListener("click", () => {
        // load up the simple trace json into the text area 'otel_input'
        if(template_dir) {
            fetch('/api/get_json?path=' + template_dir + "/medium_trace.json")
                .then(response => response.json())
                .then(json => {
                    //document.getElementById('otel_input').textContent = JSON.stringify(json, null, 2);
                    otelcol_json_input.setValue(JSON.stringify(json, null, 2));
                })
                .catch(error => console.error('Error fetching otelcol config:', error));
        }
    });

    document.getElementById("log_simple").addEventListener("click", () => {
        // load up the simple trace json into the text area 'otel_input'
        if(template_dir) {
            fetch('/api/get_json?path=' + template_dir + "/simple_log.json")
                .then(response => response.json())
                .then(json => {
                    //document.getElementById('otel_input').textContent = JSON.stringify(json, null, 2);
                    otelcol_json_input.setValue(JSON.stringify(json, null, 2));
                })
                .catch(error => console.error('Error fetching otelcol config:', error));
        }
    });

    document.getElementById("metric_simple").addEventListener("click", () => {
        // load up the simple trace json into the text area 'otel_input'
        if(template_dir) {
            fetch('/api/get_json?path=' + template_dir + "/simple_metric.json")
                .then(response => response.json())
                .then(json => {
                    //document.getElementById('otel_input').textContent = JSON.stringify(json, null, 2);
                    otelcol_json_input.setValue(JSON.stringify(json, null, 2));
                })
                .catch(error => console.error('Error fetching otelcol config:', error));
        }
    });
}

