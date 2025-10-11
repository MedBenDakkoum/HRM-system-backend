const Notification = require("../models/Notification");

// Get all notifications for a user
exports.getUserNotifications = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query; // Default limit of 20, max 50

    // Ensure limit is a reasonable number
    const limitNum = Math.min(Math.max(parseInt(limit) || 20, 1), 50);

    const notifications = await Notification.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limitNum);

    res.json({
      success: true,
      data: {
        notifications,
      },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
    });
  }
};

// Mark a notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.json({
      success: true,
      data: {
        notification,
      },
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
    });
  }
};

// Mark all notifications as read for a user
exports.markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.params;

    await Notification.updateMany({ userId, read: false }, { read: true });

    res.json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark all notifications as read",
    });
  }
};

// Create a new notification (helper function for internal use)
exports.createNotification = async (userId, message, type) => {
  try {
    const notification = new Notification({
      userId,
      message,
      type,
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
};

// Delete old notifications (optional cleanup)
exports.deleteOldNotifications = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await Notification.deleteMany({
      timestamp: { $lt: thirtyDaysAgo },
      read: true,
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} old notifications`,
    });
  } catch (error) {
    console.error("Error deleting old notifications:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete old notifications",
    });
  }
};
