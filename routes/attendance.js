const express = require("express");
const router = express.Router();
const {
  recordAttendance,
  getAttendance,
} = require("../controllers/attendanceController");

router.post("/", recordAttendance);
router.get("/employee/:employeeId", getAttendance);

module.exports = router;
