const toml = require('toml');
const fs = require('fs');

let config = {
    serviceName: 'amqp-proxy',
    logLevel: process.env.LOG_LEVEL || 'info',
    prettyPrintJson: true,
    amqp_host: "192.168.98.100",
    amqp_port: 5671,
    bind_port: 5055,
    bind_address: "127.0.0.1",
    no_auth: false,
    auth_service: "http://localhost:5053",
    realm_public_key_modulus: undefined,
    realm_public_key_exponent: undefined,
    audience: undefined,
    client_id: undefined,
    issuer: undefined
};

let configFromFile = {};
try {
    configFromFile = toml.parse(fs.readFileSync('./config/config.toml'));
}
catch(e)
{
    console.log("Problem reading ./config/config.toml");
}

if(configFromFile[config.serviceName]) {
    Object.assign(config, configFromFile[config.serviceName]);
}

module.exports = config;
