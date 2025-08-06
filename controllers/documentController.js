const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const puppeteer = require("puppeteer");
const cloudinary = require("cloudinary").v2;
const Employee = require("../models/Employee");
const Document = require("../models/Document");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const generateAttestation = async (req, res) => {
  try {
    const { employeeId, legalInfo } = req.body;

    // Validate employee
    const employee = await Employee.findById(employeeId).select(
      "name role position internshipDetails"
    );
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const docName = `attestation-${employeeId}-${Date.now()}`;
    const documentsDir = path
      .resolve(__dirname, "../documents")
      .replace(/\\/g, "/");
    const pdfFile = path.join(documentsDir, `${docName}.pdf`);

    // Ensure documents directory exists
    fs.mkdirSync(documentsDir, { recursive: true });

    // Create HTML template for professional PDF
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Times New Roman', serif; margin: 40px; line-height: 1.6; color: #333; }
          .container { max-width: 800px; margin: 0 auto; padding: 20px; border: 2px solid #000; background: #f9f9f9; }
          .header { text-align: center; margin-bottom: 40px; }
          .header h1 { font-size: 28px; font-weight: bold; color: #000; }
          .content { font-size: 16px; text-align: justify; }
          .signature { margin-top: 60px; text-align: right; }
          .signature-line { border-top: 1px solid #000; width: 200px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Attestation of Work/Internship</h1>
            <p>FLESK Consulting</p>
          </div>
          <div class="content">
            <p>This is to certify that <strong>${
              employee.name
            }</strong> has been employed as a <strong>${
      employee.role === "stagiaire"
        ? "Stagiaire"
        : employee.position || "Employee"
    }</strong> at FLESK Consulting.</p>
            ${
              employee.role === "stagiaire" && employee.internshipDetails
                ? `
              <p><strong>Internship Period:</strong> ${
                employee.internshipDetails.startDate
                  ? new Date(
                      employee.internshipDetails.startDate
                    ).toLocaleDateString()
                  : "N/A"
              } to ${
                    employee.internshipDetails.endDate
                      ? new Date(
                          employee.internshipDetails.endDate
                        ).toLocaleDateString()
                      : "N/A"
                  }</p>
              <p><strong>Supervisor:</strong> ${
                employee.internshipDetails.supervisor || "N/A"
              }</p>
              <p><strong>Objectives:</strong> ${
                employee.internshipDetails.objectives || "N/A"
              }</p>
            `
                : ""
            }
            <p><strong>Legal Information:</strong> ${
              legalInfo ||
              "FLESK Consulting, 123 Business St, Monastir, Moknine"
            }</p>
          </div>
          <div class="signature">
            <p>Authorized Signature</p>
            <div class="signature-line"></div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Launch Puppeteer with system Chromium
    const browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
      ],
      executablePath:
        process.env.NODE_ENV === "production"
          ? "/usr/bin/chromium-browser"
          : undefined,
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "networkidle0" });
    await page.pdf({
      path: pdfFile,
      format: "A4",
      margin: { top: "20mm", right: "20mm", bottom: "20mm", left: "20mm" },
      printBackground: true,
    });
    await browser.close();

    // Verify PDF exists
    if (!fs.existsSync(pdfFile)) {
      throw new Error("PDF file was not generated");
    }

    // Upload PDF to Cloudinary
    const cloudinaryResult = await cloudinary.uploader.upload(pdfFile, {
      resource_type: "raw",
      public_id: `flesk/documents/${docName}`,
      format: "pdf",
    });

    // Clean up temporary PDF file
    if (fs.existsSync(pdfFile)) {
      fs.unlinkSync(pdfFile);
    }

    // Save document metadata with Cloudinary URL
    const document = new Document({
      employee: employeeId,
      type: "attestation",
      fileUrl: cloudinaryResult.secure_url,
      legalInfo,
    });
    await document.save();

    res
      .status(201)
      .json({ message: "Attestation generated successfully", document });
  } catch (error) {
    console.error("Generate attestation error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getDocuments = async (req, res) => {
  try {
    const employeeId = req.params.employeeId;
    if (!mongoose.Types.ObjectId.isValid(employeeId)) {
      return res.status(400).json({ message: "Invalid employee ID format" });
    }
    console.log("Querying documents for employeeId:", employeeId);
    const documents = await Document.find({
      employee: new mongoose.Types.ObjectId(employeeId),
    }).populate("employee", "name");
    if (!documents.length) {
      return res
        .status(404)
        .json({ message: "No documents found for this employee" });
    }
    res.status(200).json(documents);
  } catch (error) {
    console.error("Get documents error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllAttestations = async (req, res) => {
  try {
    console.log("Querying all attestations");
    const documents = await Document.find({ type: "attestation" }).populate(
      "employee",
      "name"
    );
    if (!documents.length) {
      return res.status(404).json({ message: "No attestations found" });
    }
    res.status(200).json(documents);
  } catch (error) {
    console.error("Get all attestations error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { generateAttestation, getDocuments, getAllAttestations };
