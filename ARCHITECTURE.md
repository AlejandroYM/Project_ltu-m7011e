# System Architecture - ChefMatch (REQ17)

Este documento describe la arquitectura de microservicios distribuida del proyecto ChefMatch.

## 1. Estructura del Repositorio
Siguiendo un diseño modular, el proyecto se organiza de la siguiente manera:
- **/services**: Contiene los microservicios core (user-service, recipe-service, recommendation-service).
- **/frontend**: Interfaz de usuario interactiva.
- **/k8s**: Manifiestos de orquestación para el despliegue en la nube.

## 2. Diagrama de Contenedores (C4 Model - Level 2)

```mermaid
graph TD
    User((Usuario)) -->|HTTPS| Ingress[Traefik Ingress]
    
    subgraph "Nube - Kubernetes Cluster"
        Ingress --> FE[Frontend Container]
        
        subgraph "Carpeta /services (REQ11)"
            US[User Service]
            RS[Recommendation Service]
            RECS[Recipe Service]
        end

        subgraph "Infraestructura & Comunicación (REQ15)"
            RMQ[(RabbitMQ Message Broker)]
            KC[Keycloak Auth Server]
        end
    end

    US -->|Publica eventos| RMQ
    RMQ -->|Notifica cambios| RS
    US -->|Valida JWT| KC