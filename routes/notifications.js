const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { verifyToken } = require("../middleware/auth");

// Get all notifications for a user
router.get(
  "/:userId/notifications",
  verifyToken,
  notificationController.getUserNotifications
);

// Mark a notification as read
router.patch(
  "/notifications/:notificationId/read",
  verifyToken,
  notificationController.markAsRead
);

// Mark all notifications as read for a user
router.patch(
  "/:userId/notifications/read-all",
  verifyToken,
  notificationController.markAllAsRead
);

// Delete old notifications (admin only or scheduled task)
router.delete(
  "/notifications/cleanup",
  verifyToken,
  notificationController.deleteOldNotifications
);

module.exports = router;
