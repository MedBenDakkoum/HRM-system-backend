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
// Changed from "/:id/face-template" to "/face-template/:id" to match your Postman request
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

router.post("/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  res.status(200).json({ success: true, message: "Logged out successfully" });
});

module.exports = router;
