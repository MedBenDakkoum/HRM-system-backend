const Leave = require("../models/Leave");
const Employee = require("../models/Employee");
const { sendEmail } = require("../utils/email");

const requestLeave = async (req, res) => {
  try {
    const { employeeId, startDate, endDate, reason } = req.body;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const leave = new Leave({
      employee: employeeId,
      startDate,
      endDate,
      reason,
    });

    await leave.save();
    await sendEmail(
      employee.email,
      "Leave Request Submitted",
      `Your leave request from ${new Date(
        startDate
      ).toLocaleDateString()} to ${new Date(
        endDate
      ).toLocaleDateString()} has been submitted for review.`
    );

    res.status(201).json({ message: "Leave request submitted", leave });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const approveLeave = async (req, res) => {
  try {
    const { leaveId, status } = req.body;

    const leave = await Leave.findById(leaveId).populate(
      "employee",
      "name email"
    );
    if (!leave) {
      return res.status(404).json({ message: "Leave request not found" });
    }

    leave.status = status;
    await leave.save();

    await sendEmail(
      leave.employee.email,
      `Leave Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
      `Your leave request from ${new Date(
        leave.startDate
      ).toLocaleDateString()} to ${new Date(
        leave.endDate
      ).toLocaleDateString()} has been ${status}.`
    );

    res.status(200).json({ message: `Leave ${status}`, leave });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getLeaves = async (req, res) => {
  try {
    const leaves = await Leave.find({
      employee: req.params.employeeId,
    }).populate("employee", "name email");
    res.status(200).json(leaves);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllLeaves = async (req, res) => {
  try {
    const leaves = await Leave.find().populate("employee", "name email");
    res.status(200).json(leaves);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { requestLeave, approveLeave, getLeaves, getAllLeaves };
