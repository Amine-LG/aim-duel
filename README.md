# Aim Duel

A small real-time multiplayer game that exists as a **Kubernetes workload** —
the point of this repo is the operations around the app, not the app itself.
The game (1v1 reaction duels over WebSockets) is deliberately simple; it was
chosen because real-time multiplayer is an honest workload for infrastructure
work. It produces long-lived WebSocket connections, short-lived stateful rooms,
reconnect/disconnect recovery, and in-memory server state — exactly the things
that make naive scaling fail and force real answers about readiness, draining,
and pod lifecycle.

This README grows one step at a time. Today it covers running the app on
Kubernetes from local manifests. Argo CD (GitOps), a CI pipeline to a registry,
TLS, and monitoring each land as their own step and extend the sections below.

## Why this workload is interesting for Kubernetes

* **WebSockets in production** — long-lived Socket.IO connections the ingress,
  probes, and shutdown all have to respect (not request/response CRUD).
* **In-memory state** — rooms and match timers live in the pod. This makes the
  single-replica constraint concrete instead of hand-waved.
* **Probe-driven lifecycle** — separate liveness (`/health`) and drain-aware
  readiness (`/ready`) so a rollout drains a pod before it closes sockets.
* **Graceful shutdown** — a two-phase SIGTERM that finishes inside the
  Kubernetes grace period instead of dropping connections on the floor.

## What's deployed today

| Manifest | Resource | Notes |
|---|---|---|
| `k8s/00-namespace.yaml` | Namespace `aim-duel` | everything is namespaced here |
| `k8s/01-deployment.yaml` | Deployment | single replica, `Recreate`, hardened pod, probes |
| `k8s/02-service.yaml` | Service (ClusterIP) | `:80` → pod `:3000` |
| `k8s/03-ingress.yaml` | Ingress (nginx) | WebSocket timeouts; replace the placeholder host |
| `k8s/kustomization.yaml` | Kustomization | ties them together + pins the image |

The app is one process: Node + Express serves the static SPA **and** the
Socket.IO endpoint on a single port (`3000`), so it ships as one container with
no sidecars, no database, and no cache.

## Build the image and load it into the cluster

```bash
# Build the single self-contained image (frontend + backend).
podman build -t aim-duel:local .

# Make it available to the cluster's container runtime. Pick your cluster:
minikube image load aim-duel:local                       # minikube
podman save aim-duel:local | sudo k3s ctr images import -  # k3s
podman save aim-duel:local -o aim-duel.tar && \
  kind load image-archive aim-duel.tar                   # kind
```

The Deployment uses `imagePullPolicy: IfNotPresent`, so once the image is loaded
the cluster runs it without reaching a registry. (A registry-based image arrives
with the CI/GitOps step.)

## Deploy

```bash
kubectl apply -k k8s/

kubectl -n aim-duel rollout status deploy/aim-duel
kubectl -n aim-duel get pods,svc,ingress
```

Quick check without an ingress controller:

```bash
kubectl -n aim-duel port-forward deploy/aim-duel 8099:3000
# open http://localhost:8099 — the live counter should read "Live"
curl -s http://localhost:8099/health   # {"status":"ok",...}
```

To reach it through the ingress, edit the host in `k8s/03-ingress.yaml`
(`aim-duel.example.com` is a placeholder — no domain is hardcoded in this repo)
and point your DNS at the ingress controller. TLS is a later step.

## Pod lifecycle and hardening

* `GET /health` — **liveness**: 200 while the process is up, including during
  drain. The kubelet restarts the container only if it is genuinely wedged.
* `GET /ready` — **readiness**: 200 with live gauges (`onlineCount`,
  `roomCount`); **503 the moment shutdown begins**, so the pod leaves the
  Service endpoints before any socket closes.
* **SIGTERM** → `/ready` flips to 503 for a short drain window → sweepers stop,
  rooms tear down, Socket.IO and HTTP close → a force-exit timer guarantees the
  process ends well under `terminationGracePeriodSeconds` (20s here).
* **Container security**: `runAsNonRoot` (uid 1000), read-only root filesystem,
  `allowPrivilegeEscalation: false`, all capabilities dropped, seccomp
  `RuntimeDefault`, and tight resource requests/limits.

## Single replica, on purpose

The Deployment is `replicas: 1` with the `Recreate` strategy and no HPA. Room
and match state — including live `setTimeout` handles — is pod-local and not
shared, so a second replica could not see the first one's rooms, and broadcasts
would not cross pods. `Recreate` avoids ever running two stateful pods at once
during a rollout; the accepted trade-off is that a deploy drops live matches
(clients recover cleanly). Multi-replica is a later step that needs a shared
broadcast/ownership layer first.

## Configuration

Deployment values are environment-overridable; game rules stay code-only.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP/WebSocket listen port |
| `ALLOWED_ORIGINS` | (built-in dev list) | Extra cross-origin allow-list; same-origin is always allowed, so this is unset for single-origin deploys |
| `PUBLIC_ORIGIN` | `http://localhost:$PORT` | Backstop for server-built invite links; the client uses its own `window.location.origin`, so it rarely matters |
| `SHUTDOWN_DRAIN_MS` | `750` | How long `/ready` reports 503 before teardown |
| `SHUTDOWN_FORCE_EXIT_MS` | `8000` | Hard bound for graceful shutdown |
| `MAX_ROOMS` | `200` | Concurrent-room cap (memory protection) |

## Roadmap

Each step extends this README and the `k8s/` manifests:

1. **Argo CD (GitOps)** — an Application syncs `k8s/`; the cluster stops being
   applied by hand.
2. **CI → registry** — build and push the image on every push to `main`, then
   bump the kustomization image tag.
3. **TLS** — cert-manager ClusterIssuer + a `tls:` block on the Ingress (WS → WSS).
4. **Monitoring** — Prometheus metrics + a Grafana dashboard.
5. **Multi-replica** — a shared broadcast/ownership layer, then `replicas > 1`,
   `RollingUpdate`, a PodDisruptionBudget, and an HPA.

## Repository layout

```
backend/        Node + Express + Socket.IO (serves the SPA and the WebSocket)
frontend/       React + Vite SPA, built into the image
Containerfile   Multi-stage build: frontend dist + production backend deps
k8s/            Kustomize manifests: namespace, deployment, service, ingress
```

## Local development

```bash
npm --prefix backend install
npm --prefix frontend install

npm --prefix backend start        # backend on http://localhost:3000
npm --prefix frontend run dev     # Vite on http://localhost:5173 (proxies /socket.io)
```
