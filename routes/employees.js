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

router.post("/register", registerEmployee);
router.post("/login", loginEmployee);
router.put("/face-template/:id", authMiddleware(["admin"]), updateFaceTemplate);
router.put("/qr-code/:id", authMiddleware(["admin"]), updateQrCode);
router.get("/", getEmployees);
router.get("/:id", getEmployeeById);
router.put("/:id", updateEmployee);
router.delete("/:id", deleteEmployee);

module.exports = router;
