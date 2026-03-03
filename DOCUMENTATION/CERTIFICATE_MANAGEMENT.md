# Certificate Management and Automatic Renewal (REQ24)

This document outlines the infrastructure and automated processes used by the **Dynamic Recipe Platform** to manage SSL/TLS certificates, ensuring secure (HTTPS) communication and fulfilling GDPR data-in-transit security requirements.

## 1. Infrastructure Overview

The project relies on a Kubernetes-native approach to handle certificates automatically. The stack consists of:
* **Cert-Manager:** A Kubernetes add-on that automates the management and issuance of TLS certificates.
* **Let's Encrypt:** The external Certificate Authority (CA) that provides free, automated, and open certificates.
* **Traefik:** The Ingress Controller used to route external HTTP/HTTPS traffic into our Kubernetes cluster.

## 2. Certificate Provisioning Process

Certificates are provisioned dynamically without manual intervention using a `ClusterIssuer`. 

1. **Configuration:** We deploy a `ClusterIssuer` resource (`cluster-issuer.yaml`) configured to use the Let's Encrypt Production ACME server.
2. **ACME Challenge:** The system uses the **HTTP-01 challenge** mechanism. When a new Ingress resource is created requiring a TLS certificate for our domain (e.g., `ltu-m7011e-5.se`), `cert-manager` automatically communicates with Let's Encrypt.
3. **Validation:** `cert-manager` creates a temporary pod and ingress route to solve the HTTP-01 challenge. Once Let's Encrypt verifies domain ownership, the certificate is issued.
4. **Storage:** The issued certificate and its corresponding private key are securely stored as a Kubernetes `Secret`, which Traefik then mounts to terminate SSL traffic.

## 3. Automatic Renewal Process

Let's Encrypt certificates have a strict lifespan of **90 days**. To prevent outages, the renewal process is 100% automated by `cert-manager`:

* **Monitoring:** `cert-manager` continuously monitors the expiration dates of all issued certificates stored in Kubernetes Secrets.
* **Renewal Trigger:** By default, `cert-manager` automatically initiates the renewal process **30 days before** the certificate expires.
* **Zero-Downtime Execution:** It performs the HTTP-01 challenge again in the background. Upon success, it silently updates the Kubernetes `Secret` with the new certificate and private key.
* **Propagation:** Traefik detects the updated `Secret` dynamically and starts using the new certificate for incoming connections without requiring a pod restart or causing any service downtime.

This fully automated lifecycle ensures that the platform remains secure and compliant without requiring manual cronjobs or operational overhead from the development team.