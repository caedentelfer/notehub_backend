import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Middleware to authenticate JWT tokens.
 * Extracts the token from the Authorization header and verifies it.
 * If valid, the decoded user information is attached to the request object.
 * If invalid or missing, it responds with an appropriate error.
 * @param {Request} req - The request object
 * @param {Response} res - The response object
 * @param {NextFunction} next - The next middleware function  
 **/
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  console.log("Authorization Header:", authHeader);

  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    console.warn("No token provided in the request.");
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("Token verification failed:", err.message);
      return res.status(403).json({ error: "Invalid or expired token." });
    }
    console.log("Authenticated User:", decoded);
    req.user = decoded;
    next();
  });
};

export default authenticateToken;
