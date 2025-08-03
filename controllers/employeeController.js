const Employee = require("../models/Employee");
const bcrypt = require("bcryptjs");

const registerEmployee = async (req, res) => {
  try {
    const { name, email, password, role, position, internshipDetails } =
      req.body;

    const existingEmployee = await Employee.findOne({ email });
    if (existingEmployee) {
      return res.status(400).json({ message: "Employee already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const employee = new Employee({
      name,
      email,
      password: hashedPassword,
      role,
      position,
      internshipDetails,
    });

    await employee.save();
    res
      .status(201)
      .json({ message: "Employee registered successfully", employee });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getEmployees = async (req, res) => {
  try {
    const employees = await Employee.find().select("-password");
    res.status(200).json(employees);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getEmployeeById = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).select("-password");
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.status(200).json(employee);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateEmployee = async (req, res) => {
  try {
    const { name, email, role, position, internshipDetails } = req.body;
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    employee.name = name || employee.name;
    employee.email = email || employee.email;
    employee.role = role || employee.role;
    employee.position = position || employee.position;
    employee.internshipDetails =
      internshipDetails || employee.internshipDetails;

    await employee.save();
    res
      .status(200)
      .json({ message: "Employee updated successfully", employee });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }
    res.status(200).json({ message: "Employee deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  registerEmployee,
  getEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
};
