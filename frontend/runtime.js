// global variables to store the configs
var otel_collector = null;
var refinery = null;
var work_dir = null;
var template_dir = null;

// global variable for refinery output websocket
var refinery_out_ws = null;
var refinery_out_ws_ping = 0;
// global
var otelcol_out_ws = null;
var otelcol_out_ws_ping = 0;
// global variables for otelcol standard output
var otelcol_stdout_ws = null;
var otelcol_stdout_ws_ping = 0;
// global variables for refinery standard output
var refinery_stdout_ws = null;
var refinery_stdout_ws_ping = 0;
// global variables for otelcol and refinery setup websocket
var otelcol_setup_ws = null;
var otelcol_setup_ws_ping = 0;
var refinery_setup_ws = null;
var refinery_setup_ws_ping = 0;

// global variables for otelcol and refinery installed
var collector_installed = false;
var refinery_installed = false;

// initial values for various configs
var otelcol_config_current = null;
var refinery_config_current = null;
var refinery_rule_current = null;

// global variables for otelcol and refinery versions
var otelcol_version = "0.0.0";
var refinery_version = "0.0.0";

// currently selected item from result.
// if none, then -1
var current_result = -1;
// currently selected item from input.
var current_input = -1;
// currently selected item from otelcol config history
var current_otelcol_config = -1;
// currently selected item from refinery config history
var current_refinery_config = -1;
// currently selected item from refinery rule history
var current_refinery_rule = -1;

// currently selected item from edit section
var current_edit = null;

// turndown service for converting html to markdown or vice versa
const turndownService = new TurndownService();

function init_refinery_out_ws(config) {
    if (refinery_out_ws == null) {
        try {
            // refinery_out_ws = new WebSocket("ws://localhost:3000/refinery_out");
            // setup a secure websocket if the config.host_name is not localhost
            if(config.host_name.includes("localhost")) {
                refinery_out_ws = new WebSocket(`ws://${config.host_name}/refinery_out`);
            } else {
                refinery_out_ws = new WebSocket(`wss://${config.host_name}/refinery_out`);
            }
            refinery_out_ws.onmessage = (event) => {
                const message = event.data;
                // var textarea = document.getElementById("refinery_sample_result");
                if(message !== "{{pong}}") {
                    // textarea.value += message;
                    // textarea.scrollTop = textarea.scrollHeight;
                    var value = refinery_sample_result.getValue();
                    value += message;
                    refinery_sample_result.setValue(value);
                    refinery_sample_result.setCursor(refinery_sample_result.lineCount(), 0);
                } else {
                    refinery_out_ws_ping = 0;
                }
            };
            refinery_out_ws.onclose = () => {
                console.log("refinery_out_ws: Websocket connection closed.");
                refinery_out_ws = null;
                refinery_out_ws_ping = 0;
                setTimeout(init_refinery_out_ws(config), 1000);
            };
        } catch (error) {
            console.error("Error initializing refinery_out_ws:", error);
            setTimeout(init_refinery_out_ws(config), 1000);
        }
    }
}

function append_otel_input(input) {
    var select = document.getElementById("otel_inputs");
    var option = document.createElement("option");
    option.input = input;
    var num_options = select.options.length;
    option.text = num_options + 1;
    select.appendChild(option);
    // update the selected element
    select.selectedIndex = num_options;
    // return the request number
    current_input = num_options;
    return option.text;
}

function append_otelcol_result(message) {
    var select = document.getElementById("otelcol_results");
    var option = document.createElement("option");
    option.result = message;
    var num_options = select.options.length;
    option.text = num_options + 1;
    select.appendChild(option);
    // update the selected element
    select.selectedIndex = num_options;
    // return the request number
    current_result = num_options;
    return option.text;
}

function append_otelcol_config_history(config) {
    var select = document.getElementById("otelcol_config_history");
    var option = document.createElement("option");
    option.config = config;
    var num_options = select.options.length;
    option.text = num_options + 1;
    select.appendChild(option);
    // update the selected element
    select.selectedIndex = num_options;
    // return the request number
    current_otelcol_config = num_options;
    otelcol_config_current = config;
    return option.text;
}

function append_refinery_config_history(config) {
    var select = document.getElementById("refinery_config_history");
    var option = document.createElement("option");
    option.config = config;
    var num_options = select.options.length;
    option.text = num_options + 1;
    select.appendChild(option);
    // update the selected element
    select.selectedIndex = num_options;
    // return the request number
    current_refinery_config = num_options;
    refinery_config_current = config;
    return option.text;
}

function append_refinery_rule_history(rule) {
    var select = document.getElementById("refinery_rule_history");
    var option = document.createElement("option");
    option.rule = rule;
    var num_options = select.options.length;
    option.text = num_options + 1;
    select.appendChild(option);
    // update the selected element
    select.selectedIndex = num_options;
    // return the request number
    current_refinery_rule = num_options;
    refinery_rule_current = rule;
    return option.text;
}

