function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const offset = -40;

function scrollElementWithOffset(id, offset) {
  const element = document.getElementById(id);
  if (element) {
    const elementPosition = element.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: elementPosition + offset, behavior: 'smooth' });
  }
}

function scrollToTemplates() {
  scrollElementWithOffset('template_top', offset);
}

function scrollToCollector() {
  scrollElementWithOffset('otelcol_top', offset);
}

function scrollToRefinery() {
  scrollElementWithOffset('refinery_top', offset);
}

function update_otelcol_status(config) {
  if(config) {
    var otelcol_html = "<li>";
    if (config.collector_installed) {
      otelcol_html += "✅";
    } else {
      otelcol_html += "❌";
    }
    otelcol_html += " bin: " + config.otel_collector.bin_path + "</li>";
    otelcol_html += "<li>";
    if (config.collector_config_exists) {
      otelcol_html += "✅";
    } else {
      otelcol_html += "❌";
    }
    otelcol_html += " config: " + config.otel_collector.config_path + "</li>";
    document.getElementById('otelcol_files_status').innerHTML = otelcol_html;

    if (config.collector_config_exists) {
      fetch('/api/get_yaml?path=' + config.otel_collector.config_path)
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
}

function update_refinery_status(config) {
  if(config) {
    var refinery_html = "<li>";
    if (config.refinery_installed) {
      refinery_html += "✅";
    } else {
      refinery_html += "❌";
    }
    refinery_html += " bin: " + config.refinery.bin_path + "</li>";
    refinery_html += "<li>";
    if (config.refinery_config_exists) {
      refinery_html += "✅";
    } else {
      refinery_html += "❌";
    }
    refinery_html += " config: " + config.refinery.config_path + "</li>";  
    refinery_html += "<li>";
    if (config.refinery_rule_exists) {
      refinery_html += "✅";
    } else {
      refinery_html += "❌";
    }
    refinery_html += " rule: " + config.refinery.rule_path + "</li>";
    document.getElementById('refinery_files_status').innerHTML = refinery_html;

    if (config.refinery_config_exists) {
      fetch('/api/get_yaml?path=' + config.refinery.config_path)
        .then(response => response.text())
        .then(yaml => {
          refinery_editor.setValue(yaml);
          refinery_config_current = yaml;
          document.getElementById("refinery_save").disabled = true;
        })
        .catch(error => console.error('Error fetching refinery config:', error));
    }

    if (config.refinery_rule_exists) {
      fetch('/api/get_yaml?path=' + config.refinery.rule_path)
        .then(response => response.text())
        .then(_yaml => {
          // document.getElementById('refinery_rule').textContent = _yaml;
          refinery_rule_editor.setValue(_yaml);
          refinery_rule_current = _yaml;
          document.getElementById("refinery_save").disabled = true;
        })
        .catch(error => console.error('Error fetching refinery rule:', error)); 
    }
  }
}

function refresh_otelcol_status(config) {
  console.log("refreshing otelcol status");
  if(!config) {
    fetch('/api/config')
      .then(response => response.json())
      .then(data => {
        update_otelcol_status(data);
      });
  } else {
    update_otelcol_status(config);
  }
}

function refresh_refinery_status(config) {
  console.log("refreshing refinery status");
  if(!config) {
    fetch('/api/config')
      .then(response => response.json())
      .then(data => {
        update_refinery_status(data);
      });
  } else {
    update_refinery_status(config);
  }
}

function refresh_main() {
  // fetch the config
  fetch('/api/config')
    .then(response => response.json())
    .then(data => {
      var otel_collector = data.otel_collector;
      var otelcol_html = "<h2>🕸️ Otel Collector</h2><ul id='otelcol_files_status'>";
      otelcol_html += "<li>";
      if (data.collector_installed) {
        otelcol_html += "✅";
      } else {
        otelcol_html += "❌";
      }
      otelcol_html += " bin: " + otel_collector.bin_path + "</li>";
      otelcol_html += "<li>";
      if (data.collector_config_exists) {
        otelcol_html += "✅";
      } else {
        otelcol_html += "❌";
      }
      otelcol_html += " config: " + otel_collector.config_path + "</li>";
      otelcol_html += "</ul>";
      otelcol_html += "<div class='status'id='otelcol_status'>🔴 Stopped</div><div class='template-buttons'>";
      if (data.collector_installed) {
        otelcol_html += "<input type='button' id='otelcol_start' value='⏵ Start' disabled='false'>";
        otelcol_html += "<input type='button' id='otelcol_stop' value='⏹ Stop' disabled='true'>";
      } else {
        otelcol_html += "<input type='button' id='otelcol_start' value='⏵ Start' disabled='true'>";
        otelcol_html += "<input type='button' id='otelcol_stop' value='⏹ Stop' disabled='true'>";
      }
      otelcol_html += "<input type='button' id='otelcol_save' value='💾 Save Config' disabled='true'>";
      otelcol_html += "<input type='button' id='otelcol_reload' value='⏎ Reload Config'>";
      otelcol_html += "<input type='button' id='otelcol_clear' value='🧹 Clear Outputs'>";
      otelcol_html += "<input type='button' id='otelcol_otelbin' value='📡 Export to otelbin.io'>";
      otelcol_html += "<input type='button' id='otelcol_import' value='Import from URL'></div>";
      otelcol_html += "<div class='template-section-100'>";
      otelcol_html += "<div><h4>⚙️ " + otel_collector.config_path + "</h4>";
      otelcol_html += "<textarea id='otelcol_config' rows='20' cols='80'></textarea></div></div>";
      otelcol_html += "<div class='template-section-50'>";
      otelcol_html += "<div><h4>🖥️ Console Output</h4><textarea id='otelcol_output' rows='20' cols='80'></textarea></div>";
      otelcol_html += "<div><h4>📢 Otelcol Result</h4>";
      otelcol_html += "<textarea id='otelcol_result' rows='20' cols='80'></textarea>";
      otelcol_html += "<form><div class='template-buttons'> 📡 <select id='otelcol_send_endpoint'>";
      otelcol_html += "<option value='http://localhost:8080' selected='true'>Local refinery</option>";
      otelcol_html += "<option value='https://api.honeycomb.io'>https://api.honeycomb.io</option>";
      otelcol_html += "<option value='https://api.eu1.honeycomb.io'>https://api.eu1.honeycomb.io</option>";
      otelcol_html += "</select>";
      otelcol_html += "<input type='password' id='otelcol_send_apikey' placeholder='API Key' autocomplete='off' value='1234567890'>";
      otelcol_html += "<input type='button' id='otelcol_send' value='Send'>";
      otelcol_html += " Auto <select id='otelcol_send_auto'>";
      otelcol_html += "<option value='true'>on</option>";
      otelcol_html += "<option value='false' selected='true'>off</option>";
      otelcol_html += "</select>";
      otelcol_html += " Results <select id='otelcol_results'></select>";  // result cache.
      otelcol_html += "</div></form><span id='otelcol_send_status'></span></div></div>";
      
      document.getElementById('otelcol').innerHTML = otelcol_html;

      var refinery = data.refinery;
      var refinery_html = "<h2>⚗️ Refinery</h2><ul id='refinery_files_status'>";
      refinery_html += "<li>";
      if (data.refinery_installed) {
        refinery_html += "✅";
      } else {
        refinery_html += "❌";
      }
      refinery_html += " bin: " + refinery.bin_path + "</li>";
      refinery_html += "<li>";
      if (data.refinery_config_exists) {
        refinery_html += "✅";
      } else {
        refinery_html += "❌";
      }
      refinery_html += " config: " + refinery.config_path + "</li>";
      refinery_html += "<li>";
      if (data.refinery_rule_exists) {
        refinery_html += "✅";
      } else {
        refinery_html += "❌";
      }
      refinery_html += " rule: " + refinery.rule_path + "</li>";
      refinery_html += "</ul>";
      refinery_html += "<div class='status' id='refinery_status'>🔴 Stopped</div><div class='template-buttons'>";
      if (data.refinery_installed) {
        refinery_html += "<input type='button' id='refinery_start' value='⏵ Start' disabled='false'>";
        refinery_html += "<input type='button' id='refinery_stop' value='⏹ Stop' disabled='true'>";
      } else {
        refinery_html += "<input type='button' id='refinery_start' value='⏵ Start' disabled='true'>";
        refinery_html += "<input type='button' id='refinery_stop' value='⏹ Stop' disabled='true'>";
      }
      refinery_html += "<input type='button' id='refinery_save' value='💾 Save Config' disabled='true'>";
      refinery_html += "<input type='button' id='refinery_clear' value='🧹 Clear Outputs'></div>";
      refinery_html += "<div class='template-section-50'>";

      refinery_html += "<div><h4>📏 " + refinery.rule_path + "</h4>";
      refinery_html += "<textarea id='refinery_rule' rows='20' cols='80'></textarea></div>";

      refinery_html += "<div><h4>🖥️ Console Output</h4><textarea id='refinery_output' rows='20' cols='80'></textarea></div></div>";
      refinery_html += "<div class='template-section-50'>";
      refinery_html += "<div><h4>⚙️ " + refinery.config_path + "</h4>";
      refinery_html += "<textarea id='refinery_config' rows='20' cols='80'></textarea></div>"
      refinery_html += "<div><h4>📢 Refinery Result</h4>";
      refinery_html += "<textarea id='refinery_sample_result' rows='20' cols='80'></textarea>"
      refinery_html += "<form style='display: none'><div class='template-buttons'> 📡 <select id='refinery_send_endpoint'>";
      refinery_html += "<option value='https://api.honeycomb.io'>https://api.honeycomb.io</option>";
      refinery_html += "<option value='https://api.eu1.honeycomb.io'>https://api.eu1.honeycomb.io</option>";
      refinery_html += "</select>";
      refinery_html += "<input type='password' id='refinrey_send_apikey' placeholder='API Key' autocomplete='off'>";
      refinery_html += "<input type='button' id='refinery_send' value='Send'>";
      refinery_html += " Auto <select id='refinery_send_auto'>";
      refinery_html += "<option value='true'>on</option>";
      refinery_html += "<option value='false' selected='true'>off</option>";
      refinery_html += "</select>";
      refinery_html += "</div></form></div>";;
      refinery_html += "</div>";

      document.getElementById('refinery').innerHTML = refinery_html;
    })
    .catch(error => console.error('Error fetching config:', error));
}