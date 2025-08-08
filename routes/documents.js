const express = require("express");
const router = express.Router();
const {
  generateAttestation,
  getDocuments,
  getAllAttestations,
} = require("../controllers/documentController");
const mongoose = require("mongoose");
const Document = require("../models/Document");

router.post("/attestation", generateAttestation);
router.get("/employee/:employeeId", getDocuments);
router.get("/attestations", getAllAttestations);
router.get("/download/:docId", async (req, res) => {
  try {
    const docId = req.params.docId;
    if (!mongoose.Types.ObjectId.isValid(docId)) {
      return res.status(400).json({ message: "Invalid document ID format" });
    }
    const document = await Document.findById(docId);
    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }
    res.redirect(document.fileUrl);
  } catch (error) {
    console.error("Download document error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