function init_otelcol_out_ws(config) {
    var ws_url = (config.host_name.includes("localhost")) ? "ws" : "wss";
    try {
        otelcol_out_ws = new WebSocket(`${ws_url}://${config.host_name}/otelcol_out`);
        otelcol_out_ws.onmessage = (event) => {
            const message = event.data;
            // console.log("otelcol_out_ws: ", message);
            // var textarea = document.getElementById("otelcol_result");
            if(message !== "{{pong}}") {
                // textarea.value += message;
                // textarea.scrollTop = textarea.scrollHeight;
                // var value = otelcol_json_output.getValue();
                // value += message;
                // check if the send mode is set to auto, and if so,
                // we should send this off to the whatever output endpoint - that can receive otlp json
                otelcol_json_output.setValue(message);
                // put message into the cache, so that it can be revisited.
                append_otelcol_result(message);
                otelcol_json_output.setCursor(otelcol_json_output.lineCount(), 0);
                // if the send auto mode is enabled, then send the data to the endpoint.
                if (document.getElementById("otelcol_send_auto").value == "true") {
                    var endpoint = document.getElementById("otelcol_send_endpoint").value;
                    var apikey = document.getElementById("otelcol_send_apikey").value;
                    var json_data = otelcol_json_output.getValue();
                    document.getElementById("otelcol_send_status").innerHTML = "Sending...";
                    fetch('/api/send_json?url=' + encodeURIComponent(endpoint), {
                        method: 'POST',
                        body: json_data,
                        headers: {
                            'Content-Type': 'application/json',
                            'x-honeycomb-team': apikey
                            }
                        })
                        .then(response => response.json())
                        .then(data => {
                            console.log(data.message);
                            document.getElementById("otelcol_send_status").innerHTML = data.message;
                        })
                        .catch(error => {
                            console.error('Error sending json:', error)
                            document.getElementById("otelcol_send_status").innerHTML = error.message;
                        });
                }
            } else {
                otelcol_out_ws_ping = 0;
            }
        };
        otelcol_out_ws.onclose = () => {
            console.log("otelcol_out_ws: Websocket connection closed.");
            otelcol_out_ws = null;
            otelcol_out_ws_ping = 0;
            setTimeout(init_otelcol_out_ws(config), 1000);
        };
    } catch (error) {
        setTimeout(init_otelcol_out_ws(config), 1000);
    }
}

function init_otelcol_stdout_ws(config) {
    var ws_url = (config.host_name.includes("localhost")) ? "ws" : "wss";
    // setup the websocket for otelcol standard output
    try {
        // setup a secure websocket if the config.host_name is not localhost
        otelcol_stdout_ws = new WebSocket(`${ws_url}://${config.host_name}/otelcol_stdout`);
        otelcol_stdout_ws.onmessage = (event) => {
            const message = event.data;
            // console.log("otelcol_stdout_ws: ", message);
            // var textarea = document.getElementById("otelcol_output");
            if(message !== "{{pong}}") {
                // textarea.value += message;
                // textarea.scrollTop = textarea.scrollHeight;
                var value = otelcol_output.getValue();
                value += message;
                otelcol_output.setValue(value);
                otelcol_output.setCursor(otelcol_output.lineCount(), 0);
            } else {
                otelcol_stdout_ws_ping = 0;
            }
        };
        otelcol_stdout_ws.onclose = () => {
            otelcol_stdout_ws = null;
            otelcol_stdout_ws_ping = 0;
            setTimeout(init_otelcol_stdout_ws(config), 1000);
        };
    } catch (error) {
        setTimeout(init_otelcol_stdout_ws(config), 1000);
    }
}

function init_refinery_stdout_ws(config) {
    var ws_url = (config.host_name.includes("localhost")) ? "ws" : "wss";
    // setup the websocket for refinery standard output
    try {
        // setup a secure websocket if the config.host_name is not localhost
        refinery_stdout_ws = new WebSocket(`${ws_url}://${config.host_name}/refinery_stdout`);
        refinery_stdout_ws.onmessage = (event) => {
            const message = event.data;
            // console.log("refinery_stdout_ws: ", message);
            // var textarea = document.getElementById("refinery_output");
            if(message !== "{{pong}}") {
                // textarea.value += message;
                // textarea.scrollTop = textarea.scrollHeight;
                var value = refinery_output.getValue();
                value += message;
                refinery_output.setValue(value);
                refinery_output.setCursor(refinery_output.lineCount(), 0);
            } else {
                refinery_stdout_ws_ping = 0;
            }
        };
        refinery_stdout_ws.onclose = () => {
            refinery_stdout_ws = null;
            refinery_stdout_ws_ping = 0;
            setTimeout(init_refinery_stdout_ws(config), 1000);
        };
    } catch (error) {
        setTimeout(init_refinery_stdout_ws(config), 1000);
    }
}

function init_otelcol_setup_ws(config) {
    var ws_url = (config.host_name.includes("localhost")) ? "ws" : "wss";
    // setup the websocket for otelcol setup
    try {
        otelcol_setup_ws = new WebSocket(`${ws_url}://${config.host_name}/otelcol_setup`);
        otelcol_setup_ws.onmessage = (event) => {
            const message = event.data;
            if(message == "{{cancelled}}") {
                // server has cancelled the installation
                // cancel the installation
                document.getElementById("otelcol_install_cancel").style.display = "none";
                document.getElementById("otelcol_install").disabled = false;
                document.getElementById("otelcol_install_status").innerText = "🔴 Cancelled";
            }
            else if(message != "{{pong}}") {
                // parse the message as json
                var json = JSON.parse(message);
                // look for html in the message
                if(json.html) {
                    // render the html in the div with id 'otelcol_setup'
                    document.getElementById("otelcol_install_status").innerHTML = json.html;
                }
                if(json.status) {
                    if(json.status == "success") {
                        document.getElementById("otelcol_install").disabled = false;
                        // should have success message here
                        document.getElementById("otelcol_install_status").innerText = json.html;
                        // hide the cancel button
                        document.getElementById("otelcol_install_cancel").style.display = "none";
                        // refresh the main page
                        // refresh the main page, such that...
                        refresh_otelcol_status();
                    }
                    else if(json.status == "downloading") {
                        // do nothing - maybe set some animtation sequence..?
                    }
                }
                // console.log("otelcol_setup_ws: ", message);
            } 
            else {
                otelcol_setup_ws_ping = 0;
            }
        };
        otelcol_setup_ws.onclose = () => {
            otelcol_setup_ws = null;
            otelcol_setup_ws_ping = 0;
            // try to reconnect
            setTimeout(init_otelcol_setup_ws(config), 1000);
        };
    } catch (error) {
        setTimeout(init_otelcol_setup_ws(config), 1000);
    }
}

