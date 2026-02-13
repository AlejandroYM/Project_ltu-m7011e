const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
  jwksUri: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/certs`,
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
    audience: process.env.KEYCLOAK_CLIENT_ID,
    issuer: `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`,
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
