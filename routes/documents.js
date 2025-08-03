const express = require("express");
const router = express.Router();
const {
  generateAttestation,
  getDocuments,
  getAllAttestations,
} = require("../controllers/documentController");

router.post("/attestation", generateAttestation);
router.get("/employee/:employeeId", getDocuments);
router.get("/attestations", getAllAttestations);

module.exports = router;