function init_refinery_setup_ws(config) {
    var ws_url = (config.host_name.includes("localhost")) ? "ws" : "wss";
    // setup the websocket for refinery setup
    try {
        // setup a secure websocket if the config.host_name is not localhost
        refinery_setup_ws = new WebSocket(`${ws_url}://${config.host_name}/refinery_setup`);
        refinery_setup_ws.onmessage = (event) => {
            const message = event.data;
            if(message == "{{cancelled}}") {
                // server has cancelled the installation
                // cancel the installation
                document.getElementById("refinery_install_cancel").style.display = "none";
                document.getElementById("refinery_install").disabled = false;
                document.getElementById("refinery_install_status").innerText = "🔴 Cancelled";
            }
            else if(message != "{{pong}}") {
                var json = JSON.parse(message);
                // look for html in the message
                if(json.html) {
                    // render the html in the div with id 'refinery_install_status'
                    document.getElementById("refinery_install_status").innerHTML = json.html;
                }
                if(json.status == "success") {
                    document.getElementById("refinery_install").disabled = false;
                    // should have success message here
                    document.getElementById("refinery_install_status").innerText = json.html;
                    // hide the cancel button
                    document.getElementById("refinery_install_cancel").style.display = "none";
                    // refresh the main page
                    refresh_refinery_status();
                }
                else if(json.status == "downloading") {
                    // do nothing - maybe set some animtation sequence..?
                }
            } else {
                refinery_setup_ws_ping = 0;
            }
        };
        refinery_setup_ws.onclose = () => {
            refinery_setup_ws = null;
            refinery_setup_ws_ping = 0;
            // try to reconnect
            setTimeout(init_refinery_setup_ws(config), 1000);
        };
    } catch (error) {
        // do not log anything here, but retry establishing the websocket
        setTimeout(init_refinery_setup_ws(config), 1000);
    }
}

// initialize the websocket
// config is json object from config.yaml
function init_ws(config) {
// setup the websocket for refinery output
    init_otelcol_out_ws(config);
    init_refinery_out_ws(config);
    init_otelcol_stdout_ws(config);
    init_refinery_stdout_ws(config);
    init_otelcol_setup_ws(config);
    init_refinery_setup_ws(config);
}

function toggle_edit_section(section, button) {
    if(current_edit) {
        if(current_edit == section) {
            document.getElementById("otelcol_" + section + "_section").style.display = "none";
            document.getElementById("otelcol_" + current_edit).value = "▸ " + document.getElementById("otelcol_" + current_edit).value.substring(2);
            document.getElementById("otelcol_" + current_edit).classList.remove("active");
            current_edit = null;
        } else {
            document.getElementById("otelcol_" + current_edit + "_section").style.display = "none";
            document.getElementById("otelcol_" + current_edit).value = "▸ " + document.getElementById("otelcol_" + current_edit).value.substring(2);
            document.getElementById("otelcol_" + current_edit).classList.remove("active");
            document.getElementById("otelcol_" + section + "_section").style.display = "flex";
            current_edit = section;
            var button_value = button.value;
            button.value = "▾ " + button_value.substring(2);
            button.classList.add("active");
        }
    } 
    else {
        document.getElementById("otelcol_" + section + "_section").style.display = "flex";
        current_edit = section;
        var button_value = button.value;
        button.value = "▾ " + button_value.substring(2);
        button.classList.add("active");
    }
}

// list of otel collector modules
// receivers, processors, exporters, extensions, connectors, etc.
var otel_modules = null;

// initializes information about otel modules (receivers, processors, exporters, extensions)
async function init_edit_section(config) {
    if(current_edit) {
        toggle_edit_section(current_edit, document.getElementById("otelcol_" + current_edit));
        current_edit = null;
    }
    update_edit_section(config);
}

/**
 * logics to initialize all the 
 * @returns 
 */
