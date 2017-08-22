# mesos-envoy-sds
An [Envoy](https://lyft.github.io/envoy/docs/index.html) Service Discovery Service for Mesos. This service can be launched within a Mesos cluster, e.g. via Marathon, and will provide a [Envoy SDS endpoint](https://lyft.github.io/envoy/docs/configuration/cluster_manager/sds_api.html) which can be usend in a Envoy configuration.

## Configuration

You can configure `mesos-envoy-sds` via the following environment variables:

* `NODE_ENV`:
* `LOG_LEVEL`: 
* `API_VERSION`: 
* `MASTER_HOST`: 
* `MASTER_PORT`: 
* `MASTER_PROTOCOL`: 
* `MASTER_API_URI`: 
* `MASTER_CONNECTION_TIMEOUT_MS`: 
* `RECONCILE_INTERVAL_MS`:  

## Installation via Marathon

```javascript
{
    
}
```

## Usage with Envoy

To be described.
