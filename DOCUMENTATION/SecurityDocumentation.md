# Security Documentation

This document outlines the security measures implemented in the **Dynamic Recipe Platform** to fulfill the system's security and authorization requirements.

## 1. Role-Based Authorization Mechanisms (REQ21)

The system implements Role-Based Access Control (RBAC) to restrict access to sensitive data and operations. Authentication and authorization are delegated to **Keycloak**, ensuring an enterprise-grade security standard.

### 1.1 Keycloak Integration & JWKS
* The backend services do not manage passwords directly. Instead, they validate JSON Web Tokens (JWT) issued by our Keycloak instance (`https://keycloak.ltu-m7011e-5.se`).
* We use the `jwks-rsa` library to dynamically fetch the public keys from Keycloak's JWKS endpoint to verify the RS256 signature of the tokens, ensuring they haven't been tampered with.

### 1.2 Authorization Implementation (`auth.js`)
* All protected endpoints (e.g., `POST /recipes`, `DELETE /meal-plans/:id`) are secured using the `authenticateJWT` middleware.
* This middleware extracts the Bearer token, verifies its signature and issuer (`ChefMatchRealm`), and decodes the payload.
* User roles and permissions are extracted from the `realm_access` claim within the decoded JWT, which allows the system to enforce strict access control based on the roles assigned in the Keycloak admin console.

---

## 2. Protection Against Injection and XSS Attacks (REQ22)

### 2.1 NoSQL Injection Protection
*Note: As our system architecture utilizes MongoDB (a NoSQL database), traditional SQL Injection is not applicable. Instead, we protect against NoSQL Injection.*

* **Mongoose ODM:** We use Mongoose to interact with MongoDB. Mongoose enforces strict schemas and automatically casts data types, preventing attackers from injecting query operators (like `$gt` or `$ne`) through request bodies or query parameters.
* **Sanitization Middleware:** To add an extra layer of security, the Node.js backend uses the `express-mongo-sanitize` library. This middleware intercepts all incoming requests (`req.body`, `req.query`, `req.params`) and removes any keys containing prohibited characters (like `$` or `.`), effectively neutralizing NoSQL operator injection attempts.

### 2.2 Cross-Site Scripting (XSS) Protection
XSS attacks occur when malicious scripts are injected into trusted websites. Since our platform relies heavily on user-generated content (recipes, comments), we implement protection on both the frontend and backend:

* **Frontend (React.js):** React inherently protects against XSS by automatically escaping variables embedded in JSX before rendering them to the DOM. This prevents malicious string inputs from being executed as executable code.
* **Backend (Node.js/Express):** * We utilize the `helmet` middleware to set secure HTTP headers, including the Content-Security-Policy (CSP), which restricts the sources from which scripts can be loaded.
    * All user inputs (especially recipe descriptions, instructions, and comments) are validated and sanitized using `express-validator` and `xss-clean` middleware before being stored in the database. This ensures that even if an attacker attempts to send an `<script>` tag via a direct API call, it will be stripped out.