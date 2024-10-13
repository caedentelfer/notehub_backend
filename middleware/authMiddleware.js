const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

/**
 * Middleware to authenticate JWT tokens.
 * Extracts the token from the Authorization header and verifies it.
 * If valid, the decoded user information is attached to the request object.
 * If invalid or missing, it responds with an appropriate error.
 * 
 * @param {Object} req - Express request object, expected to contain the Authorization header with a JWT token.
 * @param {Object} res - Express response object used to send back HTTP responses.
 * @param {Function} next - Callback function to pass control to the next middleware or route handler.
 * @returns {void}
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }

        req.user = decoded;
        next();
    });
};

module.exports = authenticateToken;