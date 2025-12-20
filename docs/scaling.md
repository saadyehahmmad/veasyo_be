# Scaling guide — support ≥2000 users and ≥1000 active socket rooms

This document describes architecture, configuration, and operational steps to scale this system (backend) to handle at least 2000 concurrent users and at least 1000 active socket rooms. It focuses on real, actionable changes you can make to `src` and deploy with Docker/Kubernetes or PM2.

Goals
- Serve ≥2000 concurrent connected users
- Support ≥1000 active socket rooms with low latency broadcasts
- Single-page rollouts: incremental scaling, observable and testable

Summary of approach
- Scale horizontally: run multiple Node replicas (processes/containers). Use a pub/sub adapter (Redis) for Socket.IO to coordinate rooms across instances.
- Use a robust load balancer (Nginx, cloud LB) and avoid single-instance socket affinity by using the Redis adapter (sticky sessions unnecessary if adapter used properly).
- Tune OS and Node settings: file descriptors, TCP backlog, libuv threadpool, Node cluster or PM2 for multi-core usage.
- Scale datastore (Postgres, MySQL, etc.) using connection pooling (PgBouncer), read replicas for read-heavy queries, and sensible pool sizes.
- Add monitoring, load-testing, and automated scaling (HPA in Kubernetes or autoscaling groups in cloud).

Key components and changes

1) Socket layer (Socket.IO or equivalent)

- Use the Socket.IO Redis adapter so multiple Node processes share room state and broadcasts.
- Install and configure `socket.io-redis` (or `@socket.io/redis-adapter` for Socket.IO v4+).

Example (server bootstrap):

```js
// in your server startup (e.g. src/server.ts)
import { createServer } from 'http';
import { Server as IOServer } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

const httpServer = createServer(app);
const io = new IOServer(httpServer, { /* cors/options */ });

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await pubClient.connect();
await subClient.connect();
io.adapter(createAdapter(pubClient, subClient));

httpServer.listen(PORT);
```

Notes:
- Use a managed Redis (clustered) or Redis Sentinel for HA.
- For 1000 active rooms, Redis pub/sub throughput matters — provision bandwidth and CPU accordingly.

2) Load balancer and proxy

- Nginx sample for WebSocket proxying:

```nginx
upstream backend {
  server backend-1:3000;
  server backend-2:3000;
  server backend-3:3000;
}

server {
  listen 80;
  location /socket.io/ {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

With the Redis adapter, you do not need sticky sessions. If you cannot use Redis for some reason, enable sticky sessions on the LB.

3) Horizontal scaling & process management

- Run multiple Node processes per machine to use all CPU cores. Two common ways:
  - PM2 in cluster mode
  - Node `cluster` module or run multiple container replicas in Kubernetes

PM2 example:

```json
{
  "apps": [
    {
      "name": "waiter-backend",
      "script": "dist/server.js",
      "instances": "max",
      "exec_mode": "cluster",
      "env": {
        "NODE_ENV": "production"
      }
    }
  ]
}
```

4) Database scaling and pooling

- Use a connection pool; do NOT open a new DB connection per socket. Typical Node ORMs/drivers (pg, sequelize) support a pool.
- If each Node instance has pool size N and you have M instances, ensure total connections <= DB max_connections. Use PgBouncer to centralize pooling.

Example pool sizing (Postgres):
- Goal: 2000 concurrent users. Assume 4 Node instances → pool size ~20-50 each depending on workload.
- Use PgBouncer or increase DB max_connections carefully.

5) Redis sizing and topology

- Redis will handle pub/sub and possibly session cache. For 1000 active rooms and ~2000 connections:
  - Estimate message throughput: messages/sec * avg message size.
  - Monitor `instantaneous_ops_per_sec` and memory.
- Start with a single reasonably sized Redis (2-4 CPU, 4-8GB RAM). Move to Redis Cluster if you need more memory and throughput.

6) OS and Node tuning

- Increase allowed file descriptors (Linux):
  - `ulimit -n 65536`
  - sysctl: `net.core.somaxconn = 65535`, `net.ipv4.tcp_tw_reuse = 1`
- Node options: `--max-old-space-size=4096` as needed
- Tune libuv thread pool: `UV_THREADPOOL_SIZE=8` for heavy filesystem/crypto workloads

7) Kubernetes example (minimal)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: waiter-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: waiter-backend
  template:
    metadata:
      labels:
        app: waiter-backend
    spec:
      containers:
      - name: backend
        image: myregistry/waiter-backend:latest
        env:
          - name: REDIS_URL
            value: "redis://redis:6379"
        resources:
          requests:
            cpu: 250m
            memory: 512Mi
          limits:
            cpu: 1000m
            memory: 2Gi

---
apiVersion: v1
kind: Service
metadata:
  name: waiter-backend
spec:
  selector:
    app: waiter-backend
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: ClusterIP
```