async function init_page() {

    // setup the main page (otelcol and refinery ui)
    refresh_main();

    // want to make sure the dom element 'otelcol_start' button is loaded and available.
    // if not, wait for 100ms and check again
    if (document.getElementById("otelcol_start") == null || document.getElementById("refinery_start") == null) {
        setTimeout(init_page, 100);
    } else {
        // initialize the websocket, template, and textareas
        var response = await fetch('/api/config');
        var config = await response.json();
        init_ws(config);
        await init_edit_section(config);
        // if collector and refinery is not set, we need to fetch them.
        if (otel_collector == null || refinery == null) {
            // fetch synchronously and catch error
            try {
                otel_collector = config.otel_collector;
                refinery = config.refinery;
                work_dir = config.work_dir;
                template_dir = config.template_dir;
                collector_installed = config.collector_installed;
                refinery_installed = config.refinery_installed;

                init_template();
                init_textareas();
                init_dialog();

                if(collector_installed) {
                    document.getElementById("otelcol_install_status").innerText = "🟢 Installed";
                    if (config.collector_config_exists) {
                        fetch('/api/get_yaml?path=' + otel_collector.config_path)
                          .then(response => response.text())
                          .then(yaml => {
                            //document.getElementById('otelcol_config').textContent = yaml;
                            otelcol_editor.setValue(yaml);
                            otelcol_config_current = yaml;
                            document.getElementById("otelcol_save").disabled = true;
                          })
                          .catch(error => console.error('Error fetching otelcol config:', error));
                      }
                }
                if(refinery_installed) {
                    document.getElementById("refinery_install_status").innerText = "🟢 Installed";
                    if (config.refinery_config_exists) {
                        fetch('/api/get_yaml?path=' + refinery.config_path)
                          .then(response => response.text())
                          .then(yaml => {
                            // document.getElementById('refinery_config').textContent = yaml;
                            refinery_editor.setValue(yaml);
                            refinery_config_current = yaml;
                            document.getElementById("refinery_save").disabled = true;
                            if (config.refinery_rule_exists) {
                              fetch('/api/get_yaml?path=' + refinery.rule_path)
                                .then(response => response.text())
                                .then(_yaml => {
                                  // document.getElementById('refinery_rule').textContent = _yaml;
                                  refinery_rule_editor.setValue(_yaml);
                                  refinery_rule_current = _yaml;
                                  document.getElementById("refinery_save").disabled = true;
                                })
                                .catch(error => console.error('Error fetching refinery rule:', error)); 
                            }
                          })
                          .catch(error => console.error('Error fetching refinery config:', error));
                      }
                }
            } catch (error) {
                // don't do anything if the pid is not found
                // console.error('init_page: Error fetching config:', error);
                return;
            }
        }

        // setup the event listener for the otel_inputs select element
        document.getElementById("otel_inputs").addEventListener("change", (event)=> {
            var selected_index = event.target.selectedIndex;
            var input = event.target.options[selected_index].input;
            // before setting the input, get the current input.
            var _input = otelcol_json_input.getValue();
            // compare the input with the current input, and if they are different, update it.
            if( _input != event.target.options[current_input].input) {
                event.target.options[current_input].input = _input;
            }
            // set the input to the otel_input textarea
            otelcol_json_input.setValue(input);
            // update the current input`
            current_input = selected_index;
        }, { passive: true });

        // setup the event listener for the otelcol_results select element
        // invoked when the user selects a different result from the dropdown
        document.getElementById("otelcol_results").addEventListener("change", (event) => {
            var selected_index = event.target.selectedIndex;
            var result = event.target.options[selected_index].result;
            // before setting the result, get the current result.
            var _result = otelcol_json_output.getValue();
            // compare the result with the current result, and if they are different, update it.
            if( _result != event.target.options[current_result].result) {
                event.target.options[current_result].result = _result;
            }
            // set the result to the otelcol_json_output textarea
            otelcol_json_output.setValue(result);
            // update the current result
            current_result = selected_index;
        }, { passive: true});

        document.getElementById("otelcol_config_history").addEventListener("change", (event) => {
            var selected_index = event.target.selectedIndex;
            var config = event.target.options[selected_index].config;
            otelcol_editor.setValue(config);
            otelcol_config_current = config;
            document.getElementById("otelcol_save").disabled = false;
        }, { passive: true});

        document.getElementById("refinery_config_history").addEventListener("change", (event) => {
            var selected_index = event.target.selectedIndex;
            var config = event.target.options[selected_index].config;
            refinery_editor.setValue(config);
            refinery_config_current = config;
            document.getElementById("refinery_save").disabled = false;
        }, { passive: true});

        document.getElementById("refinery_rule_history").addEventListener("change", (event) => {
            var selected_index = event.target.selectedIndex;
            var rule = event.target.options[selected_index].rule;
            refinery_rule_editor.setValue(rule);
            refinery_rule_current = rule;
            document.getElementById("refinery_save").disabled = false;
        }, { passive: true});

        document.getElementById("otelcol_install_cancel").addEventListener("click", () => {
            console.log("Cancelling... otel collector installation");
            // will send cancel signal to the web socket
            if(otelcol_setup_ws) {
                otelcol_setup_ws.send("{{cancel}}");
                console.log("cancel signal sent to otelcol_setup_ws");
            }
        }, { passive: true});

        document.getElementById("refinery_install_cancel").addEventListener("click", () => {
            console.log("Cancelling... refinery installation");
            // will send cancel signal to the web socket
            if(refinery_setup_ws) {
                refinery_setup_ws.send("{{cancel}}");
                console.log("cancel signal sent to refinery_setup_ws");
            }
        }, { passive: true});

        // setup the action for the buttons to install otelcol and refinery
        document.getElementById("otelcol_install").addEventListener("click", () => {
            console.log("Installing... otel collector");
            // get the version from the select element
            var version = document.getElementById("otelcol_version").value;
            document.getElementById("otelcol_install").disabled = true;
            document.getElementById("otelcol_install_cancel").style.display = "inline-block";
            // install the otel collector
            fetch('/api/otelcol_install?version=' + version)
                .then(response => response.json())
                .then(data => {
                    if(data.started) {                
                        document.getElementById("otelcol_install_status").value = "Installing...";
                        console.log(data.message);
                    }
                    else {
                        console.error(data.message);
                        document.getElementById("otelcol_install").disabled = false;
                        document.getElementById("otelcol_install_cancel").style.display = "none";
                    }
                })
                .catch(error => {
                    console.error('Error installing otelcol:', error);
                    document.getElementById("otelcol_install").disabled = false;
                    document.getElementById("otelcol_install_cancel").style.display = "none";
                });
        }, { passive: true});

        // setup the action for the buttons to install refinery
        document.getElementById("refinery_install").addEventListener("click", () => {
            console.log("Installing... refinery");
            // get the version from the select element
            var version = document.getElementById("refinery_version").value;
            document.getElementById("refinery_install").disabled = true;
            document.getElementById("refinery_install_cancel").style.display = "inline-block";
            // install the refinery
            fetch('/api/refinery_install?version=' + version)
                .then(response => response.json())
                .then(data => {
                    if(data.started) {
                        document.getElementById("refinery_install_status").value = "Installing...";
                        console.log(data.message);
                    }
                    else {
                        console.error(data.message);
                        document.getElementById("refinery_install").disabled = false;
                        document.getElementById("refinery_install_cancel").style.display = "none";
                    }
                })
                .catch(error => {
                    console.error('Error installing refinery:', error);
                    document.getElementById("refinery_install").disabled = false;
                    document.getElementById("refinery_install_cancel").style.display = "none";
                });
        }, { passive: true});

        /* ********** OpenAI ********** */

        /**
         * Initialize the openai which handles JSON input of OTEL data.
         */
        init_input_openai("openai_4_input", "otel_input", [
            {
                "role": "system",
                "content": `You are a helpful assistant that generates Opentelemetry JSON data. 
                Validate the JSON data before outputting it. Make sure the JSON data is conform to the OpenTelemetry specification.
                Use OpenTelemetry sementic convention when naming the attributes as best as possible.
                You are to output the JSON data only, nothing else. Do not include any other text or comments. enclose the JSON data in \`\`\` and \`\`\` tags.`
            },
            {
                "role": "system",
                "content": `Here is an example of the TRACE JSON data that you can use to generate the next JSON data in case user wants to generate a trace: \`\`\`json|n${otel_example_trace}\`\`\``
            },
            {
                "role": "system",
                "content": `Here is an example of the METRIC JSON data that you can use to generate the next JSON data in case user wants to generate a metric: \`\`\`json|n${otel_example_metric}\`\`\``
            },
            {
                "role": "system",
                "content": `Here is an example of the LOG JSON data that you can use to generate the next JSON data in case user wants to generate a log: \`\`\`json|n${otel_example_log}\`\`\``
            },
            {
                "role": "system",
                "content": `Here is an example of the TRACE LOG JSON data that you can use to generate the next JSON data in case user wants to generate a trace with log: \`\`\`json|n${otel_example_trace_log}\`\`\``
            }
        ],
        (id_prefix)=>{
            // prompt hook
            var prompt = [];
            if(id_prefix == "otel_input") {
                // check the otelcol_json_input and if the input is not empty and has length, then add it to the prompt
                var input = otelcol_json_input.getValue();
                if(input && input.length > 0) {
                    prompt.push({
                        "role": "system",
                        "content": `The following is the current JSON datato the otel collector. Use this as a base to generate the next JSON data: \`\`\`json|n${input}\`\`\``
                    });
                }
            }
            return prompt;
        }, 
        (id_prefix)=>{
            if(id_prefix == "otel_input") {
                // start hook
                // currently do nothing. pass.
            }
        }, 
        (id_prefix, domElement)=>{
            if(id_prefix == "otel_input") {
                // end hook
                // extract the json text from the domElement
                console.log("dom element text: " + domElement.innerText);
                var jsonText = domElement.innerText.match(/```(json)?([\S\s]*)```/)[2];
                // append the text to the otelcol_json_input
                var jsonText = JSON.stringify(JSON.parse(jsonText), null, 2);
                domElement.innerHTML = "<pre>" + jsonText + "</pre>";
                otelcol_json_input.setValue(jsonText);
            }
        });

        // if both buttons are found, then we can register the event listeners
        if (document.getElementById("otelcol_start") != null && document.getElementById("refinery_start") != null) {

            // register the function to be invoked when 'start' button is clicked
            document.getElementById("otelcol_start").addEventListener("click", () => {
                console.log("Starting... otel collector");
                fetch('/api/otelcol_start')
                    .then(response => response.json())
                    .then(data => {
                        if (data.result) {
                            document.getElementById("otelcol_start").disabled = true;
                            document.getElementById("otelcol_stop").disabled = false;
                            document.getElementById("otelcol_stop").setAttribute("pid", data.pid);
                        }
                        else {
                            console.error(data.error);
                        }
                    })
                    .catch(error => console.error('Error starting otelcol:', error));
            }, { passive: true});

            // register the function to be invoked when 'start' button is clicked
            document.getElementById("refinery_start").addEventListener("click", () => {
                console.log("Starting... refinery");
                fetch('/api/refinery_start')
                    .then(response => response.json())
                    .then(data => {
                        console.log(data.message);
                        if (data.result) {
                            document.getElementById("refinery_start").disabled = true;
                            document.getElementById("refinery_stop").disabled = false;
                            document.getElementById("refinery_stop").setAttribute("pid", data.pid);
                        }
                        else {
                            console.error(data.error);
                        }
                    })
                    .catch(error => console.error('Error starting refinery:', error));
            }, { passive: true});

            // also register the stop buttons
            document.getElementById("otelcol_stop").addEventListener("click", event => {
                var pid = event.currentTarget.getAttribute("pid");
                fetch('/api/stop?pid=' + pid)
                    .then(response => response.json())
                    .then(data => {
                        console.log(data.message);
                        if(data.status == "success") {
                            // reset the buttons
                            document.getElementById("otelcol_start").disabled = false;
                            document.getElementById("otelcol_stop").disabled = true;
                            document.getElementById("otelcol_stop").setAttribute("pid", "");
                            document.getElementById("otelcol_status").innerText = "🔴 Stopped";
                        }
                    })
                    .catch(error => console.error('Error stopping pid:', error));
            }, { passive: true});

            document.getElementById("refinery_stop").addEventListener("click", event => {
                var pid = event.currentTarget.getAttribute("pid");
                fetch('/api/stop?pid=' + pid)
                    .then(response => response.json())
                    .then(data => {
                        console.log(data.message);
                        if(data.status == "success") {
                            // reset the buttons
                            document.getElementById("refinery_start").disabled = false;
                            document.getElementById("refinery_stop").disabled = true;
                            document.getElementById("refinery_stop").setAttribute("pid", "");
                            document.getElementById("refinery_status").innerText = "🔴 Stopped";
                        }
                    })
                    .catch(error => console.error('Error stopping pid:', error));
            }, { passive: true});

            // register the function to be invoked when 'save' button is clicked
            document.getElementById("otelcol_save").addEventListener("click", event => {
                console.log("Saving... otel collector config");
                // get the text from the textarea otelcol_config
                // var config = document.getElementById("otelcol_config").value;
                var config = otelcol_editor.getValue();
                // save the config to the server
                fetch('/api/save_yaml?path=' + otel_collector.config_path, {
                    method: 'POST',
                    body: config,
                    headers: {
                        'Content-Type': 'text/plain'
                    }
                })
                    .then(response => response.json())
                    .then(data => {
                        console.log(data.message);
                        if (current_otelcol_config != -1) {
                            var config_history = document.getElementById("otelcol_config_history");
                            var selected_index = config_history.selectedIndex;
                            var _config = config_history.options[selected_index].config;
                            if(_config != config) {
                                append_otelcol_config_history(config);
                            }
                        } else {
                            append_otelcol_config_history(config);
                        }
                        document.getElementById("otelcol_save").disabled = true;
                    })
                    .catch(error => console.error('Error saving otelcol config:', error));
            }, { passive: true});

            document.getElementById("refinery_save").addEventListener("click", event => {
                console.log("Saving... refinery config");
                // get the text from the textarea refinery_config
                //var config = document.getElementById("refinery_config").value;
                var config = refinery_editor.getValue();
                // save the config to the server
                fetch('/api/save_yaml?path=' + refinery.config_path, {
                    method: 'POST',
                    body: config,
                    headers: {
                        'Content-Type': 'text/plain'
                    }
                })
                    .then(response => response.json())
                    .then(data => {
                        console.log(data.message);
                        if (current_refinery_config != -1) {
                            var config_history = document.getElementById("refinery_config_history");
                            var selected_index = config_history.selectedIndex;
                            var _config = config_history.options[selected_index].config;
                            if(_config != config) {
                                append_refinery_config_history(config);
                            }
                        } else {
                            append_refinery_config_history(config);
                        }
                        document.getElementById("refinery_save").disabled = true;
                        // var rule = document.getElementById("refinery_rule").value;
                        var rule = refinery_rule_editor.getValue();
                        // save the rule to the server
                        fetch('/api/save_yaml?path=' + refinery.rule_path, {
                            method: 'POST',
                            body: rule,
                            headers: {
                                'Content-Type': 'text/plain'
                            }
                        })
                        .then(response => response.json())
                        .then(data => {
                            console.log(data.message);
                            if (current_refinery_rule != -1) {
                                var rule_history = document.getElementById("refinery_rule_history");
                                var selected_index = rule_history.selectedIndex;
                                var _rule = rule_history.options[selected_index].rule;
                                if(_rule != rule) {
                                    append_refinery_rule_history(rule);
                                }
                            } else {
                                append_refinery_rule_history(rule);
                            }
                            document.getElementById("refinery_save").disabled = true;
                        })
                        .catch(error => console.error('Error saving refinery rule:', error));
                    })
                    .catch(error => console.error('Error saving refinery config:', error));
            }, { passive: true});

            document.getElementById("refinery_clear").addEventListener("click", event => {
                console.log("Clearing... refinery outputs and results");
                // document.getElementById("refinery_output").value = "";
                // document.getElementById("refinery_sample_result").value = "";
                refinery_output.setValue("");
                refinery_sample_result.setValue("");
            }, { passive: true});

            document.getElementById("refinery_result_clear").addEventListener("click", event => {
                console.log("Clearing... refinery result outputs");
                refinery_sample_result.setValue("");
            }, { passive: true});

            document.getElementById("refinery_output_clear").addEventListener("click", event => {
                console.log("Clearing... refinery outputs");
                refinery_output.setValue("");
            }, { passive: true});

            // clear button for otel input
            document.getElementById("otel_input_clear").addEventListener("click", event => {
                console.log("Clearing... otel inputs");
                // document.getElementById("otel_input").value = "";
                otelcol_json_input.setValue("");
                current_input = -1;
                // clear the input cache
                var select = document.getElementById("otel_inputs");
                select.innerHTML = "";
            }, { passive: true});

            // clear button for otel collector result
            document.getElementById("otelcol_clear").addEventListener("click", event => {
                console.log("Clearing... otel collector and result outputs");
                // document.getElementById("otelcol_output").value = "";
                // document.getElementById("otelcol_result").value = "";
                otelcol_json_output.setValue("");
                otelcol_output.setValue("");
                current_result = -1;
                // clear the result cache
                var select = document.getElementById("otelcol_results");
                select.innerHTML = "";
            }, { passive: true});

            // clear button for otel collector output
            document.getElementById("otelcol_output_clear").addEventListener("click", event => {
                console.log("Clearing... otel collector outputs");
                otelcol_output.setValue("");
            }, { passive: true});

            // clear button for otel collector result   
            document.getElementById("otelcol_result_clear").addEventListener("click", event => {
                console.log("Clearing... otel collector result outputs");
                otelcol_json_output.setValue("");
                current_result = -1;
                // clear the result cache
                var select = document.getElementById("otelcol_results");
                select.innerHTML = "";
            }, { passive: true});

            // export the otel config to otelbin.io
            document.getElementById("otelcol_otelbin").addEventListener("click", event => {
                console.log("Exporting... otel collector config to otelbin.io");
                // var config = document.getElementById("otelcol_config").value;
                var config = otelcol_editor.getValue();
                var url = get_otelbin_url(config);
                window.open(url, '_blank');
            }, { passive: true});

            // reload config
            document.getElementById("otelcol_reload").addEventListener("click", event => {
                console.log("Reloading... otel collector config");
                var pid = document.getElementById("otelcol_stop").getAttribute("pid");

                // call save first
                var config = otelcol_editor.getValue();
                fetch('/api/save_yaml?path=' + otel_collector.config_path, {
                    method: 'POST',
                    body: config,
                    headers: {
                        'Content-Type': 'text/plain'
                    }
                })
                .then(response => response.json())
                .then(data => {
                    console.log(data.message);
                    // if config has changed, append the new config to the history
                    if(current_otelcol_config != -1) {
                        var _config = document.getElementById("otelcol_config_history").options[current_otelcol_config].config;
                        if(_config != config) {
                            append_otelcol_config_history(config);
                        }
                    } else {
                        append_otelcol_config_history(config);
                    }
                    document.getElementById("otelcol_save").disabled = true;
                    // now, reload the config
                    fetch('/api/refresh?pid=' + pid)
                        .then(response => response.json())
                        .then(data => {
                            console.log(data.message);
                        })
                        .catch(error => console.error('Error reloading otelcol config:', error));
                })
                .catch(error => console.error('Error saving otelcol config:', error));
            }, { passive: true});

            // send the json data to the endpoint in otel collector result
            document.getElementById("otelcol_send").addEventListener("click", event => {
                var endpoint = document.getElementById("otelcol_send_endpoint").value;
                var apikey = document.getElementById("otelcol_send_apikey").value;
                var json_data = otelcol_json_output.getValue();
                document.getElementById("otelcol_send_status").innerHTML = "Sending...";
                fetch('/api/send_json?url=' + encodeURIComponent(endpoint), {
                    method: 'POST',
                    body: json_data,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-honeycomb-team': apikey
                    }
                })
                .then(response => response.json())
                .then(data => {
                    console.log(data.message);
                    document.getElementById("otelcol_send_status").innerHTML = data.message;
                })
                .catch(error => {
                    console.error('Error sending json:', error)
                    document.getElementById("otelcol_send_status").innerHTML = error.message;
                });
            }, { passive: true});

            // send json to otel collector
            document.getElementById("otel_input_send").addEventListener("click", event => {
                console.log("sending json to otel collector");
                var otelcol_url = document.getElementById("otel_input_url").value;
                var json_data = otelcol_json_input.getValue();
                var new_ids = document.getElementById("otel_input_new_trace_span_id").checked;
                var strip_time = document.getElementById("otel_input_strip_timestamps").checked;

                // cache the json data to be appended
                append_otel_input(json_data);

                // apply template to the json_data right before sending
                json_data = JSON.stringify(apply_template(JSON.parse(json_data), new_ids, strip_time));
                var apikey = document.getElementById("otel_input_send_apikey").value;

                fetch('/api/send_json?url=' + encodeURIComponent(otelcol_url), {
                    method: 'POST',
                    body: json_data,
                    headers: {
                        'Content-Type': 'application/json',
                        'x-honeycomb-team': apikey
                    }
                })
                .then(response => response.json()) 
                .then(data => {
                    console.log(data.message);
                    console.log(data.result);
                    document.getElementById("otel_input_send_status").innerHTML = data.message;
                })
                .catch(error => {
                    console.error('Error sending json:', error);
                    document.getElementById("otel_input_send_status").innerHTML = error.message;
                });
            }, { passive: true});
        }
    }
}

