import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const LINKEDIN_EMAIL = process.env.LINKEDIN_EMAIL;
const LINKEDIN_PASSWORD = process.env.LINKEDIN_PASSWORD;

// Store analysis jobs
const jobs = new Map();

// Add error handling for uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

async function loginToLinkedIn(page) {
  try {
    console.log('Logging into LinkedIn...');
    await page.goto('https://www.linkedin.com/login', { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    
    console.log('Filling login form...');
    await page.waitForSelector('#username', { timeout: 30000 });
    await page.type('#username', LINKEDIN_EMAIL);
    await page.waitForSelector('#password', { timeout: 30000 });
    await page.type('#password', LINKEDIN_PASSWORD);
    
    console.log('Submitting login form...');
    await page.waitForSelector('button[type="submit"]', { timeout: 30000 });
    await page.click('button[type="submit"]');

    console.log('Waiting for navigation...');
    await page.waitForNavigation({ 
      waitUntil: 'networkidle0', 
      timeout: 60000 
    });
    
    const currentUrl = page.url();
    if (currentUrl.includes('login')) {
      throw new Error('Login failed - still on login page');
    }
    
    console.log('Login successful');
  } catch (err) {
    console.error('Login failed:', err.message);
    await page.screenshot({ path: 'login-error.png' });
    throw new Error('LinkedIn login failed: ' + err.message);
  }
}

async function fetchLinkedInProfile(url) {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    await loginToLinkedIn(page);

    console.log('Navigating to profile...');
    await page.goto(url, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });
    
    await page.waitForSelector('body', { timeout: 30000 });

    console.log('Extracting profile content...');
    const text = await page.evaluate(() => {
      return document.body.innerText;
    });

    await browser.close();
    console.log('Browser closed');

    return text.replace(/\s+/g, ' ').trim().slice(0, 10000);
  } catch (err) {
    console.error("❌ Error fetching LinkedIn profile:", err.message);
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.error('Error closing browser:', closeErr.message);
      }
    }
    throw err;
  }
}

// Handle form submission
app.post('/submit', async (req, res) => {
  const url = req.body.url;
  if (!url) {
    return res.redirect('/?error=Please enter a URL');
  }

  // Generate a unique job ID
  const jobId = uuidv4();
  
  // Initialize job status
  jobs.set(jobId, {
    status: 'processing',
    url: url,
    result: null,
    error: null
  });

  // Start the analysis in the background
  analyzeProfile(jobId, url);

  // Redirect to the loading page with the job ID
  res.redirect(`/redirect.html?jobId=${jobId}`);
});

// Check job status
app.get('/check-status', (req, res) => {
  const jobId = req.query.jobId;
  if (!jobId) {
    return res.status(400).json({ error: 'Job ID is required' });
  }

  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json({
    status: job.status,
    result: job.result,
    error: job.error
  });
});

// Get analysis results
app.get('/results', (req, res) => {
  const jobId = req.query.jobId;
  if (!jobId) {
    return res.status(400).json({ error: 'Job ID is required' });
  }

  const job = jobs.get(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status === 'completed') {
    res.json(job.result);
  } else if (job.status === 'failed') {
    res.status(500).json({ error: job.error });
  } else {
    res.status(202).json({ status: 'processing' });
  }
});

async function analyzeProfile(jobId, url) {
  try {
    console.log('Starting profile analysis for URL:', url);
    const profileText = await fetchLinkedInProfile(url);
    
    console.log('Sending to OpenAI...');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{
          role: "user",
          content: `Here is some content from a LinkedIn profile. Please provide a structured analysis in a table format:

          ${profileText}`
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API Error:', errorData);
      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    const analysis = data.choices[0].message.content;
    
    // Update job status
    jobs.set(jobId, {
      status: 'completed',
      url: url,
      result: { analysis },
      error: null
    });

    console.log('Analysis completed successfully');
  } catch (error) {
    console.error("Error:", error);
    // Update job status with error
    jobs.set(jobId, {
      status: 'failed',
      url: url,
      result: null,
      error: error.message
    });
  }
}

// Serve static files
app.use(express.static(__dirname));

// Add a simple test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

const PORT = 3001;
const server = app.listen(PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
  console.log(`Server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});