Add an `HorizontalPodAutoscaler` targeting CPU% or a custom metric (e.g. number of open sockets reported via a Prometheus exporter).

8) Load testing and verification

- Use `artillery` or `k6` to simulate socket connections and room activity.

Artillery example (socket.io):

```yaml
config:
  target: "http://your-lb.example.com"
  phases:
    - duration: 300
      arrivalRate: 20
scenarios:
  - engine: "socket.io"
    flow:
      - emit: ["joinRoom", {"room": "room-{{ $randomInt(1,1000) }}"}]
      - think: 2
      - emit: ["message", {"room": "room-{{ $randomInt(1,1000) }}", "text": "hello"}]
```

- Start with a small load and increase until you detect resource limits. Monitor:
  - CPU, memory per Node pod
  - Redis ops/sec, memory
  - DB connections and query latency

9) Monitoring & Alerts

- Export metrics: use `prom-client` in Node to expose metrics; collect with Prometheus and visualize in Grafana.
- Key metrics:
  - open sockets per pod
  - rooms count per pod
  - Redis pub/sub latency and ops/sec
  - DB connection count and query latency
  - event loop lag, CPU, memory
- Alerts: high open sockets per pod, Redis ops/sec near limit, DB connection usage >80%, event loop lag >200ms.

10) Back-of-the-envelope capacity planning

- Memory per socket (server-side): conservative estimate 5-20 KB. For 2000 sockets → 10-40 MB just for socket objects, plus app memory.
- If you target 500-1000 sockets per instance, you'll need ~3-5 app instances to handle 2000 users comfortably.
- For 1000 active rooms, the major cost is message fan-out. If many rooms receive frequent broadcasts, the network and Redis throughput dominate: traffic = messages/sec * avg message size * number of recipients.

Example calculation:
- 2000 users, 1000 rooms, average room size 2 users, 1 message/sec per room, message size 1KB:
  - messages/sec = 1000
  - bandwidth = 1000 * 1KB * avg recipients (2) = ~2 MB/s outbound total
  - Redis pub/sub will process ~1000 pub/sub ops/sec — modest, but growth matters.

11) Security, resilience, and other considerations

- Use TLS termination at LB
- Rate-limit message emission if clients can spam rooms
- Gracefully handle disconnects and reconnections
- Implement request throttling for endpoints that create rooms or heavy DB writes

Deployment checklist
- [ ] Add Redis adapter to `src` Socket.IO initialization and test locally
- [ ] Provision Redis (single instance for testing, cluster for production)
- [ ] Ensure `NODE_ENV=production` and run Node with a process manager (PM2 or k8s replicas)
- [ ] Add Prometheus metrics endpoints and dashboards for sockets/rooms
- [ ] Write artillery/k6 load tests and run them against a staging cluster
- [ ] Tune OS limits and kernel params on server images
- [ ] Configure DB pooling (PgBouncer) and read replicas before scaling app replicas

Next steps (practical)
1. Implement the Socket.IO Redis adapter in `src/server.ts` / startup code and test locally with two Node processes.
2. Add metrics (open sockets, rooms count) and export them to Prometheus.
3. Create a small k8s staging cluster (3 replicas) and run the provided artillery scenario to validate behavior.
4. Tune instance counts and resources based on observed per-pod socket capacity and Redis/DB load.

References and tools
- `@socket.io/redis-adapter` (Socket.IO Redis adapter)
- Artillery / k6 for socket load testing
- Prometheus + Grafana for metrics and alerting
- PgBouncer for Postgres connection pooling

If you want, I can:
- open a PR adding the Redis adapter code change in `src/server.ts` and a small `docker-compose` or `k8s` manifest to test locally.
- add an `artillery` test file and a basic Prometheus `ServiceMonitor`.

-- end
