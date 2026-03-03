const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const KEYCLOAK_URL   = process.env.KEYCLOAK_URL   || 'https://keycloak.ltu-m7011e-5.se';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'ChefMatchRealm';

const client = jwksClient({
  jwksUri: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) return res.status(401).json({ error: 'No authorization header' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, getKey, {
    issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
    algorithms: ['RS256']
    // removed audience: the token from frontend-client 
    // does not match KEYCLOAK_CLIENT_ID and 
    // caused 401 on all protected endpoints
  }, (err, decoded) => {
    if (err) {
      console.error('JWT verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid token' });
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

module.exports = { authenticateJWT };
