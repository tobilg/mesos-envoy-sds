# mesos-envoy-sds
An [Envoy](https://lyft.github.io/envoy/docs/index.html) Service Discovery Service for Mesos. This service can be launched within a Mesos cluster, e.g. via Marathon, and will provide a [Envoy SDS endpoint](https://www.envoyproxy.io/docs/envoy/v1.5.0/api-v1/cluster_manager/sds) which can be usend in a Envoy configuration.

## Configuration

You can configure `mesos-envoy-sds` via the following environment variables:

* `MASTER_HOST`: The hostname/ip address where the Mesos Master is running. Default is `leader.mesos`, which assumes you're running Mesos DNS in your cluster.
* `MASTER_PORT`: The Mesos Master's port. Default is `5050`. 
* `MASTER_PROTOCOL`: The Master's communication protocol for the Operator API. Default is `http`.
* `MASTER_API_URI`: The URI under which the Operator API can be found. Default is `/api/v1`.
* `MASTER_CONNECTION_TIMEOUT_MS`: The timeout in milliseconds for the connection to the Mesos Master. Default is `5000`.
* `RECONCILE_INTERVAL_MS`: The interval in milliseconds when a "reconcile" (meaning a `GET_STATE` call to retrieve the current state from the leading Mesos Master) is triggered. Default is `60000` (ten minutes).
* `NODE_ENV`: The Node.js environment type. Default is `development`, the Docker image uses `production`.
* `LOG_LEVEL`: The log level of the application (see [Winston docs](https://www.npmjs.com/package/winston#using-logging-levels)). Default is `info`. 
* `API_VERSION`: The API version of the Envoy SDS API's `/registration/:serviceName` endpoint. Default is `v1`.

## Installation via Marathon

Use the following example Marathon application definition to launch the Mesos Envoy SDS. 

If you're using a default Mesos cluster installation regarding master ports, it shouldn't be necessary to pass any additional configuration environment variables. In this example, we overwrite the default `RECONCILE_INTERVAL_MS` of `600000` (ten minutes) with a custom two-minute interval, and set the `LOG_LEVEL` to `debug` instead `info`.  

```javascript
{
  "id": "/mesos-envoy-sds",
  "cpus": 0.1,
  "mem": 128,
  "disk": 0,
  "instances": 1,
  "container": {
    "type": "DOCKER",
    "docker": {
      "image": "tobilg/mesos-envoy-sds:0.1.0",
      "network": "HOST",
      "privileged": false,
      "forcePullImage": true
    }
  },
  "env": {
    "RECONCILE_INTERVAL_MS": "120000",
    "LOG_LEVEL": "debug"
  },
  "labels":{
    "MARATHON_SINGLE_INSTANCE_APP": "true"
  },
  "upgradeStrategy":{
    "minimumHealthCapacity": 0,
    "maximumOverCapacity": 0
  },
  "portDefinitions": [
    {
      "port": 31333,
      "protocol": "tcp",
      "name": "api"
    }
  ],
  "requirePorts": true,
  "healthChecks": [
    {
      "protocol": "HTTP",
      "portIndex": 0,
      "path": "/health",
      "gracePeriodSeconds": 5,
      "intervalSeconds": 20,
      "maxConsecutiveFailures": 3
    }
  ]
}
```

In this example, it uses a static host port `31333` which can be replace by any given (non-used) port. When your cluster uses Mesos DNS as well, the endpoint will be able to be used at `mesos-envoy-sds.marathon.mesos:31333` by Envoy itself.

## Usage with Envoy

This could be an example Envoy configuration which makes use of the Mesos Envoy SDS:

```javascript
{
  "listeners": [
    {
      "address": "tcp://0.0.0.0:80",
      "filters": [
        {
          "type": "read",
          "name": "http_connection_manager",
          "config": {
            "codec_type": "auto",
            "stat_prefix": "ingress_http",
            "rds": {
              "cluster": "rds",
              "route_config_name": "front_proxy",
              "refresh_delay_ms": 250
            },
            "filters": [
              { "type": "both", "name": "health_check",
                "config": {
                  "pass_through_mode": false, "endpoint": "/healthcheck"
                }
              },
              {
                "type": "decoder",
                "name": "router",
                "config": {}
              }
            ]
          }
        }
      ]
    }
  ],
  "admin": {
    "access_log_path": "/dev/null",
    "address": "tcp://0.0.0.0:8001"
  },
  "cluster_manager": {
    "sds": {
      "cluster": {
        "name": "sds",
        "connect_timeout_ms": 250,
        "type": "strict_dns",
        "lb_type": "round_robin",
        "hosts": [{"url": "mesos-envoy-sds.marathon.mesos:31333"}]
      },
      "refresh_delay_ms": 2000
    },
    "cds": {
      "cluster": {
        "name": "cds",
        "connect_timeout_ms": 250,
        "type": "strict_dns",
        "lb_type": "round_robin",
        "hosts": [{"url": "mesos-envoy-sds.marathon.mesos:31333"}]
      },
      "refresh_delay_ms": 2000
    },
    "clusters": [
      {
          "name": "rds",
          "connect_timeout_ms": 250,
          "type": "logical_dns",
          "lb_type": "round_robin",
          "hosts": [{"url": "mesos-envoy-sds.marathon.mesos:31333"}]
      }
    ]
  }
}

```
