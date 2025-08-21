const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const Notification = require("../models/Notification");

const sendEmailAndNotify = async (to, subject, text, notificationData = {}) => {
  const mailOptions = {
    from: `"FLESK Consulting" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully to:", to);

    // Create notification if data is provided
    const { userId, type } = notificationData;
    if (userId && type) {
      const notification = new Notification({
        userId,
        message: text,
        type,
      });
      await notification.save();
      console.log("Notification saved:", notification._id);
    }
  } catch (error) {
    console.error("Email or notification sending failed:", {
      message: error.message,
      stack: error.stack,
      mailOptions,
      notificationData,
    });
    throw new Error("Failed to send email or save notification");
  }
};

module.exports = { sendEmailAndNotify };
