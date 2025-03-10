// scripts for dialogs
// dialogs are in three types: 33% width, 66% width, and 100% width
// dialogs appear on the center of the screen, both horizontally and vertically
// dialogs have a close button on the top right
// dialogs have a title
// dialogs have a content area
// dialogs have a footer area
// dialogs have a backdrop

// function to create a dialog
function create_dialog(title, content, footer) {
  var dialog = document.createElement("div");
  dialog.className = "dialog-container";
  // create a close button
  var close_button = document.createElement("div");
  close_button.innerText = "❎";
  close_button.className = "dialog-close-button";
  close_button.onclick = function() {
    close_dialog();
  };

  dialog.appendChild(close_button);
  
  if(title) {
    var header = document.createElement("h1");
    header.innerHTML = title;
    dialog.appendChild(header);
  }
  if(content) {
    var content_div = document.createElement("div");
    content_div.className = "dialog-content";
    if(typeof content === "string") {
        content_div.innerHTML = content;
    } else {
        content_div.appendChild(content);
    }
    dialog.appendChild(content_div);
  }
  if(footer) {
    var footer_div = document.createElement("div");
    footer_div.className = "dialog-footer";
    if(typeof footer === "string") {
        var ok_button = document.createElement("button");
        ok_button.innerText = footer;
        ok_button.addEventListener("click", function() {
            close_dialog();
        });
        footer_div.appendChild(ok_button);
    } else {
        footer_div.appendChild(footer);
    }
    dialog.appendChild(footer_div);
  }
  dialog.id = "dialog";
  return dialog;
}

// function to open a dialog
function open_dialog(dialog) {
  // check if the dialog is already open, if so, close.
  if (document.getElementById("dialog")) {
    close_dialog();
  }
  // put a backdrop
  var backdrop = document.createElement("div");
  backdrop.className = "dialog-backdrop";
  backdrop.id = "dialog-backdrop";
  document.body.appendChild(backdrop);
  document.body.appendChild(dialog);
}

// function to close a dialog
function close_dialog() {
  document.getElementById("dialog-backdrop").remove();
  document.getElementById("dialog").remove();
}

function init_dialog() {
    document.getElementById("otel_input_save").addEventListener("click", function() {
        set_save_dialog();
    });
    document.getElementById("otel_input_open").addEventListener("click", function() {
        set_open_dialog();
    });
}

// initialize dialogs
function set_save_dialog() {
    /**
     * DIALOG FOR SAVING OTEL INPUT
     */
    var save_dialog_content = document.createElement("p");
    var html = "<p>Please provide a name for the OTEL input.<br/>⚠ If the name already exists, the input will be overwritten.</p><form><input type='text' id='otel_input_save_name' placeholder='OTEL Input Name'></form>";
    save_dialog_content.innerHTML = html;
    var save_dialog_footer = document.createElement("button");
    save_dialog_footer.id = "otel_input_save_button";
    save_dialog_footer.innerText = "Save";
    save_dialog_footer.addEventListener("click", function() {
        var name = document.getElementById("otel_input_save_name").value;
        // save the input
        var input = otelcol_json_input.getValue();
        if(name.trim().length > 0 && input.trim().length > 0) {
            // save the input and show the result if successful.
            console.log("Saving input...");
            try {
                fetch("/api/save_saved_json?name=" + name, {
                    method: "POST",
                    body: input
                }).then(response => response.json())
                .then(data => {
                    var save_result_dialog = create_dialog("Save Result", `${data.message}`, "OK");
                    open_dialog(save_result_dialog);
                });
            } catch(error) {
                var save_result_dialog = create_dialog("⚠️ Save Error", `Error: ${error.message}`, "OK");
                open_dialog(save_result_dialog);
            }
        } else {
            // dialog to show that the input is empty.
            var empty_input_dialog = create_dialog("⚠️ Save Error", "Please enter a name and a valid OTEL input.", "OK");
            open_dialog(empty_input_dialog);
        }
    });
    var otel_save_dialog = create_dialog("Save OTEL Input", save_dialog_content, save_dialog_footer);
    open_dialog(otel_save_dialog);
}

function set_open_dialog() {
    /**
     * DIALOG FOR OPENING OTEL INPUT
     */
    var open_dialog_content = document.createElement("p");
    open_dialog_content.className = "open-dialog-content";
    // get the list of the saved files
    fetch("/api/list_saved_json")
        .then(response => response.json())
        .then(data => {
            // create a list of the saved files as buttons
            if(data.length > 0) {
                open_dialog_content.innerHTML = "<p>Please select a saved OTEL data to open.</p>";
            } else {
                open_dialog_content.innerHTML = "<p>No saved OTEL data found.</p>";
            }
            data.forEach(file => {
                var button_container = document.createElement("span");
                button_container.className = "button-container";
                var button = document.createElement("div");
                button.style.marginRight = "10px";
                button.style.width = "100%";
                button.className = "button";
                button.innerText = file;
                button.addEventListener("click", function() {
                    fetch("/api/get_saved_json?name=" + file)
                        .then(response => response.json())
                        .then(data => {
                            var json_string = JSON.stringify(data, null, 2);
                            otelcol_json_input.setValue(json_string);
                            close_dialog();
                        });
                });
                var delete_button = document.createElement("span");
                delete_button.innerText = "✕";
                delete_button.className = "delete-button";
                delete_button.addEventListener("click", function() {
                    // perform the deletion.
                    fetch("/api/delete_saved_json?name=" + file)
                        .then(response => response.json())
                        .then(data => {
                            if(data.message === "JSON data deleted successfully") {
                                open_dialog(create_dialog("Success", "The saved OTEL data has been deleted.", "OK"));
                            } else {
                                open_dialog(create_dialog("Error", "Failed to delete the saved OTEL data.", "OK"));
                            }
                        });
                });
                button_container.appendChild(button);
                button_container.appendChild(delete_button);
                open_dialog_content.appendChild(button_container);
            });
            var otel_open_dialog = create_dialog("Open OTEL Input", open_dialog_content, null);
            open_dialog(otel_open_dialog);
        });
}

