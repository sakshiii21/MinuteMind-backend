# MinuteMind backend

Express API used by the [MinuteMind frontend](https://github.com/sakshiii21/MinuteMind). It provides a Groq-backed transcript summarization endpoint and an email endpoint using Gmail OAuth credentials.

## API

- `GET /` — basic server status response.
- `POST /api/summarize` — accepts a JSON body with `transcript` and `prompt`; returns a summary.
- `POST /api/send-email` — accepts `to`, `subject`, and `content`; sends the supplied content by email.

## Requirements

Node.js and npm, a Groq API key, and Google OAuth credentials with Gmail access.

## Configure

Create `.env` in this directory. Use the names below and keep the real values private:

```dotenv
GROQ_API_KEY=your_groq_api_key
GMAIL_CLIENT_ID=your_google_oauth_client_id
GMAIL_CLIENT_SECRET=your_google_oauth_client_secret
GMAIL_REDIRECT_URI=http://localhost
GMAIL_REFRESH_TOKEN=your_google_oauth_refresh_token
EMAIL_USER=you@example.com
PORT=5000
```

`GMAIL_REDIRECT_URI` must match the OAuth client configuration used to obtain the refresh token. The server reads the refresh token directly; it does not implement a browser OAuth sign-in flow.

## Run

```bash
git clone https://github.com/sakshiii21/MinuteMind-backend.git
cd MinuteMind-backend
npm install
node index.js
```

The API listens on the configured `PORT`, or port `5000` when `PORT` is unset.

## Security and limitations

- Do not expose backend credentials through the Vite frontend or commit `.env`.
- The current CORS middleware is open to all origins; restrict it to the deployed frontend before using the service beyond a personal demo.
- No automated test suite is configured in this repository yet.
