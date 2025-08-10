const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");
const QRCode = require("qrcode");

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

const generateQrCode = async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const qrData = JSON.stringify({ employeeId, timestamp: Date.now() });
    const qrCodeUrl = await QRCode.toDataURL(qrData);
    employee.qrCode = qrCodeUrl;
    await employee.save();

    res.status(200).json({ message: "QR code generated", qrCode: qrCodeUrl });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const scanQrCode = async (req, res) => {
  try {
    const { qrData, location, entryTime } = req.body;
    let parsedData;
    try {
      parsedData = JSON.parse(qrData);
    } catch (error) {
      return res.status(400).json({ message: "Invalid QR code data" });
    }

    const employee = await Employee.findById(parsedData.employeeId);
    if (!employee || employee.qrCode !== qrData) {
      return res.status(401).json({ message: "Invalid or expired QR code" });
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
      employee: parsedData.employeeId,
      entryTime: entryTime || new Date(),
      location: {
        type: "Point",
        coordinates: location.coordinates,
      },
      method: "qr",
    });

    await attendance.save();
    res.status(201).json({ message: "QR attendance recorded", attendance });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const facialAttendance = async (req, res) => {
  try {
    const { faceTemplate, location, entryTime } = req.body;
    const employee = await Employee.findOne({ faceTemplate });
    if (!employee) {
      return res.status(401).json({ message: "Face not recognized" });
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
      employee: employee._id,
      entryTime: entryTime || new Date(),
      location: {
        type: "Point",
        coordinates: location.coordinates,
      },
      method: "facial",
    });

    await attendance.save();
    res.status(201).json({ message: "Facial attendance recorded", attendance });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  recordAttendance,
  getAttendance,
  generateQrCode,
  scanQrCode,
  facialAttendance,
};
