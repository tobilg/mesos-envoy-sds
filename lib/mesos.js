"use strict";

const EventEmitter = require("events").EventEmitter;
const helpers = require("./helpers");

// Use the MesosOperatorApiClient
const MasterClient = require("mesos-operator-api-client").masterClient;

/**
 * Represents a MesosState object
 * @constructor
 * @param {object} options - The option map object.
 */
function MesosState (options) {

    if (!(this instanceof MesosState)) {
        return new MesosState(options);
    }

    // Inherit from EventEmitter
    EventEmitter.call(this);

    let self = this;

    self.masterHost = options.masterHost || "127.0.0.1";
    self.masterPort = options.masterPort || 5050;
    self.masterProtocol = options.masterProtocol || "http";
    self.masterApiUri = options.masterApiUri || "/api/v1";
    self.masterConnectionTimeout = options.masterConnectionTimeout || 5000;

    self.reconcileIntervalMilliseconds = options.reconcileIntervalMilliseconds || 600000; // 10 minutes
    self.reconcileInterval = null; // Placeholder

    self.logger = helpers.getLogger();

    // StateCache will hold the state of all Envoy-enabled services
    self.stateCache = {
        loadTimestamp: (new Date().getTime()),
        services: {}
    };

    // AgentCache will hold the agent ip address info
    self.agentCache = {};

    // Create MesosOperatorApiClient instance
    self.masterClient = new MasterClient({
        masterHost: self.masterHost,
        masterPort: self.masterPort,
        masterProtocol: self.masterProtocol,
        masterApiUri: self.masterApiUri,
        masterConnectionTimeout: self.masterConnectionTimeout
    });

    // Wait for "subscribed" event
    self.masterClient.on("subscribed", function () {
        self.logger.info("Subscribed to the Mesos Operator API events!");
        // Call GET_AGENTS
        self.masterClient.getAgents(function (err, data) {
            self.logger.info("Got result for GET_AGENTS");
            // Store the agent info (mapping between agent id and hostname
            self.handleFullAgentInfo(data.agents);
            // Trigger getting the initial task info
            self.masterClient.getTasks(function (err, data) {
                self.logger.info("Got result for GET_TASKS");
                // Handle and store the task information
                self.handleFullTaskState(data.tasks);
            });
        });

        // Set up the reconcile interval
        self.reconcileInterval = setInterval(function () {
            self.logger.info("Triggered reconile");
            // Trigger reconcile (get full Mesos state)
            self.masterClient.reconcile();
        }, self.reconcileIntervalMilliseconds);

    });

    // Wait for "unsubscribed" event
    self.masterClient.on("unsubscribed", function () {
        self.logger.info("Unsubscribed from the Mesos Operator API events!");
    });

    // Wait for "reconciled" event
    self.masterClient.on("reconciled", function (stateObj) {
        self.logger.info("Got the reconcile result");
        // Handle the full task state info
        self.handleFullTaskState(stateObj.get_state.get_tasks.tasks);
    });

    // Catch error events
    self.masterClient.on("error", function (errorObj) {
        self.logger.info("Got an error");
        self.logger.info(JSON.stringify(errorObj));
    });

    // Log SUBSCRIBED event
    self.masterClient.on("SUBSCRIBED", function (stateObj) {
        self.logger.info("Got SUBSCRIBED");
    });

    // Log TASK_ADDED event
    self.masterClient.on("TASK_ADDED", function (taskObj) {
        self.logger.info("Got TASK_ADDED");
        self.logger.info("--> Do nothing, because not in TASK_RUNNING yet");
    });

    // Log TASK_UPDATED event
    self.masterClient.on("TASK_UPDATED", function (updateObj) {
        self.logger.info("Got TASK_UPDATED");
        self.handleTaskState(updateObj, (new Date().getTime()));
    });

    // Log AGENT_ADDED event
    self.masterClient.on("AGENT_ADDED", function (agentObj) {
        self.logger.info("Got AGENT_ADDED");
        self.addAgentInfo(agentObj);
    });

    // Log AGENT_REMOVED event
    self.masterClient.on("AGENT_REMOVED", function (agentObj) {
        self.logger.info("Got AGENT_REMOVED");
        self.removeAgentInfo(agentObj);
    });

    // Subscribe to Mesos Operator API events
    self.masterClient.subscribe();

}

/**
 * Handle the full task state update from the Mesos Master
 * @param {array} tasks - The array of {@link https://github.com/apache/mesos/blob/master/include/mesos/v1/mesos.proto#L1966|TaskInfo} objects.
 */
