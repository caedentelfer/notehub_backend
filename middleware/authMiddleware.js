// backend/middleware/authMiddleware.js

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Middleware to authenticate JWT tokens.
 * Extracts the token from the Authorization header and verifies it.
 * If valid, the decoded user information is attached to the request object.
 * If invalid or missing, it responds with an appropriate error.
 *    
 **/
const authenticateToken = (req, res, next) => {
  // Retrieve the Authorization header
  const authHeader = req.headers["authorization"];
  console.log("Authorization Header:", authHeader); // Debugging log

  // Token is expected to be in the format "Bearer TOKEN"
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    console.warn("No token provided in the request.");
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  // Verify the token
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("Token verification failed:", err.message);
      return res.status(403).json({ error: "Invalid or expired token." });
    }

    console.log("Authenticated User:", decoded); // Debugging log

    // Attach decoded user information to the request object
    req.user = decoded;
    next();
  });
};

export default authenticateToken;
