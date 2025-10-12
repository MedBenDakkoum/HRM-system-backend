const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");
const { body, param, query, validationResult } = require("express-validator");
const winston = require("winston");
const QRCode = require("qrcode");
const { sendEmailAndNotify } = require("../utils/email");
const mongoose = require("mongoose");

// Configure Winston logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

// Validation middleware
const validateRecordAttendance = [
  body("employeeId").isMongoId().withMessage("Valid employeeId is required"),
  body("entryTime")
    .isISO8601()
    .toDate()
    .withMessage("Valid entryTime is required")
    .custom((value, { req }) => {
      const now = new Date();
      const entryDate = new Date(value);

      // Check if entry time is in the future (more than 15 minutes ahead)
      const timeDiff = entryDate.getTime() - now.getTime();
      if (timeDiff > 15 * 60 * 1000) {
        // 15 minutes in milliseconds
        throw new Error(
          "Entry time cannot be more than 15 minutes in the future"
        );
      }

      // For non-admins: cannot record past dates (only today with 15 min tolerance)
      if (req.user?.role !== "admin") {
        const todayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const entryDateStart = new Date(
          entryDate.getFullYear(),
          entryDate.getMonth(),
          entryDate.getDate()
        );

        if (entryDateStart < todayStart) {
          throw new Error("Only admins can record attendance for past dates");
        }

        // If recording past time today (more than 15 minutes ago), not allowed for non-admins
        if (timeDiff < -15 * 60 * 1000) {
          throw new Error("Only admins can record attendance for past times");
        }
      }

      // For admins: check if entry time is more than 7 days in the past (very lenient)
      if (req.user?.role === "admin" && timeDiff < -7 * 24 * 60 * 60 * 1000) {
        throw new Error("Entry time cannot be more than 7 days in the past");
      }

      return true;
    }),
  body("location.coordinates")
    .isArray({ min: 2, max: 2 })
    .withMessage("Location coordinates must be [longitude, latitude]"),
  body("location.coordinates.*")
    .isFloat()
    .withMessage("Coordinates must be numbers"),
  body("method")
    .isIn(["manual", "qr", "facial"])
    .withMessage("Method must be one of: manual, qr, facial"),
];

const validateExitAttendance = [
  body("employeeId").isMongoId().withMessage("Valid employeeId is required"),
  body("exitTime")
    .isISO8601()
    .toDate()
    .withMessage("Valid exitTime is required")
    .custom((value, { req }) => {
      const now = new Date();
      const exitDate = new Date(value);

      // Check if exit time is in the future (more than 15 minutes ahead)
      const timeDiff = exitDate.getTime() - now.getTime();
      if (timeDiff > 15 * 60 * 1000) {
        // 15 minutes in milliseconds
        throw new Error("Exit time cannot be in the future");
      }

      // For non-admins: cannot record past dates (only today with 15 min tolerance)
      if (req.user?.role !== "admin") {
        const todayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const exitDateStart = new Date(
          exitDate.getFullYear(),
          exitDate.getMonth(),
          exitDate.getDate()
        );

        if (exitDateStart < todayStart) {
          throw new Error("Only admins can record exit time for past dates");
        }

        // If recording past exit time today (more than 15 minutes ago), not allowed for non-admins
        if (timeDiff < -15 * 60 * 1000) {
          throw new Error("Only admins can record exit time for past times");
        }
      }

      // For admins: check if exit time is more than 7 days in the past
      if (req.user?.role === "admin" && timeDiff < -7 * 24 * 60 * 60 * 1000) {
        throw new Error("Exit time cannot be more than 7 days in the past");
      }

      return true;
    }),
  body("location.coordinates")
    .isArray({ min: 2, max: 2 })
    .withMessage("Location coordinates must be [longitude, latitude]"),
  body("location.coordinates.*")
    .isFloat()
    .withMessage("Coordinates must be numbers"),
];