MesosState.prototype.handleFullTaskState = function (tasks) {
    let self = this;
    // Set the current timestamp
    const currentTimestamp = new Date().getTime();
    // Check if we have an array
    if (Array.isArray(tasks)) {
        // Iterate over tasks
        tasks.forEach(function (task) {
            // Handle individual task state
            self.handleTaskState(task, currentTimestamp);
        });
    }
    self.logger.debug(JSON.stringify(self.stateCache));
};

/**
 * Handle the initial load of agent information
 * @param {array} agents - The array of {@link https://github.com/apache/mesos/blob/master/include/mesos/v1/mesos.proto#L880|AgentInfo} objects.
 */
MesosState.prototype.handleFullAgentInfo = function (agents) {
    let self = this;
    if (Array.isArray(agents) && agents.length > 0) {
        agents.forEach(function (agentObj) {
            self.updateAgentInfo(agentObj);
        });
    }
    self.logger.debug(self.agentCache);
};

/**
 * Update the agent information for a specific agent
 * @param {object} agentObj - The {@link https://github.com/apache/mesos/blob/master/include/mesos/v1/mesos.proto#L880|AgentInfo} object.
 */
MesosState.prototype.updateAgentInfo = function (agentObj) {
    let self = this;
    if (agentObj.active) {
        self.agentCache[agentObj.agent_info.id.value] = agentObj.agent_info.hostname;
    }
};

/**
 * Remove the agent information for a specific agent
 * @param {object} agentObj - The {@link https://github.com/apache/mesos/blob/master/include/mesos/v1/mesos.proto#L880|AgentInfo} object.
 */
MesosState.prototype.removeAgentInfo = function (agentObj) {
    let self = this;
    if (agentObj.id.value && self.agentCache.hasOwnProperty(agentObj.id.value)) {
        delete self.agentCache[agentObj.agent_info.id.value];
    }
};

/**
 * Add the newly added agent information to the agentCache
 * @param {object} agentObj - The {@link https://github.com/apache/mesos/blob/master/include/mesos/v1/mesos.proto#L880|AgentInfo) object.
 */
MesosState.prototype.addAgentInfo = function (agentObj) {
    let self = this;
    self.updateAgentInfo(agentObj);
};

/**
 * Handle a task state update
 * @param {object} task - The {@link https://github.com/apache/mesos/blob/master/include/mesos/v1/mesos.proto#L1966|TaskInfo} object.
 * @param {number} currentTimestamp - The current unix timestamp with milliseconds
 */
MesosState.prototype.handleTaskState = function (task, currentTimestamp) {
    let self = this;
    // Check if the task is in state TASK_RUNNING
    if (task.state === "TASK_RUNNING") {
        // Check if we have labels
        if (task.labels && task.labels.labels) {
            // Get map of ENVOY_*  labels
            let envoyLabels = self.checkLabels(task.labels.labels);
            // Check if we have the right label
            if (Object.getOwnPropertyNames(envoyLabels).length > 0 && envoyLabels.hasOwnProperty("ENVOY_PORT_INDEX")) {
                // Get host port for the task
                if (task.discovery && task.discovery.ports && task.discovery.ports.ports) {
                    let port = self.extractPortByIndex(task.discovery.ports.ports, parseInt(envoyLabels["ENVOY_PORT_INDEX"]));
                    // Check if we have a valid port
                    if (port) {
                        // Get IP address
                        //let ipAddress = self.extractIPAddress(task.statuses);
                        let ipAddress = self.mapAgentIdToIpAddress(task.agent_id.value);
                        // Check if we have a IP address
                        if (ipAddress) {

                                // Get service name
                                let serviceName = self.getServiceNameFromTask(task);
                                // Check if we have a service name
                                if (serviceName) {
                                    // Save task id
                                    let taskId = task.task_id.value;
                                    // Check if service even exists, if not set it up
                                    if (!self.stateCache.services.hasOwnProperty(serviceName)) {
                                        self.stateCache.services[serviceName] = {};
                                        self.stateCache.services[serviceName].tasks = {};
                                        self.stateCache.services[serviceName].loadTimestamp = currentTimestamp;
                                    }

                                    // Write/overwrite discovery info per task
                                    self.stateCache.services[serviceName].tasks[taskId] = {
                                        ip_address: ipAddress,
                                        port: port
                                    };

                                    // Update the loading timestamp
                                    self.stateCache.services[serviceName].loadTimestamp = currentTimestamp;
                                    self.stateCache.loadTimestamp = currentTimestamp;

                                }

                        }
                    }
                }
            }
        }
    } else if (self.isTerminalTaskState(task.state)) {

        // Get task id
        let taskId = task.status.task_id.value;
        // Split by . to derive the service name
        let temp = taskId.split(".");
        // Remove last array entry
        temp.pop();
        // Join remaining array entries to get service name
        let serviceName = temp.join(".");

        if (self.stateCache.services.hasOwnProperty(serviceName) && self.stateCache.services[serviceName].tasks && self.stateCache.services[serviceName].tasks.hasOwnProperty(taskId)) {
            self.logger.info("Will remove task '" + taskId + "' from service '" + serviceName + "'");
            // Remove task from stateCache
            delete self.stateCache.services[serviceName].tasks[taskId];
        }

    }
};

