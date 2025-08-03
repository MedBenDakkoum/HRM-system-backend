const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const util = require("util");
const mongoose = require("mongoose"); // Add mongoose import
const execPromise = util.promisify(exec);
const Employee = require("../models/Employee");
const Document = require("../models/Document");

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
    const texFile = path.join(documentsDir, `${docName}.tex`);
    const pdfFile = path.join(documentsDir, `${docName}.pdf`);

    // Ensure documents directory exists
    fs.mkdirSync(documentsDir, { recursive: true });

    // Read LaTeX template
    const template = fs.readFileSync(
      path.join(__dirname, "../templates/attestation.tex"),
      "utf8"
    );

    // Replace placeholders
    let texContent = template
      .replace("EMPLOYEE_NAME", employee.name.replace(/[&%$#_{}]/g, "\\$&"))
      .replace(
        "POSITION",
        employee.role === "stagiaire"
          ? "Stagiaire"
          : employee.position || "Employee"
      )
      .replace(
        "LEGAL_INFO",
        (
          legalInfo || "FLESK Consulting, 123 Business St, City, Country"
        ).replace(/[&%$#_{}]/g, "\\$&")
      );

    if (employee.role === "stagiaire" && employee.internshipDetails) {
      texContent = texContent
        .replace(
          "START_DATE",
          employee.internshipDetails.startDate
            ? new Date(
                employee.internshipDetails.startDate
              ).toLocaleDateString()
            : "N/A"
        )
        .replace(
          "END_DATE",
          employee.internshipDetails.endDate
            ? new Date(employee.internshipDetails.endDate).toLocaleDateString()
            : "N/A"
        )
        .replace(
          "SUPERVISOR",
          (employee.internshipDetails.supervisor || "N/A").replace(
            /[&%$#_{}]/g,
            "\\$&"
          )
        )
        .replace(
          "OBJECTIVES",
          (employee.internshipDetails.objectives || "N/A").replace(
            /[&%$#_{}]/g,
            "\\$&"
          )
        )
        .replace("ROLE", "stagiaire");
    } else {
      texContent = texContent.replace("ROLE", "employee");
    }

    // Write LaTeX file
    fs.writeFileSync(texFile, texContent);

    // Compile LaTeX to PDF using Docker
    const dockerCommand = `docker run --rm -v "${documentsDir}:/data" blang/latex:ubuntu pdflatex -output-directory=/data /data/${docName}.tex`;
    try {
      const { stdout, stderr } = await execPromise(dockerCommand);
      console.log("Docker stdout:", stdout);
      if (stderr && !stderr.includes("Output written")) {
        throw new Error(`LaTeX compilation error: ${stderr}`);
      }
    } catch (error) {
      console.error("Docker execution error:", error);
      throw new Error(`Failed to compile LaTeX: ${error.message}`);
    }

    // Verify PDF exists
    if (!fs.existsSync(pdfFile)) {
      throw new Error("PDF file was not generated");
    }

    // Clean up temporary LaTeX files
    ["aux", "log", "out"].forEach((ext) => {
      const tempFile = path.join(documentsDir, `${docName}.${ext}`);
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    });

    // Save document metadata
    const document = new Document({
      employee: employeeId,
      type: "attestation",
      filePath: pdfFile,
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
    // Validate ObjectId
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
