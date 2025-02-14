
function format_for_otelbin(config_yaml) {
    // text conversion to convert the data as follows:
    // 1. convert any ' ' to '_'
    // 2. convert any '*' to '**'
    // 3. convert any '_' to '*_'
    // 4. convert any '\n' to '*N'
    // 5. convert any '#' to '*H'
    // enclose the data with '#' and '~'
    return formatted_data = config_yaml.replace(/\*/g, '**').replace(/_/g, '*_').replace(/\(/g, '*C').replace(/\)/g, '*D').replace(/\n/g, '*N').replace(/#/g, '*H').replace(/ /g, '_');
}

var distro_version = "&distro=otelcol-contrib%7E&distroVersion=v0.116.1%7E";

function get_otelbin_url(config_yaml) {
    var formatted_data = encodeURIComponent(format_for_otelbin(config_yaml));
    return 'https://otelbin.com/?#config=*' + formatted_data + "%7E" + distro_version;
}