/**
 * Get host details for service name
 * @param {string} serviceName - The name of the service where the host objects should be returned for.
 */
MesosState.prototype.getService = function (serviceName) {
    let self = this;
    let hosts = [];
    if (self.stateCache.services.hasOwnProperty(serviceName) && Object.getOwnPropertyNames(self.stateCache.services[serviceName].tasks).length > 0) {
        Object.getOwnPropertyNames(self.stateCache.services[serviceName].tasks).forEach(function (taskName) {
            hosts.push({
                ip_address: self.stateCache.services[serviceName].tasks[taskName].ip_address,
                port: self.stateCache.services[serviceName].tasks[taskName].port
            });
        });
    }
    return hosts;
};

/**
 * Check if the given task state is terminal
 * @param {string} state - The {@link https://github.com/apache/mesos/blob/master/include/mesos/v1/mesos.proto#L2005|TaskState}.
 */
MesosState.prototype.isTerminalTaskState = function (state) {
    const terminalStates = ["TASK_KILLED", "TASK_FAILED", "TASK_FINISHED", "TASK_ERROR", "TASK_DROPPED", "TASK_GONE"];
    return (terminalStates.indexOf(state) > -1);
};

/**
 * Check if the labels contain an ENVOY_* label
 * @param {array} labels - The array of {@link https://github.com/apache/mesos/blob/master/include/mesos/v1/mesos.proto#L2993|Labels}.
 */
MesosState.prototype.checkLabels = function (labels) {
    let validLabels = {};
    // Check if the labels are an array and non-empty
    if (Array.isArray(labels) && labels.length > 0) {
        // Iterate over labels array
        labels.forEach(function (label) {
            // Check if we have the right prefix
            if (label.key && label.key.match(/ENVOY_*/g)) {
                // We have a valid label
                validLabels[label.key] = label.value;
            }
        });
        return validLabels;
    } else {
        return validLabels;
    }
};

/**
 * Get port from list of ports
 * @param {array} ports - The array of ports in which the port shall be searched.
 * @param {number} index - The index of the wanted port in the port array
 */
MesosState.prototype.extractPortByIndex = function (ports, index) {
    let self = this;
    if (ports[index] && ports[index].number) {
        return ports[index].number;
    } else {
        return null;
    }
};

/**
 * Get a hostname for an agent id from the agentCache
 * @param {string} agentId - The agent id the hostname should be returned for.
 */
MesosState.prototype.mapAgentIdToIpAddress = function (agentId) {
    let self = this;
    if (self.agentCache.hasOwnProperty(agentId)) {
        return self.agentCache[agentId];
    } else {
        return null;
    }
};

/**
 * Extract the IP address from the task statuses
 * @param {array} taskStatuses - The array of {@link https://github.com/apache/mesos/blob/master/include/mesos/v1/mesos.proto#L2122|TaskStatus} objects.
 */
MesosState.prototype.extractIPAddress = function (taskStatuses) {
    if (taskStatuses.length >= 1) {
        // Reverse sort the statuses by status timestamp
        taskStatuses.sort(function (a, b) {
            return b.timestamp - a.timestamp;
        });
        // Use the most recent task status
        let currentInfo = taskStatuses[0];
        // Check if we have an IP address
        if (currentInfo.container_status && Array.isArray(currentInfo.container_status.network_infos) && currentInfo.container_status.network_infos[0].ip_addresses[0] && currentInfo.container_status.network_infos[0].ip_addresses[0].ip_address) {
            // Return the first found IP address
            return currentInfo.container_status.network_infos[0].ip_addresses[0].ip_address;
        } else {
            return null;
        }
    } else {
        return null;
    }

};

/**
 * Get service name from task
 * @param {object} task - The {@link https://github.com/apache/mesos/blob/master/include/mesos/v1/mesos.proto#L1966|TaskInfo} object.
 */
MesosState.prototype.getServiceNameFromTask = function (task) {
    let self = this;
    if (task.discovery && task.discovery.name) {
        return task.discovery.name;
    } else {
        return null;
    }
};

module.exports = MesosState;
