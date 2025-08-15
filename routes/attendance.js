const express = require("express");
const router = express.Router();
const {
  recordAttendance,
  getAttendance,
  generateQrCode,
  scanQrCode,
  facialAttendance,
  recordExit,
  getPresenceReport,
  getAllPresenceReports,
} = require("../controllers/attendanceController");
const authMiddleware = require("../middleware/auth");

router.post(
  "/",
  authMiddleware(["employee", "stagiaire", "admin"]),
  recordAttendance
);
router.get(
  "/employee/:employeeId",
  authMiddleware(["employee", "stagiaire", "admin"]),
  getAttendance
);
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
router.post(
  "/exit",
  authMiddleware(["employee", "stagiaire", "admin"]),
  recordExit
);
router.get("/report/:employeeId", authMiddleware(["admin"]), getPresenceReport);
router.get("/reports", authMiddleware(["admin"]), getAllPresenceReports);

module.exports = router;
