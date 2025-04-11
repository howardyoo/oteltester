function new_trace_id() {
    return crypto.randomUUID().replace(/-/g, '');
}

function new_span_id() {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

// find the largest time in the json object
// also convert if the time has unit (ms, s, m, h) to nano seconds
function find_largest_time(json) {
    function convertToNano(value) {
        const timeRegex = /^(\d+(\.\d+)?)\s*(s|ms|m|h)$/;
        const match = value.match(timeRegex);
        if (match) {
            let num = parseFloat(match[1], 10);
            switch (match[3]) {
                case 'ms': return num * 1_000_000;
                case 's': return num * 1_000_000_000;
                case 'm': return num * 60 * 1_000_000_000;
                case 'h': return num * 60 * 60 * 1_000_000_000;
            }
        }
        return isNaN(value) ? null : value;
    }
    // either endTimeUnixNano or observedTimeUnixNano or timeUnixNano or startTimeUnixNano
    var maxTime = null;
    function traverse(obj) {
        if (typeof obj !== 'object' || obj === null) return;
        for (let key in obj) {
            if (key.endsWith('UnixNano')) {
                let convertedTime = convertToNano(obj[key]);
                if (convertedTime !== null) {
                    maxTime = maxTime === null ? convertedTime : (convertedTime > maxTime ? convertedTime : maxTime);
                    obj[key] = convertedTime.toString();
                }
            } else if (typeof obj[key] === 'object') {
                traverse(obj[key]);
            }
        }
    }
    traverse(json);
    return BigInt(maxTime);
}

function apply_trace_template(json, new_ids = false, strip_time = false, idMap, curr_time, largest_time) {
    if (json.resourceSpans) {
        var spans_with_time = [];
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
                            } else if (new_ids) {
                                // check if the traceId is in the map
                                if (idMap[span.traceId]) {
                                    span.traceId = idMap[span.traceId];
                                } else {
                                    var trace_id = new_trace_id();
                                    idMap[span.traceId] = trace_id;
                                    span.traceId = trace_id;
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
                            } else if (new_ids) {
                                // check if the spanId is in the map
                                if (idMap[span.spanId]) {
                                    span.spanId = idMap[span.spanId];
                                } else {
                                    var span_id = new_span_id();
                                    idMap[span.spanId] = span_id;
                                    span.spanId = span_id;
                                }
                            }
                            if (span.links) {
                                span.links.forEach(link => {
                                    if (link.traceId.match(template_regex)) {
                                        if (idMap[link.traceId]) {
                                            link.traceId = idMap[link.traceId];
                                        } else {
                                            var new_id = new_trace_id();
                                            idMap[link.traceId] = new_id;
                                            link.traceId = new_id;
                                        }
                                    } else if (new_ids) {
                                        if (idMap[link.traceId]) {
                                            link.traceId = idMap[link.traceId];
                                        } else {
                                            var new_id = new_trace_id();
                                            idMap[link.traceId] = new_id;
                                            link.traceId = new_id;
                                        }
                                    }
                                    if (link.spanId.match(template_regex)) {
                                        if (idMap[link.spanId]) {
                                            link.spanId = idMap[link.spanId];
                                        } else {
                                            var new_id = new_span_id();
                                            idMap[link.spanId] = new_id;
                                            link.spanId = new_id;
                                        }
                                    } else if (new_ids) {
                                        if (idMap[link.spanId]) {
                                            link.spanId = idMap[link.spanId];
                                        } else {
                                            var new_id = new_span_id();
                                        }
                                    }
                                });
                            }
                            if (span.parentSpanId) {
                                if (span.parentSpanId.match(template_regex)) {
                                    if (idMap[span.parentSpanId]) {
                                        span.parentSpanId = idMap[span.parentSpanId];
                                    }
                                } else if (new_ids) {
                                    if (idMap[span.parentSpanId]) {
                                        span.parentSpanId = idMap[span.parentSpanId];
                                    } else {
                                        var new_id = new_span_id();
                                        idMap[span.parentSpanId] = new_id;
                                        span.parentSpanId = new_id;
                                    }
                                }
                            }
                            const startTimeNano = BigInt(span.startTimeUnixNano);
                            if (strip_time || startTimeNano < curr_time) {
                                spans_with_time.push(span);
                            }
                        });
                    }
                });
            }
        });
        if (spans_with_time.length > 0) {
            for (var i = 0; i < spans_with_time.length; i++) {
                var new_start_time = curr_time - (largest_time - BigInt(spans_with_time[i].startTimeUnixNano));
                var new_end_time = curr_time - (largest_time - BigInt(spans_with_time[i].endTimeUnixNano));
                spans_with_time[i].startTimeUnixNano = new_start_time.toString();
                spans_with_time[i].endTimeUnixNano = new_end_time.toString();
            }
        }
    }
    return json;
}