function clear_status_otelcol() {
    if (is_otelcol_running()) {
        document.getElementById("otelcol_stop").disabled = true;
        document.getElementById("otelcol_stop").setAttribute("pid", "");
        document.getElementById("otelcol_status").innerText = "🔴 Stopped";
    }
}

function clear_status_refinery() {
    if (is_refinery_running()) {
        document.getElementById("refinery_stop").disabled = true;
        document.getElementById("refinery_stop").setAttribute("pid", "");
        document.getElementById("refinery_status").innerText = "🔴 Stopped";
    }
}

function clear_status_all() {
    clear_status_otelcol();
    clear_status_refinery();
}

function is_otelcol_running() {
    if (document.getElementById("otelcol_start").disabled == true) {
        return true;
    }
    return false;
}

function is_refinery_running() {
    if (document.getElementById("refinery_start").disabled == true) {
        return true;
    }
    return false;
}

function show_otelcol() {
    document.getElementById("otelcol").style.display = "block";
}

function hide_otelcol() {
    document.getElementById("otelcol").style.display = "none";  
}

function show_refinery() {
    document.getElementById("refinery").style.display = "block";
}

function hide_refinery() {
    document.getElementById("refinery").style.display = "none";
}

// refreshes various elements on the page
// 1. pids and processes
// 2. otelcol and refinery
function refresh_status() {

    fetch('/api/config')
        .then(response => response.json())
        .then(config_data => {
            // take care of the rendering of the status
            /*
            if (config_data.collector_installed) {
                show_otelcol();
            }
            else {
                hide_otelcol();
            }
            if (config_data.refinery_installed) {
                show_refinery();
            }
            else {
                hide_refinery();
            }
            */

            // and then, fetch pid to render the runtime status
            fetch('/api/pids')
                .then(response => response.json())
                .then(pid_data => {
                    // check if collector and refinery are running
                    var collector_running = false;
                    var refinery_running = false;
                    for (line of pid_data) {
                        var pid = line[1];
                        var command = line[7];
                        var config = line[8];
                        var command_name = command.split("/").pop();
                        // if the command name contains otel or refinery, process accordingly
                        if (command_name.includes("otelcol") && config.includes(config_data.otel_collector.config_path)) {
                            // get the config for otelcol
                            // render the status of otel collector as running
                            document.getElementById("otelcol_status").innerHTML = "🟢 Running | <a href='http://localhost:1777/debug/pprof' target='_blank' rel='noopener'>Debug Page</a>";
                            document.getElementById("otelcol_start").disabled = true;
                            document.getElementById("otelcol_stop").disabled = false;
                            document.getElementById("otelcol_stop").setAttribute("pid", pid);
                            collector_running = true;
                        }
                        else if (command_name.includes("refinery") && config.includes(config_data.refinery.config_path)) {
                            // get the config for refinery
                            // render the status of refinery as running
                            document.getElementById("refinery_status").innerHTML = "🟢 Running | <a href='http://localhost:6060' target='_blank' rel='noopener'>Debug Page</a>";
                            document.getElementById("refinery_start").disabled = true;
                            document.getElementById("refinery_stop").disabled = false;
                            document.getElementById("refinery_stop").setAttribute("pid", pid);
                            refinery_running = true;
                        }
                    }

                    if(collector_running == false) {
                        if(document.getElementById("otelcol_start").disabled == true) {
                            document.getElementById("otelcol_start").disabled = false;
                        }
                        document.getElementById("otelcol_stop").disabled = true;
                        if(document.getElementById("otelcol_status").innerHTML != "🔴 Stopped") {
                            document.getElementById("otelcol_status").innerHTML = "🔴 Stopped";
                        }
                    }

                    if(refinery_running == false) {
                        if(document.getElementById("refinery_start").disabled == true) {
                            document.getElementById("refinery_start").disabled = false;
                        }
                        document.getElementById("refinery_stop").disabled = true;
                        if(document.getElementById("refinery_status").innerHTML != "🔴 Stopped") {
                            document.getElementById("refinery_status").innerHTML = "🔴 Stopped";
                        }
                    }
                });
        });
    setTimeout(refresh_status, STATUS_REFRESH_INTERVAL);
}

