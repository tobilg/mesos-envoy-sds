"use strict";

const express = require("express");
let app = express();

const config = require("./lib/config");
const api = require("./routes/api");

// Helpers
const helpers = require("./lib/helpers");

// Instantiate logger
const logger = helpers.getLogger();

// Set application properties
app.set("port", process.env.PORT0 || config.application.port);
app.set("host", process.env.HOST || config.application.host);
app.set("env", process.env.NODE_ENV || config.application.environment);
app.set("logLevel", process.env.LOG_LEVEL || config.application.logLevel);

// Create routes
app.use("/" + config.application.apiVersion, api);

// Create /health endpoint for Marathon health checks
app.get("/health", function(req, res) {
    res.send("OK");
});

// Create Express.js server instance
let server = app.listen(app.get("port"), app.get("host"), function () {
    logger.info("Express server listening on port " + server.address().port + " on " + server.address().address);
});

// Handle uncaught exceptions
process.on("uncaughtException", function (error) {
    logger.error(JSON.stringify(error));
});