const validateScanQr = [
  body("qrData").notEmpty().withMessage("QR data is required"),
  body("entryTime")
    .isISO8601()
    .toDate()
    .withMessage("Valid entryTime is required")
    .custom((value, { req }) => {
      const now = new Date();
      const entryDate = new Date(value);

      // Check if entry time is in the future (more than 15 minutes ahead)
      const timeDiff = entryDate.getTime() - now.getTime();
      if (timeDiff > 15 * 60 * 1000) {
        // 15 minutes in milliseconds
        throw new Error(
          "Entry time cannot be more than 15 minutes in the future"
        );
      }

      // For non-admins: cannot record past dates (only today with 15 min tolerance)
      if (req.user?.role !== "admin") {
        const todayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const entryDateStart = new Date(
          entryDate.getFullYear(),
          entryDate.getMonth(),
          entryDate.getDate()
        );

        if (entryDateStart < todayStart) {
          throw new Error("Only admins can record attendance for past dates");
        }

        // If recording past time today (more than 15 minutes ago), not allowed for non-admins
        if (timeDiff < -15 * 60 * 1000) {
          throw new Error("Only admins can record attendance for past times");
        }
      }

      // For admins: check if entry time is more than 7 days in the past (very lenient)
      if (req.user?.role === "admin" && timeDiff < -7 * 24 * 60 * 60 * 1000) {
        throw new Error("Entry time cannot be more than 7 days in the past");
      }

      return true;
    }),
  body("location.coordinates")
    .isArray({ min: 2, max: 2 })
    .withMessage("Location coordinates must be [longitude, latitude]"),
  body("location.coordinates.*")
    .isFloat()
    .withMessage("Coordinates must be numbers"),
];

const validateFacialAttendance = [
  body("employeeId").isMongoId().withMessage("Valid employeeId is required"),
  body("faceTemplate")
    .isArray()
    .withMessage("faceTemplate must be an array")
    .custom((value) => value.length === 128)
    .withMessage("faceTemplate must be 128 numbers"),
  body("faceTemplate.*").isFloat().withMessage("faceTemplate must be numbers"),
  body("entryTime")
    .isISO8601()
    .toDate()
    .withMessage("Valid entryTime is required")
    .custom((value, { req }) => {
      const now = new Date();
      const entryDate = new Date(value);

      // Check if entry time is in the future (more than 15 minutes ahead)
      const timeDiff = entryDate.getTime() - now.getTime();
      if (timeDiff > 15 * 60 * 1000) {
        // 15 minutes in milliseconds
        throw new Error(
          "Entry time cannot be more than 15 minutes in the future"
        );
      }

      // For non-admins: cannot record past dates (only today with 15 min tolerance)
      if (req.user?.role !== "admin") {
        const todayStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const entryDateStart = new Date(
          entryDate.getFullYear(),
          entryDate.getMonth(),
          entryDate.getDate()
        );

        if (entryDateStart < todayStart) {
          throw new Error("Only admins can record attendance for past dates");
        }

        // If recording past time today (more than 15 minutes ago), not allowed for non-admins
        if (timeDiff < -15 * 60 * 1000) {
          throw new Error("Only admins can record attendance for past times");
        }
      }

      // For admins: check if entry time is more than 7 days in the past (very lenient)
      if (req.user?.role === "admin" && timeDiff < -7 * 24 * 60 * 60 * 1000) {
        throw new Error("Entry time cannot be more than 7 days in the past");
      }

      return true;
    }),
  body("location.coordinates")
    .isArray({ min: 2, max: 2 })
    .withMessage("Location coordinates must be [longitude, latitude]"),
  body("location.coordinates.*")
    .isFloat()
    .withMessage("Coordinates must be numbers"),
];

// REMOVED validateExitTime - Using validateExitAttendance instead

const validateReport = [
  param("employeeId").isMongoId().withMessage("Valid employeeId is required"),
  query("period")
    .isIn(["daily", "weekly", "monthly"])
    .withMessage("Period must be one of: daily, weekly, monthly"),
  query("startDate")
    .isISO8601()
    .toDate()
    .withMessage("Valid startDate is required"),
  query("endDate")
    .optional()
    .isISO8601()
    .toDate()
    .withMessage("Valid endDate is required"),
];

// Default environment variables with fallback values
const allowedLocation = {
  lng: parseFloat(process.env.ALLOWED_LNG) || 8.8362755,
  lat: parseFloat(process.env.ALLOWED_LAT) || 33.1245286,
};
const allowedRadius = parseInt(process.env.ALLOWED_RADIUS) || 500; // Default to 500 meters