function refresh_websocket() {
    fetch('/api/config')
        .then(response => response.json())
        .then(config => {
            if (refinery_out_ws_ping > 0) {
                // meaning that ping was sent, but pong was not received.
                // we may need to reconnect the websocket
            }
            else {
                if(refinery_out_ws && refinery_out_ws.readyState == WebSocket.OPEN) {
                    refinery_out_ws_ping = 1;
                    refinery_out_ws.send("ping");
                }
            }
            if(otelcol_out_ws && otelcol_out_ws.readyState == WebSocket.OPEN) {
                otelcol_out_ws_ping = 1;
                otelcol_out_ws.send("ping");
            }
            if(otelcol_stdout_ws && otelcol_stdout_ws.readyState == WebSocket.OPEN) {
                otelcol_stdout_ws_ping = 1;
                otelcol_stdout_ws.send("ping");
            }
            if(refinery_stdout_ws && refinery_stdout_ws.readyState == WebSocket.OPEN) {
                refinery_stdout_ws_ping = 1;
                refinery_stdout_ws.send("ping");
            }
            if(otelcol_setup_ws && otelcol_setup_ws.readyState == WebSocket.OPEN) {
                otelcol_setup_ws_ping = 1;
                otelcol_setup_ws.send("ping");
            }
            if(refinery_setup_ws && refinery_setup_ws.readyState == WebSocket.OPEN) {
                refinery_setup_ws_ping = 1;
                refinery_setup_ws.send("ping");
            }
        
            // refresh websocket for ai assistants
            if(ai_assistant_ws) {
                for(var key in ai_assistant_ws) {
                    if(ai_assistant_ws[key] && ai_assistant_ws[key].readyState == WebSocket.OPEN) {
                        if (ai_assistant_ws_ping[key] == 1) {
                            ai_assistant_ws_ping[key] = 0;
                            // something is not right, reset the ws
                            var _ws = new WebSocket(`ws://${config.host_name}/ai_assistant?id_prefix=${key}`);
                            init_input_openai_ws(config, key, _ws);
                        } else {
                            ai_assistant_ws_ping[key] = 1;
                            ai_assistant_ws[key].send("ping");
                        }
                    }
                }
            }
        });

    // loop every 60 seconds
    setTimeout(refresh_websocket, WEBSOCKET_REFERSH_INTERVAL);
}

const WEBSOCKET_REFERSH_INTERVAL = 60000;
const STATUS_REFRESH_INTERVAL = 500;

document.onload = init_page();
// refresh the status every 500ms
setTimeout(refresh_status, STATUS_REFRESH_INTERVAL);
// refresh the websocket every 60 seconds
setTimeout(refresh_websocket, WEBSOCKET_REFERSH_INTERVAL);
