import fs from "fs";
import tar from "tar-fs";
import zlib from "zlib";
import https from "follow-redirects";

import { get_config, save_config } from "./config.js";
import { get_pids } from "./utils.js";
import { execSync } from "child_process";

export function stop_otelcol() {
    var config_data = get_config();
    var pids = get_pids();
    for(var line of pids) {
        var pid = line[1];
        var command = line[7];
        var config = line[8];
        var command_name = command.split("/").pop();
        // if the command name contains otel or refinery, process accordingly
        if (command_name.includes("otelcol") && config.includes(config_data.otel_collector.config_path)) {
            // stop the otel collector
            try {
                var response = execSync("kill -TERM " + pid, {encoding: "utf-8"});
                console.log("response: ", response);
                return response;
            } catch( error ) {
                console.error('Error:', error.message);
                console.error('Stdout:', error.stdout);
                console.error('Stderr:', error.stderr);
            }
        }
    }
}

export function stop_refinery() {
    var config_data = get_config();
    var pids = get_pids();
    for(var line of pids) {
        var pid = line[1];
        var command = line[7];
        var config = line[8];
        var command_name = command.split("/").pop();
        // if the command name contains otel or refinery, process accordingly
        if (command_name.includes("refinery") && config.includes(config_data.refinery.config_path)) {
            // stop the refinery
            try {
                var response = execSync("kill -HUP " + pid, {encoding: "utf-8"});
                console.log("response: ", response);
                return response;
            } catch( error ) {
                console.error('Error:', error.message);
                console.error('Stdout:', error.stdout);
                console.error('Stderr:', error.stderr);
            }
        }
    }
}

// function to get the otelcol versions available
export function get_otelcol_versions() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/open-telemetry/opentelemetry-collector/releases',
            headers: {
                'User-Agent': 'oteltester'
            }
        };

        https.https.get(options, (response) => {
            let data = '';

            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                try {
                    const releases = JSON.parse(data);
                    const versions = releases.map(release => {
                        // Remove 'v' prefix if present and get the version number
                        const version = release.tag_name.replace(/^v/, '');
                        return {
                            version: version,
                            name: release.name,
                            published_at: release.published_at,
                            is_prerelease: release.prerelease
                        };
                    });
                    resolve(versions);
                } catch (error) {
                    reject(new Error('Failed to parse GitHub API response: ' + error.message));
                }
            });
        }).on('error', (error) => {
            reject(new Error('Failed to fetch versions: ' + error.message));
        });
    });
}

// function to get the refinery versions available
export function get_refinery_versions() {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.github.com',
            path: '/repos/honeycombio/refinery/releases',
            headers: {
                'User-Agent': 'oteltester'
            }
        };

        https.https.get(options, (response) => {
            let data = '';

            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                try {
                    const releases = JSON.parse(data);
                    const versions = releases.map(release => {
                        // Remove 'v' prefix if present and get the version number
                        const version = release.tag_name.replace(/^v/, '');
                        return {
                            version: version,
                            name: release.name,
                            published_at: release.published_at,
                            is_prerelease: release.prerelease,
                            // Add asset information specific to refinery
                            assets: release.assets.filter(asset => 
                                asset.name.startsWith('refinery-') && 
                                !asset.name.endsWith('.rpm') && 
                                !asset.name.endsWith('.checksum')
                            ).map(asset => ({
                                name: asset.name,
                                download_url: asset.browser_download_url,
                                size: asset.size
                            }))
                        };
                    });
                    resolve(versions);
                } catch (error) {
                    reject(new Error('Failed to parse GitHub API response: ' + error.message));
                }
            });
        }).on('error', (error) => {
            reject(new Error('Failed to fetch versions: ' + error.message));
        });
    });
}

