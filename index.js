

// Middleware stuff
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const marked = require('marked');
const crypto = require('crypto');
const helmet = require('helmet'); // Added Security middleware

const context = require('./context.js');

const app = express();
const PORT = process.env.PORT || 2000;

// Enhanced Middleware Stack
app.use(helmet()); // Security headers
app.use(bodyParser.json({ limit: '10kb' })); // Prevent large payloads
app.use(express.static(__dirname, {
  maxAge: '1h', // Client-side caching
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Environment Validation
const validateConfig = () => {
  if (!context?.api_key) throw new Error('Missing API key in context');
  if (!context?.system_prompt) throw new Error('Missing system prompt in context');
  if (context.api_key.length < 20) { // Basic key length check
    console.warn('API key appears unusually short');
  }
};

// Rate Limiting Setup (Example using express-rate-limit)
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // Limit each IP to 100 requests per window
});
app.use('/chat', limiter);

// Startup Validation
try {
  validateConfig();
} catch (err) {
  console.error('Configuration Error:', err.message);
  process.exit(1); // Fail fast on bad config
}


if (!context.api_key || !context.system_prompt) {
  throw new Error('Invalid context configuration');
}
// Chat history storage
let conversationHistory = [
  formatSystemMessage(context.system_prompt)
];

// Message formatting functions
function formatSystemMessage(content) {
  return {
    role: "assistant",
    content: marked.parse(content)
  };
}

function formatUserMessage(content) {
  return {
    role: "user",
    content: content
  };
}

function formatBotResponse(content) {
  return {
    role: "assistant",
    content: marked.parse(content)
  };
}


// Store conversations per browser
const conversations = new Map();

// Generate a unique browser key
function getBrowserKey(req) {
  const userAgent = req.headers['user-agent'] || 'unknown';
  const acceptLanguage = req.headers['accept-language'] || 'unknown';
  const ip = req.ip; // Requires trust proxy if behind NGINX
  
  // Optional: Include timezone if sent from frontend
  const timezone = req.body.timezone || 'unknown';

  // Create a unique hash
  return crypto
    .createHash('sha256')
    .update(`${userAgent}_${acceptLanguage}_${ip}_${timezone}`)
    .digest('hex');
}

// Endpoint to handle chat
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    // Get or create conversation history for this browser
    const browserKey = getBrowserKey(req);
    let conversationHistory = conversations.get(browserKey) || [
      formatSystemMessage(context.system_prompt)
    ];

    // Add user message
    conversationHistory.push(formatUserMessage(message));

    // Call OpenRouter
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'deepseek/deepseek-r1:free',
        messages: [
          { role: "system", content: context.system_prompt },
          ...conversationHistory.slice(-6) // Last 6 messages
        ],
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${context.api_key}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Store updated history
    const botResponse = response.data.choices[0].message.content;
    conversationHistory.push(formatBotResponse(botResponse));
    conversations.set(browserKey, conversationHistory);

    res.json({ response: formatBotResponse(botResponse).content });

  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ 
      error: 'Failed to process request',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

// Error handling middleware (add at the end)
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Process management
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
