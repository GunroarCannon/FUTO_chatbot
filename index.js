
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const marked = require('marked');

// Import context from JS file
const context = require('./context.js');

const app = express();
const PORT = process.env.PORT || 2000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Validate context on startup
if (!context.api_key || !context.system_prompt) {
  throw new Error('Invalid context configuration - missing required fields');
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

// Endpoint to handle chatbot requests
app.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Add user message to history
    conversationHistory.push(formatUserMessage(message));

    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model:// 'google/gemini-flash-experimental',//
        'deepseek/deepseek-r1:free',
        messages: [
          {
            role: "system",
            content: context.system_prompt
          },
          ...conversationHistory.slice(-6)
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

    const botResponse = response.data.choices[0].message.content;
    conversationHistory.push(formatBotResponse(botResponse));

    res.json({ 
      response: formatBotResponse(botResponse).content
    });

  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ 
      error: 'Failed to process request',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
