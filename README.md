# 👨‍🍳 Chef Match - Microservices Recipe Platform

**Group 5** | Paula Cortina & Alejandro Yécora

Chef Match is a cloud-native platform for recipe management and personalized suggestions, built with a scalable and secure microservices architecture.

---

## 🚀 System Architecture (REQ11)

The system is composed of independent, decoupled services that communicate synchronously (REST) and asynchronously (Events):

* **User Service (Node.js)**: Manages user profiles and preferences. Acts as an event producer.
* **Recipe Service (Node.js)**: A central repository for creating and viewing recipes.
* **Recommendation Service (Node.js)**: A suggestion engine driven by real-time events from RabbitMQ.
* **Frontend (React + Vite)**: A dynamic and responsive user interface.
* **Infrastructure**: RabbitMQ (Message Broker) and Keycloak (Identity Provider).

---

## ✅ Requirements Fulfillment (Grade 5)

### 🏗️ Development & Quality (REQ1 - REQ9)
* **REQ2 Dynamic Behavior**: Recommendations update in real-time when a user changes their dietary preferences, powered by the event-driven architecture.
* **REQ3 Frontend**: A modern UI developed in React, consuming backend data via RESTful APIs.
* **REQ5 Test Coverage**: Implemented **Jest** with a total coverage exceeding the **50%** requirement (currently ~62%).
* **REQ6 CI/CD**: A robust **GitHub Actions** pipeline automates testing and container building, integrated with **ArgoCD** for GitOps deployment.

### 🐳 Containerization & Cloud (REQ10 - REQ13)
* **REQ10 Docker**: Each microservice has its own optimized `Dockerfile` for independent environment management.
* **REQ12 Kubernetes & Helm**: Orchestrated deployment using **Helm Charts**, ensuring infrastructure as code (IaC).

### 📡 Communication & API (REQ14 - REQ17)
* **REQ14 API Design**: Services expose RESTful endpoints following standard design practices.
* **REQ15 Asynchronous Communication**: Implementation of **RabbitMQ** to decouple the User Service from the Recommendation Service.

### 🔒 Security (REQ20 - REQ25)
* **REQ20 Authentication**: Integrated with **Keycloak** to ensure only authenticated users can modify recipes or profile data.
* **REQ23/24 HTTPS & Certificates**: Configured **Ingress** with **Cert-Manager** for automatic SSL/TLS certificate provisioning via Let's Encrypt.

---

## 🛠️ Installation and Deployment

### Local Environment (Docker Compose)
1. Clone the repository.
2. Run `docker-compose up -d`.
3. Access the frontend at `http://localhost:5173`.

### Cloud Deployment (Kubernetes with ArgoCD)
The project deploys automatically upon pushing to the `main` branch:
1. GitHub Actions builds and pushes the Docker images.
2. **ArgoCD** detects changes in the `/k8s` folder and synchronizes the cluster.
3. The application is reachable via the domain `https://ltu-m7011e-5.se`.

---

## 🧪 Running Tests
To verify the **REQ5** coverage report, run the following in any service directory:
```bash
npm install
npm test -- --coverage