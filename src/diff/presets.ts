/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PresetDemo {
  id: string;
  name: string;
  description: string;
  leftText: string;
  rightText: string;
  ignoredFields: string[];
  ignoreListOrder: boolean;
}

export const PRESETS: PresetDemo[] = [
  {
    id: 'k8s-crd',
    name: 'Kubernetes CRD & Deployment',
    description: 'Demonstrates K8s metadata (managedFields, resourceVersion) muted diffs alongside real container spec changes.',
    ignoredFields: ['managedFields', 'resourceVersion', 'creationTimestamp', 'uid', 'generation'],
    ignoreListOrder: true,
    leftText: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
  namespace: production
  uid: "7e59b20d-83b1-4991-9e8c-8f121d58dfc1"
  resourceVersion: "18942031"
  generation: 4
  creationTimestamp: "2026-04-12T14:30:00Z"
  managedFields:
    - manager: kubectl-client-side-apply
      operation: Update
      apiVersion: apps/v1
      time: "2026-04-12T14:30:00Z"
  labels:
    app.kubernetes.io/name: payment-service
    app.kubernetes.io/tier: backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payment-service
  template:
    metadata:
      labels:
        app: payment-service
    spec:
      containers:
        - name: app
          image: "registry.internal.net/pay/service:v2.4.0"
          ports:
            - containerPort: 8080
              name: http
          resources:
            limits:
              cpu: "1000m"
              memory: "1Gi"
            requests:
              cpu: "250m"
              memory: "256Mi"
          env:
            - name: ENVIRONMENT
              value: "production"
            - name: DB_POOL_SIZE
              value: "20"
`,
    rightText: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
  namespace: production
  uid: "f948a03c-2104-4c81-8b22-901ddfa40993"
  resourceVersion: "19401552"
  generation: 5
  creationTimestamp: "2026-04-12T14:30:00Z"
  managedFields:
    - manager: argocd-application-controller
      operation: Update
      apiVersion: apps/v1
      time: "2026-10-22T06:15:00Z"
  labels:
    app.kubernetes.io/name: payment-service
    app.kubernetes.io/tier: backend
    app.kubernetes.io/managed-by: argocd
spec:
  replicas: 5
  selector:
    matchLabels:
      app: payment-service
  template:
    metadata:
      labels:
        app: payment-service
    spec:
      containers:
        - name: app
          image: "registry.internal.net/pay/service:v2.5.1"
          ports:
            - containerPort: 8080
              name: http
          resources:
            limits:
              cpu: "2000m"
              memory: "2Gi"
            requests:
              cpu: "500m"
              memory: "512Mi"
          env:
            - name: ENVIRONMENT
              value: "production"
            - name: DB_POOL_SIZE
              value: "35"
            - name: FEATURE_INSTANT_PAYOUTS
              value: "enabled"
`,
  },
  {
    id: 'jsonc-comments',
    name: 'JSONC Config & Key Reordering',
    description: 'Comments (// and /* */) are non-breaking, and Right keys auto-align to Left order (Option A).',
    ignoredFields: ['description'],
    ignoreListOrder: true,
    leftText: `{
  // Application identity configuration
  "name": "core-analytics",
  "version": "3.1.0",
  "private": true,
  /* Build & pipeline scripts */
  "scripts": {
    "dev": "vite --port 3000",
    "build": "tsc && vite build",
    "test": "node --test"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "lodash": "^4.17.21"
  },
  "settings": {
    "theme": "dark",
    "telemetry": false,
    "cacheTtlSeconds": 3600
  }
}`,
    rightText: `{
  // Note: keys in Right are shuffled in different order
  "settings": {
    "cacheTtlSeconds": 7200,
    "telemetry": false,
    "theme": "dark"
  },
  "version": "3.2.0",
  "name": "core-analytics",
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.21.2",
    "lodash": "^4.17.21",
    "zod": "^3.23.8"
  },
  "scripts": {
    "test": "node --test",
    "build": "vite build",
    "dev": "vite --port 3000"
  },
  "private": true
}`,
  },
  {
    id: 'yaml-vs-minified-json',
    name: 'YAML vs Minified Single-Line JSON',
    description: 'Format-agnostic matching compares normalized tree between multiline YAML and condensed JSON.',
    ignoredFields: [],
    ignoreListOrder: true,
    leftText: `title: System Status Dashboard
server:
  host: "api.cloud.internal"
  port: 8443
  ssl: true
features:
  - analytics
  - audit-logs
  - webhooks
rateLimits:
  requestsPerMinute: 600
  burst: 50
`,
    rightText: `{"title":"System Status Dashboard","server":{"host":"api.cloud.internal","port":8443,"ssl":true},"features":["webhooks","analytics","audit-logs","biometrics"],"rateLimits":{"requestsPerMinute":1200,"burst":50}}`,
  },
  {
    id: 'auto-repair',
    name: 'Truncated & Broken JSON (Auto-Repair)',
    description: 'Demonstrates auto-repairing truncated payloads, unclosed quotes, brackets, and dangling commas with exact breakpoint badge.',
    ignoredFields: [],
    ignoreListOrder: true,
    leftText: `{
  "status": "healthy",
  "timestamp": 1729580000,
  "cluster": {
    "region": "us-east-1",
    "nodes": [
      { "id": "node-1", "ready": true },
      { "id": "node-2", "ready": true }
    ]
  }
}`,
    rightText: `{
  "status": "healthy",
  "timestamp": 1729580000,
  "cluster": {
    "region": "us-east-1",
    "nodes": [
      { "id": "node-1", "ready": true },
      { "id": "node-2", "ready": false, "reason": "disk-pressure
`,
  },
  {
    id: 'yaml-tab-linter',
    name: 'YAML Tab Linter & Fixer',
    description: 'Flags illegal tab indentation in YAML with bright red markers, with one-click conversion to 2 spaces.',
    ignoredFields: [],
    ignoreListOrder: true,
    leftText: `database:
  engine: postgresql
  version: 16
  pool:
    min: 5
    max: 25
`,
    rightText: `database:
\tengine: postgresql
\tversion: 16
\tpool:
\t\tmin: 10
\t\tmax: 50
`,
  },
  {
    id: 'toml-config',
    name: 'TOML (Helmsman & Service Config)',
    description: 'Compares TOML files with # comments, inline annotations, and [section] tables side-by-side.',
    ignoredFields: [],
    ignoreListOrder: false,
    leftText: `# version: v3.0.0
# context defines the context of this Desired State File.
# Therefore, it is important that each DSF uses a unique context.
context = "test-infra"   # defaults to "default" if not provided

# metadata -- add as many key/value pairs as you want
[metadata]
  org = "example.com/infra"
  maintainer = "k8s-admin@example.com"
  kind = "DSF"

# certificates for connecting to the cluster
[certificates]
  # caClient = "gs://mybucket/client.crt"
  # caCrt = "s3://mybucket/ca.crt"

[settings]
  kubeContext = "minikube"
  storageBackend = "secret"
`,
    rightText: `# version: v3.1.0
# context defines the context of this Desired State File.
# Therefore, it is important that each DSF uses a unique context.
context = "prod-infra"   # defaults to "default" if not provided

# metadata -- add as many key/value pairs as you want
[metadata]
  org = "example.com/infra"
  maintainer = "sre-team@example.com"
  kind = "DSF"

# certificates for connecting to the cluster
[certificates]
  # caClient = "gs://mybucket/client.crt"
  # caCrt = "s3://mybucket/ca.crt"

[settings]
  kubeContext = "gke-production-us"
  storageBackend = "secret"
`,
  },
];
