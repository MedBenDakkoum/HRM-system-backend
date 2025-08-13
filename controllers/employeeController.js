const Employee = require("../models/Employee");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, validationResult } = require("express-validator");
const winston = require("winston");

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

// Add console logging in development
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  );
}

// Validation middleware for registerEmployee
const validateRegisterEmployee = [
  body("name").notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 6 })
    .withMessage("Password must be at least 6 characters"),
  body("role")
    .isIn(["employee", "stagiaire", "admin"])
    .withMessage("Role must be one of: employee, stagiaire, admin"),
  body("position").notEmpty().withMessage("Position is required"),
];

// Validation middleware for updateEmployee
const validateUpdateEmployee = [
  body("name").optional().notEmpty().withMessage("Name cannot be empty"),
  body("email").optional().isEmail().withMessage("Valid email is required"),
  body("role")
    .optional()
    .isIn(["employee", "stagiaire", "admin"])
    .withMessage("Role must be one of: employee, stagiaire, admin"),
  body("position")
    .optional()
    .notEmpty()
    .withMessage("Position cannot be empty"),
];

const registerEmployee = [
  // Validation middleware
  validateRegisterEmployee,
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in registerEmployee", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { name, email, password, role, position, internshipDetails } =
        req.body;

      // Restrict admin role creation to admins only
      if (role === "admin" && (!req.user || req.user.role !== "admin")) {
        logger.warn("Unauthorized attempt to create admin", {
          email,
          requesterId: req.user?.id,
          requesterRole: req.user?.role,
        });
        return res.status(403).json({
          success: false,
          message: "Only admins can register admin users",
        });
      }

      // Check for existing employee
      const existingEmployee = await Employee.findOne({ email });
      if (existingEmployee) {
        logger.warn("Attempt to register existing employee", { email });
        return res.status(400).json({
          success: false,
          message: "Employee already exists",
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create employee
      const employee = new Employee({
        name,
        email,
        password: hashedPassword,
        role: role || "employee", // Default to employee if role not provided
        position,
        internshipDetails,
      });

      await employee.save();
      logger.info("Employee registered successfully", {
        email,
        employeeId: employee._id,
      });

      res.status(201).json({
        success: true,
        message: "Employee registered successfully",
        data: {
          employee: {
            _id: employee._id,
            name: employee.name,
            email: employee.email,
            role: employee.role,
            position: employee.position,
            internshipDetails: employee.internshipDetails,
          },
        },
      });
    } catch (error) {
      logger.error("Error in registerEmployee", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const loginEmployee = [
  // Validation middleware
  body("email").isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in loginEmployee", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { email, password } = req.body;
      const employee = await Employee.findOne({ email });
      if (!employee) {
        logger.warn("Login attempt with invalid email", { email });
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      const isMatch = await bcrypt.compare(password, employee.password);
      if (!isMatch) {
        logger.warn("Login attempt with incorrect password", { email });
        return res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }

      const token = jwt.sign(
        { id: employee._id, role: employee.role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );
      logger.info("Employee logged in successfully", {
        email,
        employeeId: employee._id,
      });

      res.status(200).json({
        success: true,
        message: "Login successful",
        data: { token },
      });
    } catch (error) {
      logger.error("Error in loginEmployee", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const updateFaceTemplate = [
  // Validation middleware
  body("faceTemplate").notEmpty().withMessage("Face template is required"),
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in updateFaceTemplate", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { faceTemplate } = req.body;
      const employee = await Employee.findById(req.params.id);
      if (!employee) {
        logger.warn("Employee not found in updateFaceTemplate", {
          employeeId: req.params.id,
        });
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      employee.faceTemplate = faceTemplate;
      await employee.save();
      logger.info("Face template updated successfully", {
        employeeId: employee._id,
      });

      res.status(200).json({
        success: true,
        message: "Face template updated successfully",
        data: {
          employee: {
            _id: employee._id,
            name: employee.name,
            email: employee.email,
            role: employee.role,
            faceTemplate: employee.faceTemplate,
          },
        },
      });
    } catch (error) {
      logger.error("Error in updateFaceTemplate", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const updateQrCode = [
  // Validation middleware
  body("qrCode").notEmpty().withMessage("QR code is required"),
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in updateQrCode", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { qrCode } = req.body;
      const employee = await Employee.findById(req.params.id);
      if (!employee) {
        logger.warn("Employee not found in updateQrCode", {
          employeeId: req.params.id,
        });
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      employee.qrCode = qrCode;
      await employee.save();
      logger.info("QR code updated successfully", { employeeId: employee._id });

      res.status(200).json({
        success: true,
        message: "QR code updated successfully",
        data: {
          employee: {
            _id: employee._id,
            name: employee.name,
            email: employee.email,
            role: employee.role,
            qrCode: employee.qrCode,
          },
        },
      });
    } catch (error) {
      logger.error("Error in updateQrCode", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const getEmployees = async (req, res) => {
  try {
    const employees = await Employee.find().select(
      "-password -faceTemplate -qrCode"
    );
    logger.info("Retrieved all employees", { requesterId: req.user.id });

    res.status(200).json({
      success: true,
      message: "Employees retrieved successfully",
      data: { employees },
    });
  } catch (error) {
    logger.error("Error in getEmployees", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const getEmployeeById = async (req, res) => {
  try {
    // Check if the requester is accessing their own data or is an admin
    if (req.user.id !== req.params.id && req.user.role !== "admin") {
      logger.warn("Unauthorized access to employee data", {
        employeeId: req.params.id,
        requesterId: req.user.id,
        requesterRole: req.user.role,
      });
      return res.status(403).json({
        success: false,
        message: "Access denied: Can only view own data or requires admin role",
      });
    }

    const employee = await Employee.findById(req.params.id).select(
      "-password -faceTemplate -qrCode"
    );
    if (!employee) {
      logger.warn("Employee not found in getEmployeeById", {
        employeeId: req.params.id,
      });
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    logger.info("Employee retrieved successfully", {
      employeeId: employee._id,
      requesterId: req.user.id,
    });
    res.status(200).json({
      success: true,
      message: "Employee retrieved successfully",
      data: { employee },
    });
  } catch (error) {
    logger.error("Error in getEmployeeById", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const updateEmployee = [
  // Validation middleware
  validateUpdateEmployee,
  async (req, res) => {
    try {
      // Check validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn("Validation errors in updateEmployee", {
          errors: errors.array(),
        });
        return res.status(400).json({
          success: false,
          message: "Validation errors",
          errors: errors.array(),
        });
      }

      const { name, email, role, position, internshipDetails } = req.body;
      const employee = await Employee.findById(req.params.id);
      if (!employee) {
        logger.warn("Employee not found in updateEmployee", {
          employeeId: req.params.id,
        });
        return res.status(404).json({
          success: false,
          message: "Employee not found",
        });
      }

      // Restrict role updates to admins only
      if (role && req.user.role !== "admin") {
        logger.warn("Unauthorized attempt to update role", {
          employeeId: req.params.id,
          requesterId: req.user.id,
          requesterRole: req.user.role,
        });
        return res.status(403).json({
          success: false,
          message: "Only admins can update employee roles",
        });
      }

      employee.name = name || employee.name;
      employee.email = email || employee.email;
      employee.role = role || employee.role;
      employee.position = position || employee.position;
      employee.internshipDetails =
        internshipDetails || employee.internshipDetails;

      await employee.save();
      logger.info("Employee updated successfully", {
        employeeId: employee._id,
        requesterId: req.user.id,
      });

      res.status(200).json({
        success: true,
        message: "Employee updated successfully",
        data: {
          employee: {
            _id: employee._id,
            name: employee.name,
            email: employee.email,
            role: employee.role,
            position: employee.position,
            internshipDetails: employee.internshipDetails,
          },
        },
      });
    } catch (error) {
      logger.error("Error in updateEmployee", { error: error.message });
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
];

const deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) {
      logger.warn("Employee not found in deleteEmployee", {
        employeeId: req.params.id,
      });
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    logger.info("Employee deleted successfully", {
      employeeId: req.params.id,
      requesterId: req.user.id,
    });
    res.status(200).json({
      success: true,
      message: "Employee deleted successfully",
      data: {},
    });
  } catch (error) {
    logger.error("Error in deleteEmployee", { error: error.message });
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

module.exports = {
  registerEmployee,
  loginEmployee,
  updateFaceTemplate,
  updateQrCode,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
};
