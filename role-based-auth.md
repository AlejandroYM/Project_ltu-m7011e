# Role-Based Authorization in ChefMatch

## Overview

ChefMatch uses **Keycloak** as the identity provider and **JWKS-based JWT verification** in all three services. This means role-based authorization (RBAC) can be added without any new infrastructure — the roles are already embedded in the JWT that every authenticated request carries.

---

## How Roles Work in Keycloak

When a user logs in, Keycloak issues a JWT that contains a `realm_access` claim with the user's roles:

```json
{
  "sub": "447553b2-e25d-47c9-8209-4c56d5883b2a",
  "preferred_username": "testuser",
  "realm_access": {
    "roles": ["user", "offline_access", "default-roles-chefmatchrealm"]
  }
}
```

The `authenticateJWT` middleware in all three services already decodes this token and attaches `realm_access` to `req.user`:

```js
// services/*/middleware/auth.js — already implemented
req.user = {
  sub:              decoded.sub,
  email:            decoded.email,
  preferred_username: decoded.preferred_username,
  realm_access:     decoded.realm_access   // ← roles are here
};
```

No changes to the auth middleware are needed.

---

## Proposed Roles for ChefMatch

| Role | Description | Who has it |
|------|-------------|------------|
| `user` | Standard authenticated user. Can read recipes, get recommendations, manage their own profile and meal plans. | All registered users |
| `chef` | Trusted content creator. Can create and delete any recipe (not just their own). | Users promoted by admin |
| `admin` | Full access. Can delete any recipe, any user account, and access internal metrics. | System administrators |

---

## Implementation: `requireRole` Middleware

A single reusable middleware function would be added to each service:

```js
// services/*/middleware/auth.js

const requireRole = (...roles) => (req, res, next) => {
  const userRoles = req.user?.realm_access?.roles || [];
  const hasRole = roles.some(role => userRoles.includes(role));

  if (!hasRole) {
    return res.status(403).json({
      error: 'Forbidden',
      message: `Required role: ${roles.join(' or ')}`
    });
  }
  next();
};

module.exports = { authenticateJWT, requireRole };
```

---

## How It Would Be Applied Per Endpoint

### recipe-service

```js
const { authenticateJWT, requireRole } = require('./middleware/auth');

// Anyone can read recipes
app.get('/recipes', optionalAuthJWT, ...);

// Only authenticated users can rate recipes
app.post('/recipes/:id/rate', authenticateJWT, ...);

// Only chefs or admins can create recipes
app.post('/recipes', authenticateJWT, requireRole('chef', 'admin'), ...);

// Only admins can delete any recipe (owners handled separately in the handler)
app.delete('/recipes/:id', authenticateJWT, requireRole('chef', 'admin'), ...);
```

### user-service

```js
// Users can only access their own profile (enforced in handler via req.user.sub === id)
app.get('/users/:id', authenticateJWT, ...);

// Only admins can list all users
app.get('/users', authenticateJWT, requireRole('admin'), ...);
```

### recommendation-service

```js
// Users can only access their own recommendations (enforced in handler)
app.get('/recommendations/:userId', authenticateJWT, ...);
```

---

## Assigning Roles in Keycloak

Roles are managed entirely in the Keycloak Admin Console — no code changes needed to add or remove a role from a user:

1. Go to `https://keycloak.ltu-m7011e-5.se` → Admin Console
2. Select realm **ChefMatchRealm**
3. Go to **Realm Roles** → create roles: `user`, `chef`, `admin`
4. Go to **Users** → select a user → **Role Mappings** → assign roles

From that point on, every new token issued for that user will automatically include their updated roles in the `realm_access` claim, and `requireRole()` will enforce them with no further changes.

---

## Summary

| Component | Change needed |
|-----------|--------------|
| Keycloak | Create `user`, `chef`, `admin` realm roles and assign them to users |
| `auth.js` (all services) | Add `requireRole(...roles)` middleware function |
| Route definitions | Add `requireRole(...)` after `authenticateJWT` on protected endpoints |
| JWT / token format | No change — roles are already included in the token |
| Database | No change — roles live entirely in Keycloak |

The key advantage of this approach is that **authorization logic stays in the application layer** (a simple array check) while **role management stays in Keycloak** — no database queries, no extra tables, and no need to re-deploy services when a user's role changes.
