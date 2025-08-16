// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { google } from "googleapis";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Groq SDK
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Test Route
app.get("/", (req, res) => {
  res.send("Server is running ✅");
});

// AI Summary
app.post("/api/summarize", async (req, res) => {
  try {
    const { transcript, prompt } = req.body;

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant", 
      messages: [
        { role: "system", content: "You are a helpful meeting note summarizer." },
        { role: "user", content: `${prompt}\n\nTranscript:\n${transcript}` },
      ],
    });

    const summary = completion.choices[0]?.message?.content || "No summary generated.";
    res.json({ summary });
  } catch (error) {
    console.error("Summarization error:", error);
    res.status(500).json({ error: "Failed to summarize" });
  }
});
// Email Sending 
app.post("/api/send-email", async (req, res) => {
  try {
    const { to, subject, content } = req.body;

    if (!to || !subject || !content) {
      return res.status(400).json({ error: "Missing email fields" });
    }


    const oAuth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );

    oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

    
    const accessTokenObj = await oAuth2Client.getAccessToken();
    const accessToken = accessTokenObj?.token;

    if (!accessToken) {
      console.error("Failed to get access token:", accessTokenObj);
      return res.status(500).json({ error: "Failed to retrieve access token" });
    }

    // using Nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
        accessToken,
      },
    });

    // Send the email
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text: content,
    });

    console.log("Email sent:", info.response);
    res.json({ success: true });
  } catch (error) {
    console.error("Email error:", error);
    res.status(500).json({ error: "Failed to send email", details: error.toString() });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
