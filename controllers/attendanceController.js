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
    .withMessage("Valid entryTime is required"),
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

const validateScanQr = [
  body("qrData").notEmpty().withMessage("QR data is required"),
  body("entryTime")
    .isISO8601()
    .toDate()
    .withMessage("Valid entryTime is required"),
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
    .withMessage("Valid entryTime is required"),
  body("location.coordinates")
    .isArray({ min: 2, max: 2 })
    .withMessage("Location coordinates must be [longitude, latitude]"),
  body("location.coordinates.*")
    .isFloat()
    .withMessage("Coordinates must be numbers"),
];

const validateExitTime = [
  body("attendanceId")
    .isMongoId()
    .withMessage("Valid attendanceId is required"),
  body("exitTime")
    .isISO8601()
    .toDate()
    .withMessage("Valid exitTime is required"),
  body("location.coordinates")
    .isArray({ min: 2, max: 2 })
    .withMessage("Location coordinates must be [longitude, latitude]"),
  body("location.coordinates.*")
    .isFloat()
    .withMessage("Coordinates must be numbers"),
];

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
      }).populate("employee", "name email");
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

      const qrData = JSON.stringify({
        employeeId,
        timestamp: Date.now(),
      });
      const qrCodeUrl = await QRCode.toDataURL(qrData);
      logger.info("QR code generated successfully", {
        employeeId,
        requesterId: req.user.id,
      });

      res.status(200).json({
        success: true,
        message: "QR code generated successfully",
        data: { qrCode: qrCodeUrl },
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

const recordExit = [
  validateExitTime,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in recordExit", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { attendanceId, exitTime, location } = req.body;
      const attendance = await Attendance.findById(attendanceId);
      if (!attendance) {
        logger.warn("Attendance not found in recordExit", { attendanceId });
        return res.status(404).json({
          success: false,
          message: "Attendance record not found",
        });
      }

      // Check authorization
      if (
        req.user.id !== attendance.employee.toString() &&
        req.user.role !== "admin"
      ) {
        logger.warn("Unauthorized exit time recording", {
          attendanceId,
          employeeId: attendance.employee,
          requesterId: req.user.id,
          requesterRole: req.user.role,
        });
        return res.status(403).json({
          success: false,
          message:
            "Access denied: Can only record own exit time or requires admin role",
        });
      }

      const employee = await Employee.findById(attendance.employee);
      if (!employee) {
        logger.warn("Employee not found in recordExit", {
          employeeId: attendance.employee,
        });
        return res.status(404).json({
          success: false,
          message: "Employee not found",
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
          `Your exit attempt at ${new Date(
            exitTime
          ).toLocaleString()} was outside the allowed area.`,
          { userId: attendance.employee.toString(), type: "location_issue" }
        );
        logger.warn("Location outside allowed area in recordExit", {
          employeeId: attendance.employee,
          distance,
        });
        return res.status(400).json({
          success: false,
          message: "Location outside allowed area",
        });
      }

      attendance.exitTime = exitTime;
      attendance.workingHours =
        (new Date(exitTime) - new Date(attendance.entryTime)) /
        (1000 * 60 * 60);
      await attendance.save();
      logger.info("Exit time recorded successfully", {
        attendanceId,
        employeeId: attendance.employee,
        requesterId: req.user.id,
      });

      res.status(200).json({
        success: true,
        message: "Exit time recorded successfully",
        data: { attendance, workingHours: attendance.workingHours.toFixed(2) },
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
          if (record.exitTime) {
            const hours =
              (record.exitTime - record.entryTime) / (1000 * 60 * 60);
            report.totalHours += hours;
          }
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

    // Validate query parameters
    if (!["daily", "weekly", "monthly"].includes(period) || !startDate) {
      logger.warn("Invalid query parameters in getAllPresenceReports", {
        period,
        startDate,
      });
      return res.status(400).json({
        success: false,
        message: "Invalid period or startDate",
      });
    }

    const employees = await Employee.find().select("name email role");
    const reports = [];

    for (const employee of employees) {
      const query = { employee: employee._id };
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

      const attendanceRecords = await Attendance.find(query);
      const report = {
        employeeId: employee._id,
        employeeName: employee.name,
        employeeRole: employee.role,
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
          if (record.exitTime) {
            const hours =
              (record.exitTime - record.entryTime) / (1000 * 60 * 60);
            report.totalHours += hours;
          }
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

module.exports = {
  recordAttendance,
  getAttendance,
  generateQrCode,
  scanQrCode,
  facialAttendance,
  recordExit,
  getPresenceReport,
  getAllPresenceReports,
};
