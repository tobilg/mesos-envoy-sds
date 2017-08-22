"use strict";

// General configuration
module.exports = {
    application: {
        port: 3000,
        host: "127.0.0.1",
        environment: "development",
        apiVersion: process.env.API_VERSION ||"v1",
        logLevel: "info"
    }
};