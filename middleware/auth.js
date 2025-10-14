const jwt = require("jsonwebtoken");
const winston = require("winston");

// Configure Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

// Add console logging in development
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

const authMiddleware = (roles = []) => {
  return async (req, res, next) => {
    try {
      // Check for token in cookie first, then Authorization header (mobile fallback)
      let token = req.cookies.token;

      if (!token) {
        // Check Authorization header for mobile fallback
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
          token = authHeader.substring(7);
        }
      }

      logger.info("Received token:", {
        token: token ? "present" : "absent",
        source: req.cookies.token
          ? "cookie"
          : req.headers.authorization
          ? "header"
          : "none",
      });

      if (!token) {
        logger.warn("No token provided", {
          url: req.originalUrl,
          method: req.method,
        });
        return res.status(401).json({
          success: false,
          message: "No token provided",
        });
      }

      // Verify JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded.id || !decoded.role) {
        logger.warn("Invalid token payload", {
          url: req.originalUrl,
          method: req.method,
          tokenPayload: decoded,
        });
        return res.status(401).json({
          success: false,
          message: "Invalid token payload",
        });
      }
      req.user = decoded;

      // ✅ Bypass role check for /me endpoint
      if (req.originalUrl.endsWith("/me") && req.method === "GET") {
        logger.info("Authentication successful for /me", {
          url: req.originalUrl,
          method: req.method,
          userId: decoded.id,
          role: decoded.role,
        });
        return next();
      }

      // Check role permissions for other endpoints
      if (roles.length && !roles.includes(decoded.role)) {
        logger.warn("Access denied: Insufficient role permissions", {
          url: req.originalUrl,
          method: req.method,
          userId: decoded.id,
          role: decoded.role,
          requiredRoles: roles,
        });
        return res.status(403).json({
          success: false,
          message: `Access denied: Requires one of [${roles.join(", ")}] roles`,
        });
      }

      logger.info("Authentication successful", {
        url: req.originalUrl,
        method: req.method,
        userId: decoded.id,
        role: decoded.role,
      });
      next();
    } catch (error) {
      logger.error("Authentication error", {
        url: req.originalUrl,
        method: req.method,
        error: error.message,
        errorName: error.name,
      });
      return res.status(401).json({
        success: false,
        message:
          error.name === "TokenExpiredError"
            ? "Token expired"
            : error.name === "JsonWebTokenError"
            ? "Invalid token"
            : "Authentication failed",
      });
    }
  };
};

module.exports = authMiddleware;
