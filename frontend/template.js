function new_trace_id() {
    return crypto.randomUUID().replace(/-/g, '');
}

function new_span_id() {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function apply_trace_template(json, new_ids = false, strip_time = false) {
    if (json.resourceSpans) {
        const curr_time = BigInt(Date.now()) * BigInt(1000000);
        var idMap = {};
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
                            if (span.parentSpanId && span.parentSpanId.match(template_regex)) {
                                if (idMap[span.parentSpanId]) {
                                    span.parentSpanId = idMap[span.parentSpanId];
                                }
                            } else if (new_ids) {
                                // check if the parentSpanId is in the map
                                if (idMap[span.parentSpanId]) {
                                    span.parentSpanId = idMap[span.parentSpanId];
                                }
                            }
                            const startTimeNano = BigInt(span.startTimeUnixNano);
                            if (strip_time) {
                                spans_with_time.push(span);
                            }
                            else if (startTimeNano < curr_time) {
                                const newStartTime = curr_time + startTimeNano;
                                span.startTimeUnixNano = newStartTime.toString();
                                span.endTimeUnixNano = (newStartTime + BigInt(span.endTimeUnixNano)).toString();
                            }
                        });
                    }
                });
            }
        });
        if (spans_with_time.length > 0) {
            // sort the spans by startTimeUnixNano
            spans_with_time.sort((a, b) => {
                return Number(a.endTimeUnixNano) - Number(b.endTimeUnixNano);
            });
            // get the largest startTimeUnixNano
            const largest_time = BigInt(spans_with_time[spans_with_time.length - 1].endTimeUnixNano);
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

function apply_log_template(json, new_ids = false, strip_time = false) {
    if (json.resourceLogs) {
        const curr_time = BigInt(Date.now()) * BigInt(1000000);
        var idMap = {};
        var logs_with_time = [];
        json.resourceLogs.forEach(rl => {
            if (rl.scopeLogs) {
                rl.scopeLogs.forEach(sl => {
                    if (sl.logRecords) {
                        sl.logRecords.forEach(lr => {
                            const logTimeNano = BigInt(lr.timeUnixNano);
                            if (strip_time) {
                                logs_with_time.push(lr);
                            }
                            if (new_ids) {
                                 if(lr.attributes) {
                                    lr.attributes.forEach(attr => {
                                        if (attr.key == "traceId") {
                                            if (idMap[attr.value.stringValue]) {
                                                attr.value.stringValue = idMap[attr.value.stringValue];
                                            } else {
                                                var new_id = new_trace_id();
                                                idMap[attr.value.stringValue] = new_id;
                                                attr.value.stringValue = new_id;
                                            }
                                        } else if (attr.key == "spanId") {
                                            if (idMap[attr.value.stringValue]) {
                                                attr.value.stringValue = idMap[attr.value.stringValue];
                                            } else {
                                                var new_id = new_span_id();
                                                idMap[attr.value.stringValue] = new_id;
                                                attr.value.stringValue = new_id;
                                            }
                                        }
                                    });
                                 }
                            }
                            else if (logTimeNano < curr_time) {
                                const newLogTime = curr_time + logTimeNano;
                                lr.timeUnixNano = newLogTime.toString();
                                lr.observedTimeUnixNano = newLogTime.toString();
                            }
                        });
                    }
                });
            }
        });
        if (logs_with_time.length > 0) {
            // sort the logs by timeUnixNano
            logs_with_time.sort((a, b) => {
                return Number(a.timeUnixNano) - Number(b.timeUnixNano);
            });
            // get the largest timeUnixNano
            const largest_time = BigInt(logs_with_time[logs_with_time.length - 1].timeUnixNano);
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
            if (strip_time) {
                datapoints_with_time.push(dp);
            }
            else if (dataPointTimeNano < curr_time) {
                const newDataPointTime = curr_time + dataPointTimeNano;
                dp.timeUnixNano = newDataPointTime.toString();
                dp.startTimeUnixNano = newDataPointTime.toString();
            }
        });
    }
}

function apply_metric_template(json, new_ids = false, strip_time = false) {
    if (json.resourceMetrics) {
        const curr_time = BigInt(Date.now()) * BigInt(1000000);
        var idMap = {};
        var datapoints_with_time = [];
        json.resourceMetrics.forEach(rm => {
            if (rm.scopeMetrics) {
                rm.scopeMetrics.forEach(sm => {
                    if (sm.metrics) {
                        sm.metrics.forEach(m => {
                            if (m.sum) {
                                apply_datapoint_template(m.sum.dataPoints, curr_time, strip_time,datapoints_with_time);
                            }
                            if (m.gauge) {
                                apply_datapoint_template(m.gauge.dataPoints, curr_time, strip_time,datapoints_with_time);
                            }

                            if (m.histogram) {
                                apply_datapoint_template(m.histogram.dataPoints, curr_time, strip_time, datapoints_with_time);
                            }

                            if (m.exponentialHistogram) {
                                apply_datapoint_template(m.exponentialHistogram.dataPoints, curr_time, strip_time, datapoints_with_time);
                            }
                        });
                    }
                });
            }
        });
        if (datapoints_with_time.length > 0) {
            // sort the datapoints by timeUnixNano
            datapoints_with_time.sort((a, b) => {
                return Number(a.timeUnixNano) - Number(b.timeUnixNano);
            });
            // get the largest timeUnixNano
            const largest_time = BigInt(datapoints_with_time[datapoints_with_time.length - 1].timeUnixNano);
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
    if (Array.isArray(json)) {
        json.forEach(item => {
            apply_trace_template(item, new_ids, strip_time);
            apply_log_template(item, new_ids, strip_time);
            apply_metric_template(item, new_ids, strip_time);
        });
    } else {
        apply_trace_template(json, new_ids, strip_time);
        apply_log_template(json, new_ids, strip_time);
        apply_metric_template(json, new_ids, strip_time);
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

