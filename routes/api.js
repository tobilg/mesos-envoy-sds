"use strict";

const MesosState = require("../lib/mesos");

let ms = new MesosState({
    masterHost: process.env.MASTER_HOST || "leader.mesos",
    masterPort: process.env.MASTER_PORT || 5050,
    masterProtocol: process.env.MASTER_PROTOCOL || "http",
    masterApiUri: process.env.MASTER_API_URI || "/api/v1",
    masterConnectionTimeout: process.env.MASTER_CONNECTION_TIMEOUT_MS || 5000,
    reconcileIntervalMilliseconds: process.env.RECONCILE_INTERVAL_MS || 60000
});

let router = require("express").Router();

// define the home page route
router.get("/registration/:serviceName", function (req, res) {
    let hosts = [];
    if (req.params.serviceName) {
        hosts = ms.getService(req.params.serviceName);
    }
    res.send({
        hosts: hosts
    });
});

module.exports = router;
