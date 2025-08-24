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
} = require("../controllers/employeeController");
const authMiddleware = require("../middleware/auth");

router.post("/register", authMiddleware([]), registerEmployee); // Optional: restrict to admins with authMiddleware(["admin"])
router.post("/login", loginEmployee);
router.get("/", authMiddleware(["admin"]), getEmployees);
router.get(
  "/:id",
  authMiddleware(["employee", "stagiaire", "admin"]),
  getEmployeeById
);
router.put("/:id", authMiddleware(["admin"]), updateEmployee);
router.delete("/:id", authMiddleware(["admin"]), deleteEmployee);
router.put("/face-template/:id", authMiddleware(["admin"]), updateFaceTemplate);
router.put("/qr-code/:id", authMiddleware(["admin"]), updateQrCode);

// In routes/employees.js
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ success: true, message: "Logged out successfully" });
});

module.exports = router;
