const express = require("express");
const router = express.Router();
const {
  recordAttendance,
  getAttendance,
  generateQrCode,
  scanQrCode,
  facialAttendance,
} = require("../controllers/attendanceController");
const authMiddleware = require("../middleware/auth");

router.post("/", recordAttendance);
router.get("/employee/:employeeId", getAttendance);
router.get("/qr/:employeeId", authMiddleware(["admin"]), generateQrCode);
router.post(
  "/scan-qr",
  authMiddleware(["employee", "stagiaire", "admin"]),
  scanQrCode
);
router.post(
  "/facial",
  authMiddleware(["employee", "stagiaire", "admin"]),
  facialAttendance
);

module.exports = router;
