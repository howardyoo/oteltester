
function reset_ai_assistant_ws(id_prefix) {
    fetch("/api/config")
        .then(response => response.json())
        .then(config => {
            var ws_url = (config.host_name.includes("localhost")) ? "ws" : "wss";
            var _ws = new WebSocket(`${ws_url}://${config.host_name}/ai_assistant?id_prefix=${id_prefix}`);
            init_input_openai_ws(config, id_prefix, _ws);
            ai_assistant_ws_ping[id_prefix] = 0;
        });
}

function input_openai_send(id_prefix) {
    const chatInput = document.getElementById(`${id_prefix}_openai_chat_input`);
    const message = chatInput.value;
    if(message.trim() == "") {
        return;
    }
    const chatMessages = document.getElementById(`${id_prefix}_openai_chat_messages`);

    // need to reset the chat input height
    chatInput.style.height = '30px';
    var _div = document.createElement('div');
    _div.classList.add("chat-message");
    _div.classList.add("chat-message-user");
    _div.innerText = message;
    chatMessages.appendChild(_div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    // send it off to the web socket now
    const ws = ai_assistant_ws[id_prefix];
    var prompt = ai_assistant_prompt[id_prefix];
    if (prompt.length == 0) {
        prompt = []
    }
    if (ai_assistant_hooks[id_prefix + "_prompt"]) {
        more_prompts = ai_assistant_hooks[id_prefix + "_prompt"](id_prefix);
        if (more_prompts.length > 0) {
            prompt = prompt.concat(more_prompts);
        }
    }
    // get the messages from the chat messages and convert them into prompt
    const chatHistory = document.getElementById(`${id_prefix}_openai_chat_messages`);
    const messages = chatHistory.querySelectorAll(".chat-message");
    for (const message of messages) {
        prompt.push({
            "role": message.classList.contains("chat-message-user") ? "user" : "assistant",
            "content": message.innerText
        });
    }
    // and add the new message to the prompt
    prompt[prompt.length] = {
        "role": "user",
        "content": message
    };
    if(ws.readyState == WebSocket.OPEN) {
        ws.send(JSON.stringify(prompt));
    } else {
        reset_ai_assistant_ws(id_prefix);
    }
    // clear the chat input
    chatInput.value = '';
}

// clear the chat history of a particular openai chat section
function openai_clear_chat_history(id_prefix) {
    const chatHistory = document.getElementById(`${id_prefix}_openai_chat_messages`);
    chatHistory.innerHTML = '';
}

// function to create the openai chat section
function openai_chat_section(id_prefix, parent) {
    // Create main section container
    const section = document.createElement('div');
    section.id = `${id_prefix}_openai_section`;
    section.className = 'openai_section';

    // Create header
    const header = document.createElement('h3');
    header.textContent = '🧠 AI Assistant ';
    // add a button to clear the chat history
    const clearButton = document.createElement('button');
    clearButton.classList.add('header-button');
    clearButton.textContent = 'Clear chat';
    clearButton.addEventListener('click', () => {
        openai_clear_chat_history(id_prefix);
    }, {passive: true});
    header.appendChild(clearButton);
    
    // Create content container
    const content = document.createElement('div');
    content.id = `${id_prefix}_openai_content`;
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    if(parent) {
        if(parent.clientHeight > 0) {
            // subtract 100px from the height to account for the header and input container
            content.style.maxHeight = parent.clientHeight - 100 + "px";
        } else if(parent.style.maxHeight) {
            // subtract 100px from the height to account for the header and input container
            // get the height from the style.maxHeight
            content.style.maxHeight = (parent.style.maxHeight.replace("px", "") - 100) + "px";
        } else {
            // by default, set the max height to 300px
            content.style.maxHeight = "300px";
        }
    }
    content.style.overflowY = 'auto';
    // don't allow horizontal scrolling - and break long lines
    content.style.overflowX = 'hidden';
    content.style.wordBreak = 'break-word';

    // Create input container
    const inputContainer = document.createElement('div');
    inputContainer.className = 'openai-input-container';
    inputContainer.style.display = 'flex';
    inputContainer.style.gap = '8px';
    inputContainer.style.marginBottom = '5px';

    // Create textarea
    const textarea = document.createElement('textarea');
    textarea.id = `${id_prefix}_openai_chat_input`;
    textarea.placeholder = 'Type your instructions here...';
    textarea.rows = 1;
    Object.assign(textarea.style, {
        flexGrow: '1',
        resize: 'none',
        padding: '8px',
        borderRadius: '10px',
        border: '1px solid #e5e5e5',
        minHeight: '30px',
        maxHeight: '120px'
    });
    textarea.addEventListener('keydown', (event) => {
        // console.log("Key down");
        if (event.key === 'Enter' && !event.shiftKey) {
            // we do not want the enter key to create a new line in the textarea
            event.preventDefault();
            input_openai_send(id_prefix);
        }
    }, {passive: false});
    textarea.addEventListener('input', () => { 
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }, {passive: true});

    // Create send button
    const button = document.createElement('button');
    button.id = `${id_prefix}_openai_chat_send`;
    button.textContent = 'Enter';
    Object.assign(button.style, {
        padding: '8px 16px',
        background: '#1890ff',
        color: 'white',
        border: 'none',
        borderRadius: '10px',
        cursor: 'pointer'
    });
    button.addEventListener('click', () => {
        // console.log("Sending message");
        input_openai_send(id_prefix);
    }, {passive: true});

    // Create messages container
    const messages = document.createElement('div');
    messages.id = `${id_prefix}_openai_chat_messages`;
    messages.style.flexGrow = '1';
    messages.style.overflowY = 'auto';
    messages.style.paddingBottom = '10px';

    // Assemble the structure
    inputContainer.appendChild(textarea);
    inputContainer.appendChild(button);
    content.appendChild(inputContainer);
    content.appendChild(messages);
    section.appendChild(header);
    section.appendChild(content);

    return section;
}

var ai_assistant_enabled = false;
var ai_assistant_type = null;
// map of web sockets for ai assistant
var ai_assistant_ws = {};
var ai_assistant_prompt = {};
var ai_assistant_hooks = {};
var ai_assistant_ws_ping = {};

// function to initialize the openai ws to handle messages
function init_input_openai_ws(config, id_prefix, ws) {
    var ws_url = (config.host_name.includes("localhost")) ? "ws" : "wss";
    if(config && id_prefix && ws) {
        ai_assistant_ws[id_prefix] = ws;
        ws.onmessage = (event) => {
            var message = event.data;
            const chatMessages = document.getElementById(`${id_prefix}_openai_chat_messages`);
            if(message === "{{pong}}") {
                // dummy pong to keep the connection alive 
                ai_assistant_ws_ping[id_prefix] = 0;
            }
            else if(message === "{{end}}") {
                // format the markdown into html
                if (ai_assistant_hooks[id_prefix + "_end"]) {
                    ai_assistant_hooks[id_prefix + "_end"](id_prefix, chatMessages.lastChild);
                }
            }
            else if(message === "{{start}}") {
                const _div = document.createElement('div');
                _div.classList.add("chat-message");
                _div.classList.add("chat-message-assistant");
                const pre = document.createElement('pre');
                _div.appendChild(pre);
                chatMessages.appendChild(_div);
                if (ai_assistant_hooks[id_prefix + "_start"]) {
                    ai_assistant_hooks[id_prefix + "_start"](id_prefix);
                }
                chatMessages.responseText = "";
            }
            else if(message === "{{errorstart}}") {
                const _div = document.createElement('div');
                _div.classList.add("chat-message");
                _div.classList.add("chat-message-error");
                chatMessages.appendChild(_div);
                chatMessages.lastChild.appendChild(document.createTextNode("⚠️ "));
            }
            else if(message === "{{errorend}}") {
                // don't do anything
            }
            else {
                chatMessages.responseText += message;
                chatMessages.lastChild.lastChild.appendChild(document.createTextNode(message));
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
        }

        ws.onclose = () => {
            setTimeout(() => {
                var _ws = new WebSocket(`${ws_url}://${config.host_name}/ai_assistant?id_prefix=${id_prefix}`);
                init_input_openai_ws(config, id_prefix, _ws);
            }, 1000);
        }

        ws.onerror = () => {
            setTimeout(() => {
                var _ws = new WebSocket(`${ws_url}://${config.host_name}/ai_assistant?id_prefix=${id_prefix}`);
                init_input_openai_ws(config, id_prefix, _ws);
            }, 1000);
        }
    }
}

/**
 * function to initialize the openai assistant's behavior.
 * without calling this function, the openai assistant will not be able to run.
 * @param {*} config 
 * @param {*} id_target 
 * @param {*} id_prefix 
 * @param {*} prompt 
 * @param {*} prompt_hook 
 * @param {*} start_hook 
 * @param {*} end_hook 
 */
function init_input_openai(id_target, id_prefix, prompt = [], prompt_hook = null, start_hook = null, end_hook = null) {
    fetch("/api/config")
        .then(response => response.json())
        .then(config => {
            var ws_url = (config.host_name.includes("localhost")) ? "ws" : "wss";
            // check if the ai assistant is enabled
            fetch("/api/ai_assistant")
                .then(response => response.json())
                .then(data => {
                    const target = document.getElementById(id_target);
                    if (target) {
                        if (data.result) {
                            if (target) {
                                target.innerHTML = '';
                                target.appendChild(openai_chat_section(id_prefix, target));
                                ai_assistant_enabled = true;
                                ai_assistant_type = data.type;
                                // also setup the websocket
                                const ws = new WebSocket(`${ws_url}://${config.host_name}/ai_assistant?id_prefix=${id_prefix}`);

                                // setup the system prompt and hooks
                                if (prompt.length > 0) {
                                    ai_assistant_prompt[id_prefix] = prompt;
                                }
                                if (start_hook) {
                                    ai_assistant_hooks[id_prefix + "_start"] = start_hook;
                                }
                                if (end_hook) {
                                    ai_assistant_hooks[id_prefix + "_end"] = end_hook;
                                }
                                if (prompt_hook) {
                                    ai_assistant_hooks[id_prefix + "_prompt"] = prompt_hook;
                                }
                                init_input_openai_ws(config, id_prefix, ws);
                            }
                        } else {
                            target.style.display = "none";
                        }
                    }
                })
                .catch(error => {
                    console.error("Error fetching AI assistant status:", error);
                });
        });
}

const otel_example_trace = `
{
  "resourceSpans": [
    {
      "resource": {
        "attributes": [
          {
            "key": "service.name",
            "value": {
              "stringValue": "my.service"
            }
          }
        ]
      },
      "scopeSpans": [
        {
          "scope": {
            "name": "my.library",
            "version": "1.0.0",
            "attributes": [
              {
                "key": "my.scope.attribute",
                "value": {
                  "stringValue": "some scope attribute"
                }
              }
            ]
          },
          "spans": [
            {
              "traceId": "5B8EFFF798038103D269B633813FC60C",
              "spanId": "EEE19B7EC3C1B174",
              "parentSpanId": "EEE19B7EC3C1B173",
              "name": "I'm a server span",
              "startTimeUnixNano": "1544712660000000000",
              "endTimeUnixNano": "1544712661000000000",
              "kind": 2,
              "attributes": [
                {
                  "key": "my.span.attr",
                  "value": {
                    "stringValue": "some value"
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
`

const otel_example_metric = `
{
  "resourceMetrics": [
    {
      "resource": {
        "attributes": [
          {
            "key": "service.name",
            "value": {
              "stringValue": "my.service"
            }
          }
        ]
      },
      "scopeMetrics": [
        {
          "scope": {
            "name": "my.library",
            "version": "1.0.0",
            "attributes": [
              {
                "key": "my.scope.attribute",
                "value": {
                  "stringValue": "some scope attribute"
                }
              }
            ]
          },
          "metrics": [
            {
              "name": "my.counter",
              "unit": "1",
              "description": "I am a Counter",
              "sum": {
                "aggregationTemporality": 1,
                "isMonotonic": true,
                "dataPoints": [
                  {
                    "asDouble": 5,
                    "startTimeUnixNano": "1544712660300000000",
                    "timeUnixNano": "1544712660300000000",
                    "attributes": [
                      {
                        "key": "my.counter.attr",
                        "value": {
                          "stringValue": "some value"
                        }
                      }
                    ]
                  }
                ]
              }
            },
            {
              "name": "my.gauge",
              "unit": "1",
              "description": "I am a Gauge",
              "gauge": {
                "dataPoints": [
                  {
                    "asDouble": 10,
                    "timeUnixNano": "1544712660300000000",
                    "attributes": [
                      {
                        "key": "my.gauge.attr",
                        "value": {
                          "stringValue": "some value"
                        }
                      }
                    ]
                  }
                ]
              }
            },
            {
              "name": "my.histogram",
              "unit": "1",
              "description": "I am a Histogram",
              "histogram": {
                "aggregationTemporality": 1,
                "dataPoints": [
                  {
                    "startTimeUnixNano": "1544712660300000000",
                    "timeUnixNano": "1544712660300000000",
                    "count": 2,
                    "sum": 2,
                    "bucketCounts": [1,1],
                    "explicitBounds": [1],
                    "min": 0,
                    "max": 2,
                    "attributes": [
                      {
                        "key": "my.histogram.attr",
                        "value": {
                          "stringValue": "some value"
                        }
                      }
                    ]
                  }
                ]
              }
            },
            {
              "name": "my.exponential.histogram",
              "unit": "1",
              "description": "I am an Exponential Histogram",
              "exponentialHistogram": {
                "aggregationTemporality": 1,
                "dataPoints": [
                  {
                    "startTimeUnixNano": "1544712660300000000",
                    "timeUnixNano": "1544712660300000000",
                    "count": 3,
                    "sum": 10,
                    "scale": 0,
                    "zeroCount": 1,
                    "positive": {
                      "offset": 1,
                      "bucketCounts": [0,2]
                    },
                    "min": 0,
                    "max": 5,
                    "zeroThreshold": 0,
                    "attributes": [
                      {
                        "key": "my.exponential.histogram.attr",
                        "value": {
                          "stringValue": "some value"
                        }
                      }
                    ]
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  ]
}
`;

const otel_example_log = `
{
  "resourceLogs": [
    {
      "resource": {
        "attributes": [
          {
            "key": "service.name",
            "value": {
              "stringValue": "my.service"
            }
          }
        ]
      },
      "scopeLogs": [
        {
          "scope": {
            "name": "my.library",
            "version": "1.0.0",
            "attributes": [
              {
                "key": "my.scope.attribute",
                "value": {
                  "stringValue": "some scope attribute"
                }
              }
            ]
          },
          "logRecords": [
            {
              "timeUnixNano": "1544712660300000000",
              "observedTimeUnixNano": "1544712660300000000",
              "severityNumber": 10,
              "severityText": "Information",
              "traceId": "5B8EFFF798038103D269B633813FC60C",
              "spanId": "EEE19B7EC3C1B174",
              "body": {
                "stringValue": "Example log record"
              },
              "attributes": [
                {
                  "key": "string.attribute",
                  "value": {
                    "stringValue": "some string"
                  }
                },
                {
                  "key": "meta.annotation_type",
                  "value": {
                    "stringValue": "span_event"
                  }
                },
                {
                  "key": "boolean.attribute",
                  "value": {
                    "boolValue": true
                  }
                },
                {
                  "key": "int.attribute",
                  "value": {
                    "intValue": "10"
                  }
                },
                {
                  "key": "double.attribute",
                  "value": {
                    "doubleValue": 637.704
                  }
                },
                {
                  "key": "array.attribute",
                  "value": {
                    "arrayValue": {
                      "values": [
                        {
                          "stringValue": "many"
                        },
                        {
                          "stringValue": "values"
                        }
                      ]
                    }
                  }
                },
                {
                  "key": "map.attribute",
                  "value": {
                    "kvlistValue": {
                      "values": [
                        {
                          "key": "some.map.key",
                          "value": {
                            "stringValue": "some value"
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
`;