// function to download and install otel collector (contrib) based on the provided version
export function install_otelcol(ws, version) {
    console.log("Installing... otel collector");
    var config = get_config();
    var cancel = false;
    // if cancel is received, cancel the installation
    ws.on("message", (message) => {
        if(message == "{{cancel}}") {
            console.log("otelcol_setup_ws: installation cancelled");
            // cancel the installation
            ws.send(JSON.stringify({html: "🔴 Cancelled", status: "cancelled"}));
            cancel = true;
            ws.send("{{cancelled}}");
            return;
        }
    });

    // first check if the otel collector is installed and running.
    if(config.collector_installed) {
        stop_otelcol();
    }

    // url to download the otel collector:
    // e.g. https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.118.0/otelcol-contrib_0.118.0_darwin_amd64.tar.gz
    // filename to be downloaded, according to the os platform and architecture
    var file_name = "otelcol-contrib_" + version + "_" + config["os.platform"] + "_" + config["os.arch"] + ".tar.gz";

    var url = "https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v" + version + "/" + file_name;
    console.log("installation url: ", url);
    var targz = config["collector_home"] + "/otelcol-contrib.tar.gz";
    var file = fs.createWriteStream(targz);
    https.https.get(url, function(response) {

        // get response length
        var contentLength = response.headers['content-length'];
        var downloadedLength = 0;
        console.log("content length: ", contentLength);
        console.log("status code: ", response.statusCode);
        if (response.statusCode !== 200) {
            ws.send(JSON.stringify({html: "<p>Failed to download file: " + response.statusCode + "</p>"}));
            return new Error(`Failed to download file: ${response.statusCode}`);
        }

        console.log("downloading the file");
        // print out the bytes received during the download
        response.on("data", function(chunk) {
            // console.log("received: ", downloadedLength, " / ", contentLength, " bytes");
            if(cancel) {
                // stop the download and exit
                response.destroy();
                return;
            } else {
                downloadedLength += chunk.length;
                ws.send(JSON.stringify({html:  "⏬ " + downloadedLength + " / " + contentLength + " bytes", status: "downloading"}));
            }
        });
        response.pipe(file);
        file.on("finish", function() {
            console.log("Download complete");
            // extract the file (tar.gz)
            fs.createReadStream(targz)
            .pipe(zlib.createGunzip())
            .pipe(tar.extract(config["collector_home"]))
            .on('finish', () => {
                console.log('Extraction complete!');

                if(!config["collector_config_exists"]) {
                    console.log("creating a new config file for the otel collector");
                    var config_template = fs.readFileSync(config["work_dir"] + "/examples/otelcol-config.yml", "utf8");
                    // in the future, we could even provide some default settings
                    // write to the config path
                    fs.writeFileSync(config["otel_collector"]["config_path"], config_template);
                    config["collector_config_exists"] = true;
                }

                // save the config
                config["collector_version"] = version;
                config["otel_collector"]["bin_path"] = config["collector_home"] + "/otelcol-contrib";
                config["collector_installed"] = true;
                save_config(config);
                console.log("saved the config");
                // remove the tar.gz file
                fs.unlinkSync(targz);
                ws.send(JSON.stringify({html: "🟢 Installed", status: "success"}));
            });
        });
    });
}

export function install_refinery(ws,version) {
    console.log("Installing... refinery");
    var config = get_config();
    var cancel = false;
    // if cancel is received, cancel the installation
    ws.on("message", (message) => {
        if(message == "{{cancel}}") {
            // console.log("refinery_setup_ws: installation cancelled");
            // cancel the installation
            ws.send(JSON.stringify({html: "🔴 Cancelled", status: "cancelled"}));
            cancel = true;
            ws.send("{{cancelled}}");
            return;
        }
    });

    // first check if the otel collector is installed and running.
    if(config.refinery_installed) {
        stop_refinery();
    }

    var file_name = "refinery-" + config["os.platform"] + "-" + config["os.arch"];
    var url = "https://github.com/honeycombio/refinery/releases/download/v" + version + "/" + file_name;
    console.log("installation url: ", url);
    var refinery_temp = config["refinery_home"] + "/refinery-v" + version;
    var refinery_path = config["refinery_home"] + "/refinery";
    var file = fs.createWriteStream(refinery_temp);
    https.https.get(url, function(response) {
        // get response length
        var contentLength = response.headers['content-length'];
        var downloadedLength = 0;
        console.log("content length: ", contentLength);
        console.log("status code: ", response.statusCode);
        if (response.statusCode !== 200) {
            ws.send(JSON.stringify({html: "Failed to download file: " + response.statusCode}));
            return new Error(`Failed to download file: ${response.statusCode}`);
        }
        console.log("downloading the file");
        // print out the bytes received during the download
        response.on("data", function(chunk) {
            if(cancel) {
                // stop the download and exit
                response.destroy();
                return;
            } else {
                downloadedLength += chunk.length;
                ws.send(JSON.stringify({html:  "⏬ " + downloadedLength + " / " + contentLength + " bytes", status: "downloading"}));
                // console.log("received: ", downloadedLength, " / ", contentLength, " bytes");
            }
        });
        response.pipe(file);
        file.on("finish", function() {
            console.log("Download complete");

            console.log("creating a new config file for the refinery");
            if(!config["refinery_config_exists"]) {
                var config_template = fs.readFileSync(config["work_dir"] + "/examples/refinery-config.yml", "utf8");
                // in the future, we could even provide some default settings
                // write to the config path
                config["refinery"]["config_path"] = config["refinery_home"] + "/refinery-config.yml";
                fs.writeFileSync(config["refinery"]["config_path"], config_template);
                config["refinery_config_exists"] = true;
            }

            // create a new rule file for the refinery
            if(!config["refinery_rule_exists"]) {
                var rule_template = fs.readFileSync(config["work_dir"] + "/examples/refinery-rule.yml", "utf8");
                config["refinery"]["rule_path"] = config["refinery_home"] + "/refinery-rule.yml";
                fs.writeFileSync(config["refinery"]["rule_path"], rule_template);
                config["refinery_rule_exists"] = true;
            }

            // rename the temp file to the refinery path
            fs.renameSync(refinery_temp, refinery_path);
            // Change file permission to executable (chmod +x)
            fs.chmod(refinery_path, 0o755, (err) => {
                if (err) {
                    console.error('Error changing file permissions:', err);
                } else {
                    console.log('File permissions updated successfully');
                }
            });

            // save the config
            config["refinery_version"] = version;
            config["refinery"]["bin_path"] = refinery_path;
            config["refinery_installed"] = true;
            save_config(config);
            console.log("saved the config");
            ws.send(JSON.stringify({html: "🟢 Installed", status: "success"}));
        });
    });
}