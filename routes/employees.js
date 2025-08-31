const express = require("express");
const router = express.Router();
const {
  registerEmployee,
  loginEmployee,
  updateFaceTemplate,
  updateQrCode,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getCurrentUser,
} = require("../controllers/employeeController");
const authMiddleware = require("../middleware/auth");

// Employee routes
router.post("/register", authMiddleware(["admin"]), registerEmployee);
router.post("/login", loginEmployee);
router.patch(
  "/:id/face-template",
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

module.exports = router;
