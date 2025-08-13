const express = require("express");
const router = express.Router();
const {
  requestLeave,
  approveLeave,
  getLeaves,
  getAllLeaves,
} = require("../controllers/leaveController");
const authMiddleware = require("../middleware/auth");

router.post(
  "/",
  authMiddleware(["employee", "stagiaire", "admin"]),
  requestLeave
);
router.post("/approve", authMiddleware(["admin"]), approveLeave);
router.get(
  "/employee/:employeeId",
  authMiddleware(["employee", "stagiaire", "admin"]),
  getLeaves
);
router.get("/", authMiddleware(["admin"]), getAllLeaves);

module.exports = router;
