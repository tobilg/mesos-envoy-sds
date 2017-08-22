"use strict";

const packageInfo = require("../package.json");
const winston = require('winston');

function getTimestamp() {
    return Date.now();
}

function getFormatter(options) {
    // Return string will be passed to logger.
    return options.timestamp() +' '+ options.level.toUpperCase() +' '+ (options.message ? options.message : '') +
        (options.meta && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' );
}

module.exports = {

    getLogger: function(path, fileName, logLevel) {

        let logger = new (winston.Logger)({
            transports: [
                new (winston.transports.Console)({
                    timestamp: getTimestamp,
                    formatter: getFormatter,
                    level: logLevel || "info"
                }),
                new (require("winston-daily-rotate-file"))({
                    filename: (path && fileName ? path + "/" + fileName : "logs/" + packageInfo.name + ".log"),
                    level: logLevel || "info",
                    prepend: true,
                    json: false
                })
            ]
        });

        return logger;

    }

};