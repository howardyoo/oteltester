
function reset_ai_assistant_ws(id_prefix) {
    fetch("/api/config")
        .then(response => response.json())
        .then(config => {
            var _ws = new WebSocket(`ws://${config.host_name}/ai_assistant?id_prefix=${id_prefix}`);
            ai_assistant_ws[id_prefix] = _ws;
            ai_assistant_ws_ping[id_prefix] = 0;
        });
}

function input_openai_send(id_prefix) {
    const chatInput = document.getElementById(`${id_prefix}_openai_chat_input`);
    const message = chatInput.value;
    const chatMessages = document.getElementById(`${id_prefix}_openai_chat_messages`);
    chatInput.value = '';
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
    prompt[prompt.length] = {
        "role": "user",
        "content": message
    };
    if(ws.readyState == WebSocket.OPEN) {
        ws.send(JSON.stringify(prompt));
    } else {
        console.log("resetting ai assistant ws for " + id_prefix + " because it is not in the open state.");
        reset_ai_assistant_ws(id_prefix);
    }
}

// function to create the openai chat section
function openai_chat_section(id_prefix) {
    // Create main section container
    const section = document.createElement('div');
    section.id = `${id_prefix}_openai_section`;
    section.className = 'openai_section';

    // Create header
    const header = document.createElement('h3');
    header.textContent = '🧠 AI Assistant';
    
    // Create content container
    const content = document.createElement('div');
    content.id = `${id_prefix}_openai_content`;
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.maxHeight = '300px';
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
            event.preventDefault();
            input_openai_send(id_prefix);
        }
    });
    textarea.addEventListener('input', () => { 
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    });

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
    });

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

function init_input_openai(config, id_target, id_prefix, prompt = [], prompt_hook = null, start_hook = null, end_hook = null) {
    // check if the ai assistant is enabled
    fetch("/api/ai_assistant")
        .then(response => response.json())
        .then(data => {
            const target = document.getElementById(id_target);
            if (target) {
                if (data.result) {
                    if (target) {
                        target.innerHTML = '';
                        target.appendChild(openai_chat_section(id_prefix));
                        ai_assistant_enabled = true;
                        ai_assistant_type = data.type;
                        // also setup the websocket
                        const ws = new WebSocket(`ws://${config.host_name}/ai_assistant?id_prefix=${id_prefix}`);

                        ai_assistant_ws[id_prefix] = ws;

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
                                } else {
                                    chatMessages.lastChild.innerHTML = chatMessages.lastChild.innerText;
                                }
                            }
                            else if(message === "{{start}}") {
                                const _div = document.createElement('div');
                                _div.classList.add("chat-message");
                                _div.classList.add("chat-message-assistant-content");
                                chatMessages.appendChild(_div);
                                if (ai_assistant_hooks[id_prefix + "_start"]) {
                                    ai_assistant_hooks[id_prefix + "_start"](id_prefix);
                                }
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
                                // add the message to the chat
                                // replace \n with <br/>
                                // message = message.replace(/\n/g, "<br/>");
                                chatMessages.lastChild.appendChild(document.createTextNode(message));
                                chatMessages.scrollTop = chatMessages.scrollHeight;
                            }
                        }

                        ws.onclose = () => {
                            setTimeout(() => {
                                var _ws = new WebSocket(`ws://${config.host_name}/ai_assistant?id_prefix=${id_prefix}`);
                                ai_assistant_ws[id_prefix] = _ws;
                            }, 1000);
                        }

                        ws.onerror = () => {
                            setTimeout(() => {
                                var _ws = new WebSocket(`ws://${config.host_name}/ai_assistant?id_prefix=${id_prefix}`);
                                ai_assistant_ws[id_prefix] = _ws;
                            }, 1000);
                        }
                    }
                } else {
                    target.style.display = "none";
                }
            }
        })
        .catch(error => {
            console.error("Error fetching AI assistant status:", error);
        });
}
