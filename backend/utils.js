import { execSync } from "child_process";
import fs from "fs";
import yaml from "js-yaml";

// get the pids of the running otelcol or refinery processes in local environment
export function get_pids() {
    try {
        const result = execSync("ps -e | grep -E 'otelcol|refinery' | grep -v grep");
        var out = [];
        var lines = result.toString().split("\n").filter(Boolean);
        for(const line of lines) {
            var proc = line.split(/\s+/).filter(Boolean);
            if(proc[3].includes("otelcol") || proc[3].includes("refinery")) {
                out[out.length] = proc;
            }
        }
        return out;
    } catch (error) {
        // console.log(error.message);
        return [];
    }
}

// convert yaml to json
export function yaml_to_json(yaml_str) {
    return yaml.load(yaml_str);
}

// convert json to yaml
export function json_to_yaml(json_data) {
    if(typeof json_data == "string") {
        json_data = JSON.parse(json_data);
    }
    return yaml.dump(json_data);
}

// returns refinery or otelcol depending on the type of the command
export function get_type(pid) {
    const pids = get_pids();
    for(const p of pids) {
        if(p[0] == pid) {
            var command = p[3];
            if(command.includes("refinery")) {
                return "refinery";
            } else if(command.includes("otelcol")) {
                return "otelcol";
            }
        }
    }
    return null;
}

// check if the pid is running and is valid
export function check_pid(pid) {
    const pids = get_pids();
    for(const p of pids) {
        if(p[0] == pid) {
            return true;
        }
    }
    return false;
}

// function to save yaml file to the given path
export function save_yaml(path, yaml) {
    fs.writeFileSync(path, yaml);
}

// function to read yaml file from the given path
// basically returns as text format
export function read_yaml(path) {
    return fs.readFileSync(path, "utf8");
}

// function to save json file to the given path
export function save_json(path, json) {
    fs.writeFileSync(path, JSON.stringify(json));
}

// function to read json file from the given path.
// returns json object.
// in case of error, returns null
export function read_json(path) {
    try {
        const fileContent = fs.readFileSync(path, "utf8");
        return JSON.parse(fileContent);
    } catch (error) {
        console.error(`Error reading/parsing JSON file at ${path}:`, error);
        return null;
    }
}