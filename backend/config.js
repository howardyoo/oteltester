import { read_yaml, save_yaml, yaml_to_json, json_to_yaml } from "./utils.js";
import fs from "fs";
import os from "os"
import { execSync } from "child_process";

const CONFIG_PATH = "config.yaml";
var WORK_DIR = process.cwd();
const architecture = os.arch();     // possible values: 'arm', 'arm64', 'x64', 'ia32'
const is64bit = architecture === "arm64" || architecture === "x64";
const platform = os.platform();    // possible values: 'darwin', 'linux', 'win32'

// check if running in codespace or gitpod
const CODESPACE_NAME = process.env.CODESPACE_NAME;
const GITPOD_INSTANCE_ID = process.env.GITPOD_INSTANCE_ID;

var host_name = null;
// check env and see if it is running in codespace or gitpod
if(CODESPACE_NAME) {
    host_name = `${CODESPACE_NAME}-3000.app.github.dev`;
} else if(GITPOD_INSTANCE_ID) {
    try {
        host_name = execSync("gp url 3000").toString().trim();
        // remove the https:// or http://
        json["host_name"] = url.replace(/^https?:\/\//, '');
    } catch(error) {
        console.error( `Error: ${error.message}`);
    }
} else {
    host_name = "localhost:3000";
}

// returns the configuration file from yaml.
export function get_config() {
    var yaml = read_yaml(WORK_DIR + "/" + CONFIG_PATH);

    // convert the yaml to json
    var json = yaml_to_json(yaml);

    // set the host name
    if(host_name) {
        json["host_name"] = host_name;
    }

    // add working directory and template directory, if not set
    if(!json["work_dir"]) {
        json["work_dir"] = WORK_DIR;
    }
    if(!json["template_dir"]) {
        json["template_dir"] = WORK_DIR + "/templates";
    }
    // check the version of the collector and refinery
    if(json["collector_version"] === "0.0.0") {
        json["collector_installed"] = false;
    } else {
        json["collector_installed"] = true;
    }
    if(json["refinery_version"] === "0.0.0") {
        json["refinery_installed"] = false;
    } else {
        json["refinery_installed"] = true;
    }
    
    // check whether the binary exists
    if(json["otel_collector"]["bin_path"] && fs.existsSync(json["otel_collector"]["bin_path"])) {
        json["collector_installed"] = true;
    } else {
        json["collector_installed"] = false;
    }
    if(json["refinery"]["bin_path"] && fs.existsSync(json["refinery"]["bin_path"])) {
        json["refinery_installed"] = true;
    } else {
        json["refinery_installed"] = false;
    }
    // check the config files for otelcol
    if(json["otel_collector"]["config_path"] && fs.existsSync(json["otel_collector"]["config_path"])) {
        json["collector_config_exists"] = true;
    } else {
        json["collector_config_exists"] = false;
    }
    // check the config files for refinery
    if(json["refinery"]["config_path"] && fs.existsSync(json["refinery"]["config_path"])) {
        json["refinery_config_exists"] = true;
    } else {
        json["refinery_config_exists"] = false;
    }
    // check the rule files for refinery
    if(json["refinery"]["rule_path"] && fs.existsSync(json["refinery"]["rule_path"])) {
        json["refinery_rule_exists"] = true;
    } else {
        json["refinery_rule_exists"] = false;
    }

    // add the os architecture and is64bit to the json
    json["os.arch"] = architecture;
    json["os.is64bit"] = is64bit;
    json["os.platform"] = platform;
    
    return json;
}

// saves the given config to the yaml file.
export function save_config(config) {
    var yaml = json_to_yaml(config);
    save_yaml(config["work_dir"] + "/" + CONFIG_PATH, yaml);
}

export function get_workdir() {
    return WORK_DIR;
}