const recordAttendance = [
  validateRecordAttendance,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in recordAttendance", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { employeeId, entryTime, location, method } = req.body;

      // Check if employee exists and requester is authorized
      const employee = await Employee.findById(employeeId);
      if (!employee) {
        logger.warn("Employee not found in recordAttendance", { employeeId });
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }
      if (req.user.id !== employeeId && req.user.role !== "admin") {
        logger.warn("Unauthorized attendance recording", {
          employeeId,
          requesterId: req.user.id,
          requesterRole: req.user.role,
        });
        return res.status(403).json({
          success: false,
          message:
            "Access denied: Can only record own attendance or requires admin role",
        });
      }

      // Location validation
      const distance =
        Math.sqrt(
          Math.pow(location.coordinates[0] - allowedLocation.lng, 2) +
            Math.pow(location.coordinates[1] - allowedLocation.lat, 2)
        ) * 111000;
      if (distance > allowedRadius) {
        await sendEmailAndNotify(
          employee.email,
          "Unauthorized Location Attempt",
          `Your attendance attempt at ${new Date(
            entryTime
          ).toLocaleString()} was outside the allowed area.`,
          { userId: employeeId, type: "location_issue" }
        );
        logger.warn("Location outside allowed area in recordAttendance", {
          employeeId,
          distance,
        });
        return res.status(400).json({
          success: false,
          message: "Location outside allowed area",
        });
      }

      // Late attendance notification
      const entryDate = new Date(entryTime);
      if (entryDate.getHours() >= 9) {
        await sendEmailAndNotify(
          employee.email,
          "Late Attendance Notification",
          `You recorded attendance at ${entryDate.toLocaleString()}, which is after 9 AM.`,
          { userId: employeeId, type: "late_arrival" }
        );
        logger.info("Late attendance recorded", { employeeId, entryTime });
      }

      const attendance = new Attendance({
        employee: employeeId,
        entryTime,
        location: {
          type: "Point",
          coordinates: location.coordinates,
        },
        method,
      });

      await attendance.save();
      logger.info("Attendance recorded successfully", {
        attendanceId: attendance._id,
        employeeId,
        requesterId: req.user.id,
      });

      res.status(201).json({
        success: true,
        message: "Attendance recorded successfully",
        data: { attendance },
      });
    } catch (error) {
      logger.error("Error in recordAttendance", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const getAttendance = [
  param("employeeId").isMongoId().withMessage("Valid employeeId is required"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in getAttendance", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { employeeId } = req.params;

      // Check authorization
      if (req.user.id !== employeeId && req.user.role !== "admin") {
        logger.warn("Unauthorized access to attendance data", {
          employeeId,
          requesterId: req.user.id,
          requesterRole: req.user.role,
        });
        return res.status(403).json({
          success: false,
          message:
            "Access denied: Can only view own attendance or requires admin role",
        });
      }

      const attendanceRecords = await Attendance.find({
        employee: employeeId,
      })
        .populate("employee", "name email")
        .sort({ createdAt: -1 }) // Sort by newest first
        .limit(7); // Limit to last 7 records
      logger.info("Employee attendance retrieved successfully", {
        employeeId,
        requesterId: req.user.id,
      });

      res.status(200).json({
        success: true,
        message: "Attendance retrieved successfully",
        data: { attendance: attendanceRecords },
      });
    } catch (error) {
      logger.error("Error in getAttendance", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const generateQrCode = [
  param("employeeId").isMongoId().withMessage("Valid employeeId is required"),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in generateQrCode", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { employeeId } = req.params;

      const employee = await Employee.findById(employeeId);
      if (!employee) {
        logger.warn("Employee not found in generateQrCode", { employeeId });
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      // Check if requester is authorized to generate QR code for this employee
      if (req.user.id !== employeeId && req.user.role !== "admin") {
        logger.warn("Unauthorized QR code generation attempt", {
          employeeId,
          requesterId: req.user.id,
          requesterRole: req.user.role,
        });
        return res.status(403).json({
          success: false,
          message:
            "Access denied: Can only generate QR code for yourself or requires admin role",
        });
      }

      const qrData = JSON.stringify({
        employeeId,
        timestamp: Date.now(),
        expiresAt: Date.now() + 12 * 60 * 60 * 1000, // Expires in 12 hours
      });
      const qrCodeUrl = await QRCode.toDataURL(qrData);
      logger.info("QR code generated successfully", {
        employeeId,
        requesterId: req.user.id,
      });

      res.status(200).json({
        success: true,
        message: "QR code generated successfully",
        data: { qrCodeUrl: qrCodeUrl },
      });
    } catch (error) {
      logger.error("Error in generateQrCode", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const scanQrCode = [
  validateScanQr,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in scanQrCode", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { qrData, location, entryTime } = req.body;
      let parsedData;
      try {
        parsedData = JSON.parse(qrData);
      } catch (error) {
        logger.warn("Invalid QR data format in scanQrCode", { qrData });
        return res.status(400).json({
          success: false,
          message: "Invalid QR data format",
        });
      }

      const { employeeId, timestamp } = parsedData;
      if (!mongoose.Types.ObjectId.isValid(employeeId)) {
        logger.warn("Invalid employeeId in QR data", { employeeId });
        return res.status(400).json({
          success: false,
          message: "Invalid employeeId in QR data",
        });
      }

      // Check if requester is authorized
      if (req.user.id !== employeeId && req.user.role !== "admin") {
        logger.warn("Unauthorized QR scan attempt", {
          employeeId,
          requesterId: req.user.id,
          requesterRole: req.user.role,
        });
        return res.status(403).json({
          success: false,
          message:
            "Access denied: Can only scan own QR code or requires admin role",
        });
      }

      const employee = await Employee.findById(employeeId);
      if (!employee) {
        logger.warn("Employee not found in scanQrCode", { employeeId });
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      // Validate QR code timestamp (5-minute expiry)
      if (Date.now() - timestamp > 5 * 60 * 1000) {
        await sendEmailAndNotify(
          employee.email,
          "Expired QR Code Attempt",
          `Your QR code scan at ${new Date(
            entryTime
          ).toLocaleString()} was invalid or expired.`,
          { userId: employeeId, type: "expired_qr" }
        );
        logger.warn("QR code expired", { employeeId, timestamp });
        return res.status(401).json({
          success: false,
          message: "Invalid or expired QR code",
        });
      }

      // Location validation
      const distance =
        Math.sqrt(
          Math.pow(location.coordinates[0] - allowedLocation.lng, 2) +
            Math.pow(location.coordinates[1] - allowedLocation.lat, 2)
        ) * 111000;
      if (distance > allowedRadius) {
        await sendEmailAndNotify(
          employee.email,
          "Unauthorized Location Attempt",
          `Your QR scan at ${new Date(
            entryTime
          ).toLocaleString()} was outside the allowed area.`,
          { userId: employeeId, type: "location_issue" }
        );
        logger.warn("Location outside allowed area in scanQrCode", {
          employeeId,
          distance,
        });
        return res.status(400).json({
          success: false,
          message: "Location outside allowed area",
        });
      }

      // Late attendance notification
      const entryDate = new Date(entryTime);
      if (entryDate.getHours() >= 9) {
        await sendEmailAndNotify(
          employee.email,
          "Late Attendance Notification",
          `You recorded attendance at ${entryDate.toLocaleString()}, which is after 9 AM.`,
          { userId: employeeId, type: "late_arrival" }
        );
        logger.info("Late QR attendance recorded", { employeeId, entryTime });
      }

      const attendance = new Attendance({
        employee: employeeId,
        entryTime,
        location: {
          type: "Point",
          coordinates: location.coordinates,
        },
        method: "qr",
      });

      await attendance.save();
      logger.info("QR code attendance recorded successfully", {
        attendanceId: attendance._id,
        employeeId,
        requesterId: req.user.id,
      });

      res.status(201).json({
        success: true,
        message: "QR code attendance recorded successfully",
        data: { attendance },
      });
    } catch (error) {
      logger.error("Error in scanQrCode", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

function calculateDistance(descriptor1, descriptor2) {
  if (!descriptor1 || !descriptor2 || descriptor1.length !== descriptor2.length)
    return Infinity;
  return Math.sqrt(
    descriptor1.reduce(
      (sum, val, i) => sum + Math.pow(val - descriptor2[i], 2),
      0
    )
  );
}

const facialAttendance = [
  validateFacialAttendance,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in facialAttendance", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { employeeId, faceTemplate, entryTime, location } = req.body;
      const userIdStr = req.user.id.toString();

      // Find the employee by employeeId
      const employee = await Employee.findById(employeeId);
      if (!employee || !employee.faceDescriptor) {
        logger.warn(
          "Employee or faceDescriptor not found in facialAttendance",
          { employeeId }
        );
        return res.status(401).json({
          success: false,
          message: "Employee or face descriptor not found",
        });
      }

      // Compare face descriptors
      const distance = calculateDistance(faceTemplate, employee.faceDescriptor);
      logger.info("Face recognition distance", { employeeId, distance });
      if (distance >= 0.6) {
        logger.warn("Face recognition failed due to distance", {
          employeeId,
          distance,
        });
        return res.status(401).json({
          success: false,
          message: "Face not recognized",
        });
      }

      // Authorization check
      if (userIdStr !== employee._id.toString() && req.user.role !== "admin") {
        logger.warn("Unauthorized facial attendance attempt", {
          employeeId,
          requesterId: userIdStr,
          requesterRole: req.user.role,
        });
        return res.status(403).json({
          success: false,
          message:
            "Access denied: Can only record own facial attendance or requires admin role",
        });
      }

      // Location validation
      const distanceCheck =
        Math.sqrt(
          Math.pow(location.coordinates[0] - allowedLocation.lng, 2) +
            Math.pow(location.coordinates[1] - allowedLocation.lat, 2)
        ) * 111000;
      if (distanceCheck > allowedRadius) {
        await sendEmailAndNotify(
          employee.email,
          "Unauthorized Location Attempt",
          `Your facial scan at ${new Date(
            entryTime
          ).toLocaleString()} was outside the allowed area.`,
          { userId: employee._id.toString(), type: "location_issue" }
        );
        logger.warn("Location outside allowed area in facialAttendance", {
          employeeId,
          distance: distanceCheck,
        });
        return res.status(400).json({
          success: false,
          message: "Location outside allowed area",
        });
      }

      // Late attendance notification
      const entryDate = new Date(entryTime);
      if (entryDate.getHours() >= 9) {
        await sendEmailAndNotify(
          employee.email,
          "Late Attendance Notification",
          `You recorded attendance at ${entryDate.toLocaleString()}, which is after 9 AM.`,
          { userId: employee._id.toString(), type: "late_arrival" }
        );
        logger.info("Late facial attendance recorded", {
          employeeId,
          entryTime,
        });
      }

      // Record attendance
      const attendance = new Attendance({
        employee: employee._id,
        entryTime,
        location: {
          type: "Point",
          coordinates: location.coordinates,
        },
        method: "facial",
      });

      await attendance.save();
      logger.info("Facial attendance recorded successfully", {
        attendanceId: attendance._id,
        employeeId,
        requesterId: userIdStr,
      });

      res.status(201).json({
        success: true,
        message: "Facial attendance recorded successfully",
        data: { attendance },
      });
    } catch (error) {
      logger.error("Error in facialAttendance", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

// REMOVED DUPLICATE recordExit FUNCTION - Using the correct one below

const getPresenceReport = [
  validateReport,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in getPresenceReport", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { employeeId } = req.params;
      const { period, startDate, endDate } = req.query;

      const employee = await Employee.findById(employeeId);
      if (!employee) {
        logger.warn("Employee not found in getPresenceReport", { employeeId });
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      const query = { employee: employeeId };
      if (period === "weekly") {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        query.entryTime = { $gte: start, $lte: end };
      } else if (period === "monthly") {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        start.setDate(1);
        const end = new Date(start);
        end.setMonth(start.getMonth() + 1);
        query.entryTime = { $gte: start, $lte: end };
      } else if (startDate && endDate) {
        query.entryTime = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      const attendanceRecords = await Attendance.find(query).populate(
        "employee",
        "name email role"
      );

      const report = {
        employeeId,
        employeeName: employee.name,
        period: period || "custom",
        totalDays: 0,
        totalHours: 0,
        lateDays: 0,
      };

      attendanceRecords.forEach((record) => {
        if (record.entryTime) {
          report.totalDays += 1;
          if (record.entryTime.getHours() >= 9) {
            report.lateDays += 1;
          }

          // Calculate hours worked - ONLY count actual recorded hours
          if (record.exitTime) {
            // Only count hours when both entry AND exit are recorded
            const hours =
              (record.exitTime - record.entryTime) / (1000 * 60 * 60);
            report.totalHours += hours;
          }
          // If no exit time recorded, don't count any hours (we don't know actual work time)
        }
      });

      logger.info("Presence report generated successfully", {
        employeeId,
        requesterId: req.user.id,
      });

      res.status(200).json({
        success: true,
        message: "Presence report generated successfully",
        data: { report },
      });
    } catch (error) {
      logger.error("Error in getPresenceReport", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const getAllPresenceReports = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;

    const employees = await Employee.find().select(
      "name email role hireDate createdAt"
    );
    const reports = [];

    for (const employee of employees) {
      const query = { employee: employee._id };

      // If no date parameters provided, use hire date to today as default
      if (!period && !startDate && !endDate) {
        const hireDate = employee.hireDate || employee.createdAt;
        if (hireDate) {
          const start = new Date(hireDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date();
          end.setHours(23, 59, 59, 999);
          query.entryTime = { $gte: start, $lte: end };
        }
      } else if (period === "weekly" && startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(start.getDate() + 7);
        query.entryTime = { $gte: start, $lte: end };
      } else if (period === "monthly" && startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        start.setDate(1);
        const end = new Date(start);
        end.setMonth(start.getMonth() + 1);
        query.entryTime = { $gte: start, $lte: end };
      } else if (startDate && endDate) {
        query.entryTime = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      const attendanceRecords = await Attendance.find(query);

      // Determine the actual period and start date for the report
      let reportPeriod = period || "all-time";
      let reportStartDate = startDate;

      if (!period && !startDate && !endDate) {
        const hireDate = employee.hireDate || employee.createdAt;
        reportStartDate = hireDate
          ? new Date(hireDate).toISOString().split("T")[0]
          : null;
      }

      const report = {
        employeeId: employee._id,
        employeeName: employee.name,
        employeeRole: employee.role,
        period: reportPeriod,
        startDate: reportStartDate,
        totalDays: 0,
        totalHours: 0,
        lateDays: 0,
      };

      attendanceRecords.forEach((record) => {
        if (record.entryTime) {
          report.totalDays += 1;
          if (record.entryTime.getHours() >= 9) {
            report.lateDays += 1;
          }

          // Calculate hours worked - ONLY count actual recorded hours
          if (record.exitTime) {
            // Only count hours when both entry AND exit are recorded
            const hours =
              (record.exitTime - record.entryTime) / (1000 * 60 * 60);
            report.totalHours += hours;
          }
          // If no exit time recorded, don't count any hours (we don't know actual work time)
        }
      });

      reports.push(report);
    }

    logger.info("All presence reports generated successfully", {
      requesterId: req.user.id,
    });

    res.status(200).json({
      success: true,
      message: "All presence reports generated successfully",
      data: { reports },
    });
  } catch (error) {
    logger.error("Error in getAllPresenceReports", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const getAllEmployees = async (req, res) => {
  try {
    // Check if requester is admin
    if (req.user.role !== "admin") {
      logger.warn("Unauthorized access to getAllEmployees", {
        requesterId: req.user.id,
        requesterRole: req.user.role,
      });
      return res.status(403).json({
        success: false,
        message: "Access denied: Requires admin role",
      });
    }

    const employees = await Employee.find().select("_id name");
    logger.info("All employees retrieved successfully", {
      requesterId: req.user.id,
    });

    res.status(200).json({
      success: true,
      message: "Employees retrieved successfully",
      data: { employees },
    });
  } catch (error) {
    logger.error("Error in getAllEmployees", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Get total attendance count (for dashboard stats)
const getTotalAttendanceCount = async (req, res) => {
  try {
    const totalCount = await Attendance.countDocuments();

    logger.info("Total attendance count retrieved successfully", {
      requesterId: req.user.id,
      totalCount,
    });

    res.status(200).json({
      success: true,
      message: "Total attendance count retrieved successfully",
      data: { totalCount },
    });
  } catch (error) {
    logger.error("Error in getTotalAttendanceCount", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Get daily attendance statistics for the last N days
const getDailyStats = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const maxDays = Math.min(days, 30); // Limit to 30 days max

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - maxDays + 1);
    startDate.setHours(0, 0, 0, 0);

    // Get all attendance records for the period
    const attendanceRecords = await Attendance.find({
      entryTime: { $gte: startDate },
    }).select("employee entryTime");

    // Group by date
    const dailyStats = [];
    for (let i = 0; i < maxDays; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      // Count unique employees for this day
      const dayRecords = attendanceRecords.filter((record) => {
        const recordDate = new Date(record.entryTime);
        return recordDate >= date && recordDate < nextDate;
      });

      // Get unique employee IDs
      const uniqueEmployees = new Set(
        dayRecords.map((record) => record.employee.toString())
      );

      dailyStats.push({
        date: date.toISOString().split("T")[0],
        count: uniqueEmployees.size,
      });
    }

    logger.info("Daily attendance statistics retrieved successfully", {
      requesterId: req.user.id,
      days: maxDays,
    });

    res.status(200).json({
      success: true,
      message: "Daily statistics retrieved successfully",
      data: { stats: dailyStats },
    });
  } catch (error) {
    logger.error("Error in getDailyStats", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const recordExit = [
  validateExitAttendance,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Exit attendance validation failed", {
          errors: errors.array(),
          requesterId: req.user?.id,
        });
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const { employeeId, exitTime, location } = req.body;
      const requesterId = req.user.id;

      logger.info("Exit attendance request received", {
        employeeId,
        exitTime,
        location,
        requesterId,
      });

      // Check if employee exists
      const employee = await Employee.findById(employeeId);
      if (!employee) {
        logger.warn("Employee not found for exit attendance", {
          employeeId,
          requesterId,
        });
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      // Find the most recent attendance record for this employee that doesn't have an exit time
      // For admin users, look for records within the last 7 days
      // For regular users, only look for today's records
      const now = new Date();
      let startDate, endDate;

      if (req.user?.role === "admin") {
        // Admin: look for records within the last 7 days
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
      } else {
        // Regular user: only look for today's records
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
      }

      const existingAttendance = await Attendance.findOne({
        employee: employeeId,
        entryTime: {
          $gte: startDate,
          $lte: endDate,
        },
        exitTime: { $exists: false },
      }).sort({ entryTime: -1 });

      if (!existingAttendance) {
        logger.warn("No entry attendance found for exit", {
          employeeId,
          requesterId,
        });
        return res.status(400).json({
          success: false,
          message:
            "No entry attendance found for today. Please record entry first.",
        });
      }

      // Validate that exit time is after entry time
      const exitDateTime = new Date(exitTime);
      const entryDateTime = new Date(existingAttendance.entryTime);

      if (exitDateTime <= entryDateTime) {
        logger.warn("Exit time is not after entry time", {
          employeeId,
          entryTime: existingAttendance.entryTime,
          exitTime,
          requesterId,
        });
        return res.status(400).json({
          success: false,
          message: "Exit time must be after entry time",
        });
      }

      // Update the attendance record with exit time
      existingAttendance.exitTime = exitDateTime;
      existingAttendance.exitLocation = {
        type: "Point",
        coordinates: location.coordinates,
      };

      await existingAttendance.save();

      logger.info("Exit attendance recorded successfully", {
        attendanceId: existingAttendance._id,
        employeeId,
        entryTime: existingAttendance.entryTime,
        exitTime: existingAttendance.exitTime,
        requesterId,
      });

      // Send notification to employee
      try {
        await sendEmailAndNotify(
          employee._id,
          "Exit Recorded",
          `Your exit time has been recorded: ${exitDateTime.toLocaleString()}`
        );
      } catch (emailError) {
        logger.error("Failed to send exit notification", {
          error: emailError.message,
          employeeId,
        });
      }

      res.status(200).json({
        success: true,
        message: "Exit time recorded successfully",
        data: {
          attendance: existingAttendance,
        },
      });
    } catch (error) {
      logger.error("Error in recordExit", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

module.exports = {
  recordAttendance,
  getAttendance,
  generateQrCode,
  scanQrCode,
  facialAttendance,
  recordExit,
  getPresenceReport,
  getAllPresenceReports,
  getAllEmployees,
  getDailyStats,
  getTotalAttendanceCount,
  validateExitAttendance,
};
