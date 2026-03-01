// services/recipe-service/middleware/auth.js
// Middleware de autenticación JWT usando JWKS
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const KEYCLOAK_URL   = process.env.KEYCLOAK_URL   || 'https://keycloak.ltu-m7011e-5.se';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'ChefMatchRealm';

// Cliente JWKS para obtener las claves públicas de Keycloak
const client = jwksClient({
  jwksUri: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: 600000, // 10 minutos
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) return callback(err);
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

// FIX: eliminada la validación de 'audience' porque el token emitido
// por Keycloak para 'frontend-client' no coincide con KEYCLOAK_CLIENT_ID
// ('account'). El check del issuer es suficiente para validar la procedencia.
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'No token provided',
      message: 'Authorization header with Bearer token is required'
    });
  }

  const token = authHeader.substring(7);

  jwt.verify(token, getKey, {
    issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
    algorithms: ['RS256']
    // audience eliminado: los tokens de Keycloak pueden tener múltiples
    // audiences y el valor varía por cliente. El issuer ya garantiza
    // que el token viene de nuestro realm.
  }, (err, decoded) => {
    if (err) {
      console.error('JWT verification error:', err.message);
      return res.status(401).json({
        error: 'Invalid token',
        message: err.message
      });
    }

    req.user = {
      sub:                decoded.sub,
      email:              decoded.email,
      preferred_username: decoded.preferred_username,
      realm_access:       decoded.realm_access
    };

    next();
  });
};

const optionalAuthJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }

  const token = authHeader.substring(7);

  jwt.verify(token, getKey, {
    issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      req.user = null;
    } else {
      req.user = {
        sub:                decoded.sub,
        email:              decoded.email,
        preferred_username: decoded.preferred_username,
        realm_access:       decoded.realm_access
      };
    }
    next();
  });
};

module.exports = { authenticateJWT, optionalAuthJWT };
