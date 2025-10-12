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
  getDailyStats,
  getTotalAttendanceCount,
  validateExitAttendance,
} = require("../controllers/attendanceController");
const authMiddleware = require("../middleware/auth");
const Notification = require("../models/Notification");

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
router.get(
  "/qr/:employeeId",
  authMiddleware(["employee", "stagiaire", "admin"]),
  generateQrCode
);
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
  validateExitAttendance,
  recordExit
);
router.get("/report/:employeeId", authMiddleware(["admin"]), getPresenceReport);
router.get("/reports", authMiddleware(["admin"]), getAllPresenceReports);
router.get("/daily-stats", authMiddleware(["admin"]), getDailyStats);
router.get("/total-count", authMiddleware(["admin"]), getTotalAttendanceCount);
router.get(
  "/notifications",
  authMiddleware(["employee", "stagiaire", "admin"]),
  async (req, res) => {
    try {
      let notifications;
      if (req.user.role === "admin" && req.query.all === "true") {
        notifications = await Notification.find().sort({ timestamp: -1 });
      } else {
        notifications = await Notification.find({ userId: req.user.id }).sort({
          timestamp: -1,
        });
      }
      res.status(200).json({
        success: true,
        message: "Notifications retrieved successfully",
        data: { notifications },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
);

module.exports = router;
