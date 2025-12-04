// CORE DEPENDENCIES
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const marked = require('marked'); // Keep for parsing system prompt/bot responses
const cors = require('cors');

// GEMINI NATIVE SDK (Use @google/genai for best results)
// Assuming you have installed: npm install @google/genai
const { GoogleGenAI } = require("@google/genai"); 

// CONTEXT & CONFIG
const context = require('./context.js');

// --- 1. GEMINI API INITIALIZATION & LOGIC MODULE ---
// Use the new, cleaner GoogleGenAI constructor
const ai = new GoogleGenAI({ apiKey: context.gemini_api_key });

/**
 * Calls the Gemini API, enabling Google Search Grounding.
 * @param {Array} history - The full conversation history array.
 * @returns {Promise<string>} The bot's text response.
 */
async function askGeminiWithSearch(history) {
    const generationConfig = {
        // Set temperature low for factual consistency (0.0 to 2.0)
        temperature: 0.2, 
        topP: 0.9, 
        topK: 16, 
    };

    // The Gemini API prefers contents/messages without the role formatting of the OpenAI SDK.
    // We convert the history array into the contents array required by the Gemini SDK.
    const contents = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role, // Convert 'assistant' to 'model'
        parts: [{ text: msg.content }]
    }));

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // Efficient model for search/chat
            contents: contents,
            config: {
                generationConfig: generationConfig,
                tools: [
                    { googleSearch: {} } // Enable free search grounding
                ],
            }
        });

        const botText = response.text.trim();
        
        // Optional: Log search queries for debugging consistency
        const queries = response.candidates[0]?.groundingMetadata?.webSearchQueries;
        if (queries && queries.length > 0) {
            console.log('--- Search Queries Used ---');
            console.log(queries);
        } else {
            console.log('--- No Search Used ---');
        }

        return botText;

    } catch (err) {
        console.error('Gemini API Error:', err.message);
        // Throw a user-friendly error
        throw new Error('AI Service failed to respond. Check API Key/Network.');
    }
}

// --- 2. SERVER & MIDDLEWARE SETUP ---

const app = express();
const PORT = process.env.PORT || 2000;

// Remove redundant/confusing OpenAI initialization
// const chatClient = new OpenAI({...}); 

//not needed for simple chatbot
if (false) {
    // Enhanced Middleware Stack
    app.use(helmet({contentSecurityPolicy: {
        directives: {
          // CRITICAL FIX: Explicitly allow inline event handlers
          // by setting 'unsafe-inline' on the script-src-attr directive.
          'script-src-attr': ["'unsafe-inline'"],
    
          // If you have a primary script-src directive, ensure it's still present:
          'script-src': ["'self'"], 
        },
        // Set to false if using a <meta> tag CSP in HTML,
        // but the header is usually preferred.
        reportOnly: false, 
      },
    }));
}
app.use(cors());
app.use(bodyParser.json({ limit: '10kb' })); 
app.use(express.static(__dirname, { maxAge: '1h' }));

// Environment Validation
const validateConfig = () => {
    if (!context?.gemini_api_key) throw new Error('Missing Gemini API key in context');
    if (!context?.system_prompt) throw new Error('Missing system prompt in context');
};

// Rate Limiting Setup
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100 
});
app.use('/chat', limiter);

// Startup Validation
try {
    validateConfig();
} catch (err) {
    console.error('Configuration Error:', err.message);
    process.exit(1);
}

// Store conversations per browser
const conversations = new Map();

// Generate a unique browser key
function getBrowserKey(req) {
    const userAgent = req.headers['user-agent'] || 'unknown';
    const acceptLanguage = req.headers['accept-language'] || 'unknown';
    const ip = req.ip; 
    const timezone = req.body.timezone || 'unknown';

    return crypto
        .createHash('sha256')
        .update(`${userAgent}_${acceptLanguage}_${ip}_${timezone}`)
        .digest('hex');
}

// Message formatting functions (adapted for native Gemini SDK)
function formatMessage(role, content) {
    // The Gemini SDK uses 'user' and 'model' for roles in contents array
    const geminiRole = role;// role === 'system' ? 'user' : role; // System prompt is often treated as initial user context
    return {
        role: geminiRole,
        content: content // Keep content as raw text
    };
}

// --- 3. CHAT ENDPOINT INTEGRATION ---

app.post('/chat', async (req, res) => {
    console.log('Received /chat request');
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: 'Message is required' });

        const browserKey = getBrowserKey(req);
        // Start history with the system prompt/initial context
        let conversationHistory = conversations.get(browserKey) || [
            formatMessage('assistant', context.system_prompt) 
        ];

        // Add user message
        conversationHistory.push(formatMessage('user', message));
        console.log(`History length: ${conversationHistory.length}`);

        // **CRITICAL CHANGE: Call the native Gemini function**
        // Send the last 8 messages (including system prompt) for context
        const botResponseText = await askGeminiWithSearch(conversationHistory.slice(-8)); 
        
        // Store updated history
        conversationHistory.push(formatMessage('model', botResponseText)); // Store 'model' response
        conversations.set(browserKey, conversationHistory);
        
        // Use marked to parse the final output for the frontend
        res.json({ response: marked.parse(botResponseText) }); 

    } catch (error) {
        console.error('Chat Error:', error);
        res.status(500).json({ 
            error: 'Failed to process request',
            details: error.message || 'Unknown error'
        });
    }
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Server Start
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Process management (Good practice to keep this)
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});
