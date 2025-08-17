import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import { google } from "googleapis";
import nodemailer from "nodemailer";
import session from "express-session";

dotenv.config();

const app = express();
const allowedOrigins = [
  "http://localhost:5317",
  "https://minutemind-frontend.onrender.com",
  "https://minutemind-frontend.vercel.app"
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
  })
);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

app.get("/", (req, res) => res.send("MinuteMind Backend Running"));

app.get("/auth/google", (req, res) => {
  const state = req.query.state || "dashboard";
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

app.get("/auth/google/callback", async (req, res) => {
  try {
    const { code } = req.query;
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
    const { data } = await oauth2.userinfo.get();

    req.session.user = {
      email: data.email,
      name: data.name,
      picture: data.picture,
      tokens,
    };

    const redirectURL =
      process.env.NODE_ENV === "production"
        ? `https://minutemind-frontend.onrender.com/dashboard`
        : `http://localhost:5317/dashboard`;

    res.redirect(redirectURL);
  } catch (error) {
    console.error(error);
    res.status(500).send("Authentication Failed");
  }
});

app.get("/api/me", (req, res) => {
  if (!req.session.user) return res.status(401).json({ loggedIn: false });
  const { email, name, picture } = req.session.user;
  res.json({ loggedIn: true, email, name, picture });
});

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
  } catch {
    res.status(500).json({ error: "Failed to summarize" });
  }
});

app.post("/api/send-email", async (req, res) => {
  try {
    if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });

    const { to, subject, content } = req.body;
    const { email, tokens } = req.session.user;

    if (!to || !subject || !content) return res.status(400).json({ error: "Missing email fields" });

    oAuth2Client.setCredentials(tokens);
    const accessTokenObj = await oAuth2Client.getAccessToken();
    const accessToken = accessTokenObj?.token;

    if (!accessToken) return res.status(500).json({ error: "Failed to retrieve access token" });

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

    await transporter.sendMail({ from: email, to, subject, text: content });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to send email" });
  }
});

app.listen(process.env.PORT, () => console.log(`Server running on http://localhost:${process.env.PORT}`));
