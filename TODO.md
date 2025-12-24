# 🚀 Project Roadmap & TODO

Help us make Fortress the best self-hosted backup orchestrator! Here is what's currently on our radar:

## 🏗️ Frontend Architecture & Refactoring
- [ ] **Component Modularization**: Refactor all frontend files to be under 250 lines of code.
- [ ] **Folder-based Organization**: Split components into specialized folders:
  - `/components/ui`: Atomic, reusable UI elements.
  - `/components/features`: Complex domain-specific components (e.g., Jobs, Systems).
  - `/components/layout`: Page structure and navigation.
- [ ] **Naming Rules**: Enforce clear directory-based grouping to improve maintainability for contributors.

## 🤖 AI & Tooling
- [ ] **AI Integration Verification**: Thoroughly test Gemini and OpenAI-compatible provider logic for generating backup schedules.
- [ ] **Engine Expansion**:
  - [ ] Verify and stable-test **Rclone** integration.
  - [ ] Verify and stable-test **Rsync** over SSH.
  - [ ] **Cloud Storage Integration**: Test S3-compatible storage and Google Drive connectivity.

## 🎨 Design & Experience
- [ ] **New Landing Page**: Create a high-converting, premium landing page that explains the project's value proposition.
- [ ] **UI Refresh**: Modernize the dashboard with enhanced Glassmorphism and micro-animations.
- [ ] **Dark Mode Optimization**: Ensure accessibility and visual excellence across all themes.

---

## 🐳 Container Support & Auto Backups (NEW)
- [ ] **Support running Fortress as a container**  
  - Provide a production-ready Dockerfile and container image build.  
  - Provide a docker-compose example for local/staging usage.  
  - Support configuration via environment variables (no secrets in images).  
  - Add container healthcheck, non-root runtime where possible, and small base image option.
- [ ] **Auto backup for containers (container-aware backups)**  
  - Detect running containers (Docker/Podman) and discover volumes to snapshot/backup.  
  - Provide per-container backup policies (schedule, exclude paths, retention).  
  - Support backing up named volumes, bind mounts, and container filesystem snapshots where feasible.  
  - Integrate with existing backup engines (Rclone/Rsync/S3) to stream container backups to remote storage.  
  - Provide opt-in container backup hooks (pre-freeze/post-thaw) for stateful services (e.g., database quiesce).
- [ ] **Container backup discovery & policy UI**  
  - UI to list detected containers, volumes, and to create container-specific backup jobs and schedules.
- [ ] **Security & Secrets**  
  - Ensure secrets (credentials, API keys) are read from environment or external secret stores (Vault/KMS) and not baked into the image.

## ☸️ Kubernetes Support & Cluster Backups (NEW)
- [ ] **Cluster-deployed mode (Fortress runs inside K8s)**  
  - Provide Kubernetes manifests and/or Helm chart to deploy Fortress as a Deployment/StatefulSet with a Service, ConfigMap, Secret, and RBAC.  
  - Support helm chart values for storage backends, ingress, resources, and nodeSelectors/tolerations.
- [ ] **Integration with cluster backup tools**  
  - Provide recipes/integration for Velero (recommended) and guidance for cluster-level backup and restore workflows.  
  - Provide example velero install and schedule commands in docs.
- [ ] **CSI Snapshot & PersistentVolume backups**  
  - Support CSI snapshot creation (via k8s CSI snapshot API) and use snapshots to back up PVC contents to configured storage backends.  
  - Provide fallback flow for clusters without CSI snapshot support (e.g., copy via sidecar or volume-mount copy).
- [ ] **Namespace / Pod / PVC discovery & policy**  
  - Discover namespaces, pods, StatefulSets, Deployments and their associated PVCs; provide UI/CLI to create per-namespace or per-workload backup policies.  
  - Support exclude/include patterns, retention, and label-based selection.
- [ ] **Application-aware quiesce hooks**  
  - Provide pre/post backup hooks for stateful services (e.g., run pg_dump or call MySQL FLUSH TABLES WITH READ LOCK) or leverage Kubernetes PodDisruptionBudget / application hooks.
- [ ] **Cluster resource export**  
  - Export cluster resource manifests (Deployments, Services, ConfigMaps, Secrets*), optionally with secrets redacted/encrypted.  
  - Support restoring resources into same or different cluster (namespace mapping).
- [ ] **Operator mode (optional)**  
  - Provide architecture/design to run a Fortress Operator (CRDs) to manage scheduled backups as Kubernetes-native resources (e.g., BackupPolicy CRD).
- [ ] **Security & RBAC**  
  - Provide least-privilege RBAC roles for discovery, snapshot creation, reading PVCs, and restore operations. Document required permissions.
- [ ] **Disaster recovery & cross-cluster restore**  
  - Support restoring workloads and PV data to different clusters/regions and provide guidance for restoring DNS/Ingress and external IPs.
- [ ] **Testing & CI for K8s**  
  - Add integration tests using KinD/Minikube or CI runners to validate discovery, snapshot, and restore flows.
- [ ] **Documentation**  
  - docs/k8s-deploy.md with install options: Helm, manifest, operator, Velero integration, and recommended production patterns.

---

Want to contribute? Check out our [ARCH_README.md](./ARCH_README.md) to understand how the system works!