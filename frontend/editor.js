// editor variables to set and get value
var otelcol_editor = null;
var refinery_editor = null;
var refinery_rule_editor = null;
var otelcol_json_output = null;
var otelcol_json_input = null;
var otelcol_output = null;
var refinery_output = null;
var refinery_sample_result = null;

var is_editor_focused = false;

function init_textareas() {
    // initialize the editor on the textareas 
    // that's on this page
    otelcol_editor = CodeMirror.fromTextArea(document.getElementById("otelcol_config"), {
        mode: "yaml",  // Change to "application/json" for JSON
        lineNumbers: true,
        theme: "default",
        lineWrapping: true
    });
    otelcol_editor.on("focus", () => {
        is_editor_focused = true;
    });
    otelcol_editor.on("blur", () => {
        is_editor_focused = false;
    });
    otelcol_editor.on("change", () => {
        const updated_content = otelcol_editor.getValue();
        if (otelcol_config_current !== updated_content) {
            document.getElementById("otelcol_save").disabled = false;
        } else {
            document.getElementById("otelcol_save").disabled = true;
        }
    });
    const otelcol_editor_wrapper = otelcol_editor.getWrapperElement();
    otelcol_editor_wrapper.addEventListener("click", (event) => {
        // console.log("clicked inside the otelcol_editor");
    }, {passive: true});

    refinery_editor = CodeMirror.fromTextArea(document.getElementById("refinery_config"), {
        mode: "yaml",  // Change to "application/json" for JSON
        lineNumbers: true,
        theme: "default",
        lineWrapping: true
    });
    refinery_editor.on("focus", () => {
        is_editor_focused = true;
    });
    refinery_editor.on("blur", () => {
        is_editor_focused = false;
    });
    refinery_editor.on("change", () => {
        const updated_content = refinery_editor.getValue();
        if (refinery_config_current !== updated_content) {
            document.getElementById("refinery_save").disabled = false;
        } else {
            document.getElementById("refinery_save").disabled = true;
        }
    });
    const refinery_editor_wrapper = refinery_editor.getWrapperElement();
    refinery_editor_wrapper.addEventListener("click", (event) => {
        //console.log('clicked inside the refinery_editor');
    }, {passive: true});

    refinery_rule_editor = CodeMirror.fromTextArea(document.getElementById("refinery_rule"), {
        mode: "yaml",  // Change to "application/json" for JSON
        lineNumbers: true,
        theme: "default",
        lineWrapping: true
    });
    refinery_rule_editor.on("focus", () => {
        is_editor_focused = true;
    });
    refinery_rule_editor.on("blur", () => {
        is_editor_focused = false;
    });
    refinery_rule_editor.on("change", () => {
        const updated_content = refinery_rule_editor.getValue();
        if (refinery_rule_current !== updated_content) {
            document.getElementById("refinery_save").disabled = false;
        } else {
            document.getElementById("refinery_save").disabled = true;
        }
    });
    const refinery_rule_editor_wrapper = refinery_rule_editor.getWrapperElement();
    refinery_rule_editor_wrapper.addEventListener("click", (event) => {
        //console.log('clicked inside the refinery_rule_editor');
    }, {passive: true});

    otelcol_json_input = CodeMirror.fromTextArea(document.getElementById("otel_input"), {
        mode: "application/json",
        lineNumbers: true,
        theme: "default",
        lineWrapping: true
    });
    otelcol_json_input.on("focus", () => {
        is_editor_focused = true;
    });
    otelcol_json_input.on("blur", () => {
        is_editor_focused = false;
    });
    otelcol_json_output = CodeMirror.fromTextArea(document.getElementById("otelcol_result"), {
        mode: "application/json",
        lineNumbers: true,
        theme: "default",
        lineWrapping: true
    });
    otelcol_json_output.on("focus", () => {
        is_editor_focused = true;
    });
    otelcol_json_output.on("blur", () => {
        is_editor_focused = false;
    });
    const otelcol_json_output_wrapper = otelcol_json_output.getWrapperElement();
    otelcol_json_output_wrapper.addEventListener("click", (event) => {
        //console.log('clicked inside the otelcol_json_output');
    }, {passive: true});

    otelcol_output = CodeMirror.fromTextArea(document.getElementById("otelcol_output"), {
        mode: "text",
        lineNumbers: true,
        theme: "default",
        lineWrapping: true
    });
    otelcol_output.on("focus", () => {
        is_editor_focused = true;
    });
    otelcol_output.on("blur", () => {
        is_editor_focused = false;
    });
    const otelcol_output_wrapper = otelcol_output.getWrapperElement();
    otelcol_output_wrapper.addEventListener("click", (event) => {
        // console.log('clicked inside the otelcol_output');
    }, {passive: true});

    refinery_output = CodeMirror.fromTextArea(document.getElementById("refinery_output"), {
        mode: "text",
        lineNumbers: true,
        theme: "default",
        lineWrapping: true
    });
    refinery_output.on("focus", () => {
        is_editor_focused = true;
    });
    refinery_output.on("blur", () => {
        is_editor_focused = false;
    });
    const refinery_output_wrapper = refinery_output.getWrapperElement();
    refinery_output_wrapper.addEventListener("click", (event) => {
        //console.log('clicked inside the refinery_output');
    }, {passive: true});

    refinery_sample_result = CodeMirror.fromTextArea(document.getElementById("refinery_sample_result"), {
        mode: "application/json",
        lineNumbers: true,
        theme: "default",
        lineWrapping: true
    });
    refinery_sample_result.on("focus", () => {
        is_editor_focused = true;
    });
    refinery_sample_result.on("blur", () => {
        is_editor_focused = false;
    });
    const refinery_sample_result_wrapper = refinery_sample_result.getWrapperElement();
    refinery_sample_result_wrapper.addEventListener("click", (event) => {
        // console.log('clicked inside the refinery_sample_result');
    }, {passive: true});

    // detect clicks outside the editor
    document.addEventListener("click", (event) => {
        if (is_editor_focused == false) {
            //console.log('clicked outside the editor');
        }
    }, {passive: true});
}

// function to initialize the editor and their web sockets