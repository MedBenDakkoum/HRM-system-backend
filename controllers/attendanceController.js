const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");

const recordAttendance = async (req, res) => {
  try {
    const { employeeId, entryTime, location, method } = req.body;

    // Verify employee exists
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Validate location (example: check if coordinates are within allowed area)
    // For simplicity, assume coordinates are [longitude, latitude]
    const allowedLocation = { lng: 0, lat: 0 }; // Replace with actual office coordinates
    // Add logic to compare location.coordinates with allowedLocation

    const attendance = new Attendance({
      employee: employeeId,
      entryTime,
      location: {
        type: "Point",
        coordinates: location.coordinates, // [longitude, latitude]
      },
      method,
    });

    await attendance.save();
    res.status(201).json({ message: "Attendance recorded", attendance });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAttendance = async (req, res) => {
  try {
    const attendanceRecords = await Attendance.find({
      employee: req.params.employeeId,
    }).populate("employee", "name email");
    res.status(200).json(attendanceRecords);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { recordAttendance, getAttendance };
