const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");

const recordAttendance = async (req, res) => {
  try {
    const { employeeId, entryTime, location, method } = req.body;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const allowedLocation = { lng: 10.12345, lat: 35.6789 };
    const distance =
      Math.sqrt(
        Math.pow(location.coordinates[0] - allowedLocation.lng, 2) +
          Math.pow(location.coordinates[1] - allowedLocation.lat, 2)
      ) * 111000;
    if (distance > 100) {
      return res.status(400).json({ message: "Location outside allowed area" });
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
