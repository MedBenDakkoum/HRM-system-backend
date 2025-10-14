const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;
const cookieParser = require("cookie-parser");
const fs = require("fs");

dotenv.config({ path: "./.env" });

console.log("Environment Variables:", {
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGO_URI,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET
    ? "[REDACTED]"
    : undefined,
});

try {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log("Cloudinary configured successfully in index.js");
} catch (error) {
  console.error("Cloudinary configuration error in index.js:", error.message);
}

const app = express();
const PORT = process.env.PORT || 10000;

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? [
            "https://smart-hrm-system.vercel.app",
            "https://hrm-system-git-test-ec63dbf-mohamed-s-projects-62a99681.vercel.app",
          ]
        : "http://localhost:5173",
    credentials: true,
    optionsSuccessStatus: 200,
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
      "Cookie",
    ],
    exposedHeaders: ["Set-Cookie"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  })
);
app.use(express.json());
app.use(cookieParser());

// Add mobile-friendly headers for cross-origin cookies
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Origin", req.headers.origin);
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie"
  );
  next();
});

const modelsPath = path.join(__dirname, "public", "models");
console.log("Models path resolved to:", modelsPath);
if (!fs.existsSync(modelsPath)) {
  console.error("Models directory does not exist at:", modelsPath);
  fs.mkdirSync(modelsPath, { recursive: true });
  console.log("Created models directory at:", modelsPath);
} else {
  console.log("Checking permissions for:", modelsPath);
  fs.accessSync(modelsPath, fs.constants.R_OK);
  console.log("Models directory is readable, serving files...");
  app.use("/models", express.static(modelsPath));
}

app.use("/api/employees", require("./routes/employees"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/documents", require("./routes/documents"));
app.use("/api/leaves", require("./routes/leaves"));
app.get("/models/test", (req, res) => {
  res.send("Models folder is accessible");
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.get("/", (req, res) => {
  res.send("FLESK Backend is running");
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
