const Leave = require("../models/Leave");
const Employee = require("../models/Employee");
const { body, param, validationResult } = require("express-validator");
const winston = require("winston");
const { sendEmailAndNotify } = require("../utils/email"); // Updated to use sendEmailAndNotify
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
const validateRequestLeave = [
  body("employeeId").isMongoId().withMessage("Valid employeeId is required"),
  body("startDate")
    .isISO8601()
    .toDate()
    .withMessage("Valid startDate is required"),
  body("endDate")
    .isISO8601()
    .toDate()
    .withMessage("Valid endDate is required")
    .custom((endDate, { req }) => {
      if (new Date(endDate) < new Date(req.body.startDate)) {
        throw new Error("endDate must be after or equal to startDate");
      }
      return true;
    }),
  body("reason").notEmpty().withMessage("Reason is required"),
];

const validateApproveLeave = [
  body("leaveId").isMongoId().withMessage("Valid leaveId is required"),
  body("status")
    .isIn(["approved", "rejected"])
    .withMessage("Status must be one of: approved, rejected"),
];

const validateGetLeaves = [
  param("employeeId").isMongoId().withMessage("Valid employeeId is required"),
];

const requestLeave = [
  validateRequestLeave,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in requestLeave", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { employeeId, startDate, endDate, reason } = req.body;

      // Check if employee exists and requester is authorized
      const employee = await Employee.findById(employeeId);
      if (!employee) {
        logger.warn("Employee not found in requestLeave", { employeeId });
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }
      if (req.user.id !== employeeId && req.user.role !== "admin") {
        logger.warn("Unauthorized leave request", {
          employeeId,
          requesterId: req.user.id,
          requesterRole: req.user.role,
        });
        return res.status(403).json({
          success: false,
          message:
            "Access denied: Can only request own leave or requires admin role",
        });
      }

      const leave = new Leave({
        employee: employeeId,
        startDate,
        endDate,
        reason,
      });

      await leave.save();

      // Notify employee
      await sendEmailAndNotify(
        employee.email,
        "Leave Request Submitted",
        `Your leave request from ${new Date(
          startDate
        ).toLocaleDateString()} to ${new Date(
          endDate
        ).toLocaleDateString()} has been submitted for review.`,
        { userId: employeeId, type: "leave_request" }
      );

      // Notify all admins about the new leave request
      const admins = await Employee.find({ role: "admin" });
      const Notification = require("../models/Notification");

      for (const admin of admins) {
        const notification = new Notification({
          userId: admin._id,
          message: `${employee.name} requested leave from ${new Date(
            startDate
          ).toLocaleDateString()} to ${new Date(
            endDate
          ).toLocaleDateString()}. Reason: ${reason}`,
          type: "leave_request",
        });
        await notification.save();
      }

      logger.info("Leave requested successfully", {
        leaveId: leave._id,
        employeeId,
        requesterId: req.user.id,
      });

      res.status(201).json({
        success: true,
        message: "Leave request submitted successfully",
        data: { leave },
      });
    } catch (error) {
      logger.error("Error in requestLeave", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const approveLeave = [
  validateApproveLeave,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in approveLeave", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { leaveId, status } = req.body;
      const leave = await Leave.findById(leaveId).populate(
        "employee",
        "name email"
      );
      if (!leave) {
        logger.warn("Leave not found in approveLeave", { leaveId });
        return res.status(404).json({
          success: false,
          message: "Leave request not found",
        });
      }

      leave.status = status;
      await leave.save();

      await sendEmailAndNotify(
        leave.employee.email,
        `Leave Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        `Your leave request from ${new Date(
          leave.startDate
        ).toLocaleDateString()} to ${new Date(
          leave.endDate
        ).toLocaleDateString()} has been ${status}.`,
        { userId: leave.employee._id.toString(), type: `leave_${status}` }
      ); // Updated to sendEmailAndNotify
      logger.info("Leave status updated successfully", {
        leaveId,
        status,
        requesterId: req.user.id,
      });

      res.status(200).json({
        success: true,
        message: `Leave ${status} successfully`,
        data: { leave },
      });
    } catch (error) {
      logger.error("Error in approveLeave", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const getLeaves = [
  validateGetLeaves,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in getLeaves", {
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
        logger.warn("Unauthorized access to leave data", {
          employeeId,
          requesterId: req.user.id,
          requesterRole: req.user.role,
        });
        return res.status(403).json({
          success: false,
          message:
            "Access denied: Can only view own leaves or requires admin role",
        });
      }

      const leaves = await Leave.find({ employee: employeeId }).populate(
        "employee",
        "name email"
      );
      logger.info("Employee leaves retrieved successfully", {
        employeeId,
        requesterId: req.user.id,
      });

      res.status(200).json({
        success: true,
        message: "Leaves retrieved successfully",
        data: { leaves },
      });
    } catch (error) {
      logger.error("Error in getLeaves", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const getAllLeaves = async (req, res) => {
  try {
    const leaves = await Leave.find().populate("employee", "name email");
    logger.info("All leaves retrieved successfully", {
      requesterId: req.user.id,
    });

    res.status(200).json({
      success: true,
      message: "All leaves retrieved successfully",
      data: { leaves },
    });
  } catch (error) {
    logger.error("Error in getAllLeaves", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  requestLeave,
  approveLeave,
  getLeaves,
  getAllLeaves,
};
