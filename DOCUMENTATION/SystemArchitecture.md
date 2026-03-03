# System Architecture

## Overview
This document outlines the architecture for the **Dynamic Recipe Platform**. The system is designed using a microservices architecture with a Node.js backend and a React.js frontend, utilizing MongoDB for flexible and scalable data storage. 

The core of the system is highly dynamic: content adapts in real-time to user interactions, and personalized suggestions change based on users’ dietary preferences, ratings, and interaction history.

---

## C4 Model: Level 1 - System Context Diagram
The System Context diagram illustrates the big picture. It shows the primary users of the system and how they interact with the Dynamic Recipe Platform as a whole.

```mermaid
C4Context
    title System Context Diagram (Level 1) - Dynamic Recipe Platform

    Person(user, "User", "University students, amateur cooks, and food enthusiasts.")
    System(recipe_platform, "Dynamic Recipe Platform", "Allows users to discover, upload, rate, and receive personalized recipe recommendations.")

    Rel(user, recipe_platform, "Uses platform to manage and discover recipes", "HTTPS")

C4Container
    title Container Diagram (Level 2) - Microservices Architecture

    Person(user, "User", "University students, amateur cooks, and food enthusiasts.")

    System_Boundary(c1, "Dynamic Recipe Platform") {
        Container(frontend, "Frontend Application", "React.js", "Provides the interactive and dynamic user interface. Adapts in real-time.")
        
        Container(user_service, "User Service", "Node.js, Express", "Handles user registration, login, authentication, and profile management (preferences, saved recipes).")
        Container(recipe_service, "Recipe Service", "Node.js, Express", "Manages all recipe-related actions: creating, editing, deleting, viewing, and rating.")
        Container(recommendation_service, "Recommendation Service", "Node.js, Express", "Listens for recipe updates and interactions to generate personalized suggestions.")
        
        ContainerDb(database, "Unified Database", "MongoDB", "Document-based database storing users, recipes, tags, and interaction history.")
    }

    Rel(user, frontend, "Visits and interacts with", "HTTPS")
    
    Rel(frontend, user_service, "API Requests (Auth/Profile)", "JSON/HTTPS")
    Rel(frontend, recipe_service, "API Requests (Recipes/Ratings)", "JSON/HTTPS")
    Rel(frontend, recommendation_service, "API Requests (Recommendations)", "JSON/HTTPS")

    Rel(user_service, database, "Reads and writes user data", "Mongoose/TCP")
    Rel(recipe_service, database, "Reads and writes recipe data", "Mongoose/TCP")
    Rel(recommendation_service, database, "Reads data for analysis", "Mongoose/TCP")
    
    Rel(recipe_service, recommendation_service, "Triggers updates on new ratings/recipes", "Events/HTTP")