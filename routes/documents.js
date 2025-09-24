const express = require("express");
const router = express.Router();
const {
  generateAttestation,
  getDocuments,
  getAllAttestations,
  getAllDocuments,
  generatePaySlip,
  downloadDocument,
  deleteDocument,
} = require("../controllers/documentController");
const authMiddleware = require("../middleware/auth");

router.post(
  "/attestation",
  authMiddleware(["employee", "stagiaire", "admin"]),
  generateAttestation
);
router.get(
  "/employee/:employeeId",
  authMiddleware(["employee", "stagiaire", "admin"]),
  getDocuments
);
router.get("/attestations", authMiddleware(["admin"]), getAllAttestations);
router.get("/all", authMiddleware(["admin"]), getAllDocuments);
router.post("/payslip", authMiddleware(["admin"]), generatePaySlip);
router.get(
  "/download/:docId",
  authMiddleware(["employee", "stagiaire", "admin"]),
  downloadDocument
);
router.delete("/delete/:docId", authMiddleware(["admin"]), deleteDocument);

module.exports = router;
