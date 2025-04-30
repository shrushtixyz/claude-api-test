# LinkAssist - LinkedIn Profile Analyzer

A modern web application that analyzes LinkedIn profiles using AI to provide detailed feedback and improvement suggestions.

## Features

- Beautiful dark-themed UI
- Real-time profile analysis
- Detailed feedback on different profile sections
- Score-based evaluation system
- Mobile-responsive design

## Setup

1. Clone the repository:
```bash
git clone [your-repo-url]
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```
OPENAI_API_KEY=your_openai_api_key
LINKEDIN_EMAIL=your_linkedin_email
LINKEDIN_PASSWORD=your_linkedin_password
```

4. Start the server:
```bash
npm start
```

The application will be available at `http://localhost:3001`

## Tech Stack

- Node.js
- Express.js
- OpenAI GPT-4 API
- Puppeteer
- Modern HTML/CSS/JavaScript

## Security Note

Make sure to keep your `.env` file secure and never commit it to the repository. The `.gitignore` file is configured to exclude sensitive information. 