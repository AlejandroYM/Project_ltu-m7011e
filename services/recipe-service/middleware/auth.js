// services/recipe-service/middleware/auth.js
// Middleware de autenticación JWT usando JWKS
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Configuración de Keycloak desde variables de entorno
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://keycloak.ltu-m7011e-5.se';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'ChefMatchRealm';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'account';

// Cliente JWKS para obtener las claves públicas de Keycloak
const client = jwksClient({
  jwksUri: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
  cache: true,
  cacheMaxAge: 600000, // 10 minutos
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

// Función para obtener la clave de firma
function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) {
      return callback(err);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

// Middleware de autenticación
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'No token provided',
      message: 'Authorization header with Bearer token is required' 
    });
  }

  const token = authHeader.substring(7); // Remover 'Bearer '

  jwt.verify(token, getKey, {
    audience: KEYCLOAK_CLIENT_ID,
    issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      console.error('JWT verification error:', err.message);
      return res.status(403).json({ 
        error: 'Invalid token',
        message: err.message 
      });
    }

    // Agregar información del usuario decodificada a la request
    req.user = {
      sub: decoded.sub,
      email: decoded.email,
      preferred_username: decoded.preferred_username,
      realm_access: decoded.realm_access
    };

    next();
  });
};

// Middleware opcional - solo verifica si hay token pero no falla si no hay
const optionalAuthJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No hay token, continuar sin autenticación
    req.user = null;
    return next();
  }

  const token = authHeader.substring(7);

  jwt.verify(token, getKey, {
    audience: KEYCLOAK_CLIENT_ID,
    issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      // Token inválido, continuar sin autenticación
      req.user = null;
    } else {
      req.user = {
        sub: decoded.sub,
        email: decoded.email,
        preferred_username: decoded.preferred_username,
        realm_access: decoded.realm_access
      };
    }
    next();
  });
};

module.exports = { authenticateJWT, optionalAuthJWT };
