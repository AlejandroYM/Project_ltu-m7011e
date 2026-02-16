const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// Configuración de Keycloak desde variables de entorno
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'https://keycloak.ltu-m7011e-5.se';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'ChefMatchRealm';
const KEYCLOAK_CLIENT_ID = process.env.KEYCLOAK_CLIENT_ID || 'account';

const client = jwksClient({
  jwksUri: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }

  const token = authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, getKey, {
    audience: KEYCLOAK_CLIENT_ID,
    issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      console.error('JWT verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = {
      sub: decoded.sub,
      email: decoded.email,
      preferred_username: decoded.preferred_username,
      realm_access: decoded.realm_access
    };

    next();
  });
};

module.exports = { authenticateJWT };
