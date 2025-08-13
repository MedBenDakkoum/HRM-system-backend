const Attendance = require("../models/Attendance");
const Employee = require("../models/Employee");
const QRCode = require("qrcode");
const { sendEmail } = require("../utils/email");

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
      await sendEmail(
        employee.email,
        "Unauthorized Location Attempt",
        `Your attendance attempt at ${new Date(
          entryTime
        ).toLocaleString()} was outside the allowed area.`
      );
      return res.status(400).json({ message: "Location outside allowed area" });
    }

    const entryDate = new Date(entryTime);
    if (entryDate.getHours() >= 9) {
      await sendEmail(
        employee.email,
        "Late Attendance Notification",
        `You recorded attendance at ${entryDate.toLocaleString()}, which is after 9 AM.`
      );
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
    if (!employee) {
      return res.status(401).json({ message: "Invalid or expired QR code" });
    }

    if (Date.now() - parsedData.timestamp > 5 * 60 * 1000) {
      await sendEmail(
        employee.email,
        "Expired QR Code Attempt",
        `Your QR code scan at ${new Date(
          entryTime
        ).toLocaleString()} was invalid or expired.`
      );
      return res.status(401).json({ message: "Invalid or expired QR code" });
    }

    const allowedLocation = { lng: 10.12345, lat: 35.6789 };
    const distance =
      Math.sqrt(
        Math.pow(location.coordinates[0] - allowedLocation.lng, 2) +
          Math.pow(location.coordinates[1] - allowedLocation.lat, 2)
      ) * 111000;
    if (distance > 100) {
      await sendEmail(
        employee.email,
        "Unauthorized Location Attempt",
        `Your QR scan at ${new Date(
          entryTime
        ).toLocaleString()} was outside the allowed area.`
      );
      return res.status(400).json({ message: "Location outside allowed area" });
    }

    const entryDate = new Date(entryTime);
    if (entryDate.getHours() >= 9) {
      await sendEmail(
        employee.email,
        "Late Attendance Notification",
        `You recorded attendance at ${entryDate.toLocaleString()}, which is after 9 AM.`
      );
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
      await sendEmail(
        employee.email,
        "Unauthorized Location Attempt",
        `Your facial scan at ${new Date(
          entryTime
        ).toLocaleString()} was outside the allowed area.`
      );
      return res.status(400).json({ message: "Location outside allowed area" });
    }

    const entryDate = new Date(entryTime);
    if (entryDate.getHours() >= 9) {
      await sendEmail(
        employee.email,
        "Late Attendance Notification",
        `You recorded attendance at ${entryDate.toLocaleString()}, which is after 9 AM.`
      );
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

const recordExit = async (req, res) => {
  try {
    const { attendanceId, exitTime, location } = req.body;

    const attendance = await Attendance.findById(attendanceId);
    if (!attendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }

    const employee = await Employee.findById(attendance.employee);
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
      await sendEmail(
        employee.email,
        "Unauthorized Location Attempt",
        `Your exit attempt at ${new Date(
          exitTime
        ).toLocaleString()} was outside the allowed area.`
      );
      return res.status(400).json({ message: "Location outside allowed area" });
    }

    attendance.exitTime = exitTime || new Date();
    const workingHours =
      (new Date(attendance.exitTime) - new Date(attendance.entryTime)) /
      (1000 * 60 * 60);
    await attendance.save();

    res.status(200).json({
      message: "Exit time recorded",
      attendance,
      workingHours: workingHours.toFixed(2),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getPresenceReport = async (req, res) => {
  try {
    const { employeeId, period, startDate, endDate } = req.query;
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
      query.entryTime = { $gte: new Date(startDate), $lte: new Date(endDate) };
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
          const hours = (record.exitTime - record.entryTime) / (1000 * 60 * 60);
          report.totalHours += hours;
        }
      }
    });

    res.status(200).json({ message: "Presence report generated", report });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllPresenceReports = async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
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

    res
      .status(200)
      .json({ message: "All presence reports generated", reports });
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
  recordExit,
  getPresenceReport,
  getAllPresenceReports,
};