function apply_log_template(json, new_ids = false, strip_time = false, idMap, curr_time, largest_time) {
    if (json.resourceLogs) {
        var logs_with_time = [];
        json.resourceLogs.forEach(rl => {
            if (rl.scopeLogs) {
                rl.scopeLogs.forEach(sl => {
                    if (sl.logRecords) {
                        sl.logRecords.forEach(lr => {
                            const logTimeNano = BigInt(lr.timeUnixNano);
                            if (strip_time || logTimeNano < curr_time) {
                                logs_with_time.push(lr);
                            }
                            if (lr.traceId) {
                                if (lr.traceId.match(template_regex) ) {
                                    if (idMap[lr.traceId]) {
                                        lr.traceId = idMap[lr.traceId];
                                    } else {
                                        var new_id = new_trace_id();
                                        idMap[lr.traceId] = new_id;
                                        lr.traceId = new_id;
                                    }
                                } else if (new_ids) {
                                    if (idMap[lr.traceId]) {
                                        lr.traceId = idMap[lr.traceId];
                                    } else {
                                        var new_id = new_trace_id();
                                        idMap[lr.traceId] = new_id;
                                        lr.traceId = new_id;
                                    }
                                }
                            }
                            if (lr.spanId) {
                                if (lr.spanId.match(template_regex)) {
                                    if (idMap[lr.spanId]) {
                                        lr.spanId = idMap[lr.spanId];
                                    } else {
                                        var new_id = new_span_id();
                                        idMap[lr.spanId] = new_id;
                                        lr.spanId = new_id;
                                    }
                                } else if (new_ids) {
                                    if (idMap[lr.spanId]) {
                                        lr.spanId = idMap[lr.spanId];
                                    } else {
                                        var new_id = new_span_id();
                                        idMap[lr.spanId] = new_id;
                                        lr.spanId = new_id;
                                    }
                                }
                            }
                        });
                    }
                });
            }
        });
        if (logs_with_time.length > 0) {
            for (var i = 0; i < logs_with_time.length; i++) {
                var new_time = curr_time - (largest_time - BigInt(logs_with_time[i].timeUnixNano));
                logs_with_time[i].timeUnixNano = new_time.toString();
                logs_with_time[i].observedTimeUnixNano = new_time.toString();
            }
        }
    }
    return json;
}

function apply_datapoint_template(datapoints, curr_time, strip_time, datapoints_with_time) {
    if(datapoints) {
        datapoints.forEach(dp => {
            const dataPointTimeNano = BigInt(dp.timeUnixNano);
            if (strip_time || dataPointTimeNano < curr_time) {
                datapoints_with_time.push(dp);
            }
        });
    }
}

function apply_metric_template(json, new_ids = false, strip_time = false, idMap, curr_time, largest_time) {
    if (json.resourceMetrics) {
        var datapoints_with_time = [];
        json.resourceMetrics.forEach(rm => {
            if (rm.scopeMetrics) {
                rm.scopeMetrics.forEach(sm => {
                    if (sm.metrics) {
                        sm.metrics.forEach(m => {
                            if (m.sum) {
                                apply_datapoint_template(m.sum.dataPoints, curr_time, strip_time,datapoints_with_time, idMap);
                            }
                            if (m.gauge) {
                                apply_datapoint_template(m.gauge.dataPoints, curr_time, strip_time,datapoints_with_time, idMap);
                            }
                            if (m.histogram) {
                                apply_datapoint_template(m.histogram.dataPoints, curr_time, strip_time, datapoints_with_time, idMap);
                            }
                            if (m.exponentialHistogram) {
                                apply_datapoint_template(m.exponentialHistogram.dataPoints, curr_time, strip_time, datapoints_with_time, idMap);
                            }
                        });
                    }
                });
            }
        });
        if (datapoints_with_time.length > 0) {
            for (var i = 0; i < datapoints_with_time.length; i++) {
                var new_time = curr_time - (largest_time - BigInt(datapoints_with_time[i].timeUnixNano));
                datapoints_with_time[i].timeUnixNano = new_time.toString();
                datapoints_with_time[i].startTimeUnixNano = new_time.toString();
            }
        }
    }
    return json;
}

// regex for applying templates
const template_regex = /\{\{.*?\}\}/g;

// apply template rules to the json object, and return the new json object
function apply_template(json, new_ids = false, strip_time = false) {
    const curr_time = BigInt(Date.now()) * BigInt(1000000);
    var idMap = {};
    const largest_time = find_largest_time(json);       // need to calculate the relative time for re-time
    if (Array.isArray(json)) {
        json.forEach(item => {
            apply_trace_template(item, new_ids, strip_time, idMap, curr_time, largest_time);
            apply_log_template(item, new_ids, strip_time, idMap, curr_time, largest_time);
            apply_metric_template(item, new_ids, strip_time, idMap, curr_time, largest_time);
        });
    } else {
        apply_trace_template(json, new_ids, strip_time, idMap, curr_time, largest_time);
        apply_log_template(json, new_ids, strip_time, idMap, curr_time, largest_time);
        apply_metric_template(json, new_ids, strip_time, idMap, curr_time, largest_time);
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
    }, { passive: true});

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
    }, { passive: true});

    document.getElementById("trace_log_combo").addEventListener("click", () => {
        // load up the simple trace json into the text area 'otel_input'
        if(template_dir) {
            fetch('/api/get_json?path=' + template_dir + "/combo_trace_log.json")
                .then(response => response.json())
                .then(json => {
                    //document.getElementById('otel_input').textContent = JSON.stringify(json, null, 2);    
                    otelcol_json_input.setValue(JSON.stringify(json, null, 2));
                })
                .catch(error => console.error('Error fetching otelcol config:', error));
        }
    }, { passive: true});

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
    }, { passive: true});

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
    }, { passive: true});
}

