// server/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { google } from "googleapis";
import nodemailer from "nodemailer";
import session from "express-session";

dotenv.config();

const app = express();

// ---------------- MIDDLEWARE ---------------- //
app.use(cors({
  origin: process.env.FRONTEND_URL, // e.g. http://localhost:3000 or deployed frontend
  credentials: true,
}));

app.use(express.json());

// Trust proxy for cookies when deployed (Render/Heroku/Vercel backend)
app.set("trust proxy", 1);

app.use(session({
  secret: process.env.SESSION_SECRET || "supersecret",
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // only use https cookies in production
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  },
}));

// ---------------- SERVICES ---------------- //

// Groq SDK
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Google OAuth client
const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

// ---------------- ROUTES ---------------- //

// Test route
app.get("/", (req, res) => {
  res.send("🚀 MinuteMind Backend Running");
});

// Step 1: Google login redirect
app.get("/auth/google", (req, res) => {
  // allow frontend to specify redirect page (default: dashboard)
  const state = req.query.state || "dashboard";

  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/gmail.send"
    ],
    state, // pass through to callback
  });

  res.redirect(url);
});

app.get("/auth/google", (req, res) => {
  const state = req.query.state || "dashboard"; // string
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/gmail.send"
    ],
    state,
  });
  res.redirect(url);
});

// // Step 2: Google OAuth callback
// app.get("/auth/google/callback", async (req, res) => {
//   try {
//     const { code, state } = req.query;
//     const { tokens } = await oAuth2Client.getToken(code);
//     oAuth2Client.setCredentials(tokens);

//     // Fetch user profile
//     const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
//     const { data } = await oauth2.userinfo.get();

//     // Save user in session
//     req.session.user = {
//       email: data.email,
//       name: data.name,
//       picture: data.picture,
//       tokens,
//     };

//     console.log("✅ Logged in user:", data.email);

//     // Redirect back to frontend
//     const redirectPath = state || "dashboard";
//     res.redirect(`${process.env.FRONTEND_URL}/${redirectPath}`);
//   } catch (err) {
//     console.error("OAuth Error:", err);
//     res.status(500).send("Authentication Failed");
//   }
// });

// Logged-in user info
app.get("/api/me", (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ loggedIn: false });
  }
  res.json({
    loggedIn: true,
    email: req.session.user.email,
    name: req.session.user.name,
    picture: req.session.user.picture,
  });
});

// AI Summary route
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

// Email sending (using logged-in user)
app.post("/api/send-email", async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const { to, subject, content } = req.body;
    const { email, tokens } = req.session.user;

    if (!to || !subject || !content) {
      return res.status(400).json({ error: "Missing email fields" });
    }

    // Refresh with user tokens
    oAuth2Client.setCredentials(tokens);

    const accessTokenObj = await oAuth2Client.getAccessToken();
    const accessToken = accessTokenObj?.token;

    if (!accessToken) {
      return res.status(500).json({ error: "Failed to retrieve access token" });
    }

    // Nodemailer transporter with user’s Gmail
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: email,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: tokens.refresh_token,
        accessToken,
      },
    });

    const info = await transporter.sendMail({
      from: email,
      to,
      subject,
      text: content,
    });

    console.log("📧 Email sent:", info.response);
    res.json({ success: true });
  } catch (error) {
    console.error("Email error:", error);
    res.status(500).json({ error: "Failed to send email", details: error.toString() });
  }
});

// ---------------- START SERVER ---------------- //
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
