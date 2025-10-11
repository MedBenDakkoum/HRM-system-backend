const express = require("express");
const router = express.Router();
const {
  registerEmployee,
  loginEmployee,
  registerFace,
  updateFaceTemplate,
  updateQrCode,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getCurrentUser,
  requestFaceUpdate,
} = require("../controllers/employeeController");
const {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
} = require("../controllers/notificationController");
const authMiddleware = require("../middleware/auth");

// Employee routes
router.post("/register", authMiddleware(["admin"]), registerEmployee);
router.post("/register-admin", registerEmployee); // Allow initial admin registration without auth
router.post("/login", loginEmployee);
router.post(
  "/register-face",
  authMiddleware(["employee", "stagiaire"]),
  registerFace
); // New endpoint
router.post(
  "/request-face-update",
  authMiddleware(["employee", "stagiaire"]),
  requestFaceUpdate
);
router.patch(
  "/face-template/:id",
  authMiddleware(["employee", "stagiaire", "admin"]),
  updateFaceTemplate
);
router.patch(
  "/:id/qr-code",
  authMiddleware(["employee", "stagiaire", "admin"]),
  updateQrCode
);
router.get("/", authMiddleware(["admin"]), getEmployees);

// Place /me before /:id to ensure it matches first
router.get("/me", authMiddleware(), getCurrentUser);

router.get(
  "/:id",
  authMiddleware(["employee", "stagiaire", "admin"]),
  getEmployeeById
);
router.patch("/:id", authMiddleware(["admin"]), updateEmployee);
router.delete("/:id", authMiddleware(["admin"]), deleteEmployee);

// Notification routes
router.get("/:userId/notifications", authMiddleware(), getUserNotifications);
router.patch(
  "/notifications/:notificationId/read",
  authMiddleware(),
  markAsRead
);
router.patch(
  "/:userId/notifications/read-all",
  authMiddleware(),
  markAllAsRead
);

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  res.status(200).json({ success: true, message: "Logged out successfully" });
});

module.exports = router;
