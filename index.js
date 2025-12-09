// CORE DEPENDENCIES
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const marked = require('marked'); 
const cors = require('cors');

// GEMINI NATIVE SDK
const { GoogleGenAI } = require("@google/genai"); 

// CONTEXT & CONFIG
const context = require('./context.js');

const FALLBACK_KEYS = [
    context.gemini_api_key,
    context.gemini_api_key_2, 
   // context.gemini_api_key_3
];
let currentKeyIndex = 0;
const AI_FOR_KEYS = []
for (let i = 0; i < FALLBACK_KEYS.length; i++) {
    // AI_FOR_KEYS.push(new GoogleGenAI({ apiKey: FALLBACK_KEYS[i] }));
}

// --- NEW: GENERIC RESPONSE & FUZZY MATCHING LOGIC ---

// Configuration for generic responses
const GENERIC_RESPONSES = {
    greetings: {
        texts: ["hey", "hello", "hi",
             "good morning", "good evening", 
             "how are you", "hmmm", "yo", "greetings", 
             "sup", "what's up", "good afternoon", 
             "morning", "evening", "afternoon", 
             "hi there", "hello there", "hey there", 
             "hiya", "howdy", "g'day", "salutations",
             "hiya", "hiya!", "hey!", "hello!", "hi!", 
             "greetings!", "good day", "good day!",
             "how's it going", "how's everything", 
             "how's life", "how are things",
             "what's new", "what's happening",
             "what's going on", "long time no see"],
        replies: [
            "Hello! I am the FUTO Assistant, ready to provide information about the Federal University of Technology, Owerri. How can I assist you?", 
            "Hey there! As the official digital representative of FUTO, I'm here to answer your questions about academics and campus life.",
            "Welcome! Ask me anything about FUTO."
        ]
    },
    thanks: {
        texts: ["thank you", "thanks", "ty", "okay thanks", "thanks a lot",
             "thank you very much", "many thanks", "thanks so much",
             "thank you so much", "thx", "thnx", "thank u",
             "much appreciated", "i appreciate it", "grateful",
             "thanks a ton", "thanks a million", "thanks heaps",
             "cheers", "merci", "danke", "obrigado", "okay"],
        replies: [
            "You're very welcome! Is there anything else I can help you with regarding FUTO?",
            "My pleasure!",
            "Happy to help!"
        ]
    },
    // Add more categories here (e.g., goodbyes, general affirmation)
};

const SIMILARITY_THRESHOLD = 0.8;
const LOW_EFFORT_MAX_LENGTH = 2; // Maximum length for a low-effort post (e.g., 'd', 'k', 'lol')

/**
 * Calculates a basic Jaccard-like word overlap similarity score (0 to 1).
 * NOTE: For true 80% accuracy on short strings, a dedicated library like 
 * `string-similarity` is best, but this simple version meets the intent 
 * without adding external dependencies beyond core Node modules.
 * @param {string} s1 
 * @param {string} s2 
 * @returns {number} Similarity score between 0 and 1.
 */
function calculateSimilarity(s1, s2) {
    const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    const words1 = normalize(s1);
    const words2 = normalize(s2);
    
    if (words1.length === 0 || words2.length === 0) {
        // For single-word phrases, use length ratio for closeness simulation
        const len1 = s1.length;
        const len2 = s2.length;
        if (len1 === 0 || len2 === 0) return 0;
        
        // This is a weak substitute for actual fuzzy matching
        return Math.min(len1, len2) / Math.max(len1, len2);
    }

    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    // Calculate intersection and union of word sets
    let intersection = 0;
    for (const word of set1) {
        if (set2.has(word)) {
            intersection++;
        }
    }
    const union = set1.size + set2.size - intersection;
    
    // Jaccard Index
    return union > 0 ? intersection / union : 0;
}

/**
 * Checks if the message matches a generic phrase or is a low-effort post.
 * @param {string} message 
 * @returns {string | null} A generic reply or null if no match found.
 */
function getGenericResponse(message) {
    const trimmedMessage = message.trim();

    // 1. Low Effort Post Check (Non-text sensitive, based on length)
    if (trimmedMessage.length <= LOW_EFFORT_MAX_LENGTH && !trimmedMessage.includes(' ')) {
        // Only return if it's not a common useful abbreviation like 'BSc' or 'HND'
        // For simplicity, we assume short, single-word inputs are low effort
        console.log(`Matched Low Effort Post: ${trimmedMessage}`);
        const lowEffortReplies = [
            "I'm here to provide detailed information about FUTO. Could you tell me what you're interested in?",
            "If you have a question about FUTO, please provide a few more details so I can assist you better.",
            "I need a little more input to give you a helpful response!"
        ];
        return lowEffortReplies[Math.floor(Math.random() * lowEffortReplies.length)];
    }

    // 2. Generic Phrase Fuzzy Match Check
    for (const category in GENERIC_RESPONSES) {
        const { texts, replies } = GENERIC_RESPONSES[category];
        for (const genericText of texts) {
            const similarity = calculateSimilarity(trimmedMessage, genericText);
            
            if (similarity >= SIMILARITY_THRESHOLD) {
                console.log(`Matched Generic Phrase (${category}): "${trimmedMessage}" vs "${genericText}" with similarity ${similarity.toFixed(2)}`);
                // Return a random reply from the matched category
                return replies[Math.floor(Math.random() * replies.length)];
            }
        }
    }

    return null; // No generic match
}

// --- END NEW LOGIC ---

/**
 * Calls the Gemini API, enabling Google Search Grounding, with key rotation and retry logic.
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

    // The Gemini API prefers contents/messages without the role formatting
    const contents = history.map(msg => ({
        // Convert 'assistant' to 'model' for the Gemini SDK
        role: msg.role === 'assistant' ? 'model' : msg.role, 
        parts: [{ text: msg.content }]
    }));

    const MAX_ATTEMPTS = FALLBACK_KEYS.length; 
    let attempts = 0;
    let model = "gemini-2.5-flash"; // Default model
    let switched = false;

    while (attempts < MAX_ATTEMPTS+1) {
        attempts++;
        if (attempts >= MAX_ATTEMPTS && !switched) {
            model = "gemini-2.5-flash-lite";
            attempts = 1;
            currentKeyIndex = 0;
            console.log("Switching to gemini-2.5-flash-lite model");
        } // Efficient model for search/chat

        const apiKey = FALLBACK_KEYS[currentKeyIndex];
        const ai_client = new GoogleGenAI({ apiKey: FALLBACK_KEYS[currentKeyIndex] })//AI_FOR_KEYS[currentKeyIndex];
        
        
        try {
            console.log(`Attempt ${attempts}: Using key index ${currentKeyIndex + 1}/${MAX_ATTEMPTS}`);
            
            const response = await ai_client.models.generateContent({
                model: model, // Efficient model for search/chat
                contents: contents,
                config: {
                    generationConfig: generationConfig,
                    tools: [
                        { googleSearch: {} } // Enable free search grounding
                    ],
                }
            });

            const botText = response.text.trim();
            
            // Log search queries (optional)
            const queries = response.candidates[0]?.groundingMetadata?.webSearchQueries;
            if (queries && queries.length > 0) {
                console.log('--- Search Queries Used ---');
                console.log(queries);
            } else {
                console.log('--- No Search Used ---');
            }

            return botText;

        } catch (err) {
            
            // Check for the specific RESOURCE_EXHAUSTED error (HTTP 429)
            if (err.message.includes('429') && attempts < MAX_ATTEMPTS) {
                console.log('error message:', err.message);
                console.warn(`Quota exhausted for Key ${currentKeyIndex + 1}. Attempting to switch.`);
                
                // Rotate to the next key index
                currentKeyIndex = (currentKeyIndex + 1) % FALLBACK_KEYS.length;
                
                // Pause briefly before retrying (exponential backoff is better, but this is simpler)
                await new Promise(resolve => setTimeout(resolve, 1000)); 
                
                // Continue the loop to retry with the new key
                continue; 
            } else {
                // If it's a fatal error (e.g., invalid key, network, or last key failed)
                console.error(`Gemini API Fatal Error (Attempt ${attempts}):`, err.message);
                throw new Error('AI Service failed after exhausting all available API keys.');
            }
        }
    }
    
    // Fallback if the while loop somehow finishes without success
    throw new Error('All configured API keys are exhausted.');
}

// --- 2. SERVER & MIDDLEWARE SETUP ---

const app = express();
const PORT = process.env.PORT || 2000;

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
    const geminiRole = role;
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

        // ** NEW LOGIC: Check for Generic Response first **
        const genericResponseText = getGenericResponse(message);
        if (genericResponseText) {
            // Bypass Gemini API call and send the pre-defined response
            return res.json({ response: marked.parse(genericResponseText) }); 
        }

        const browserKey = getBrowserKey(req);
        // Start history with the system prompt/initial context
        let conversationHistory = conversations.get(browserKey) || [
            formatMessage('assistant', context.system_prompt) 
        ];

        // Add user message
        conversationHistory.push(formatMessage('user', message));
        console.log(`History length: ${conversationHistory.length}`);

        const MAX_RECENT_MESSAGES = 7; 
    
        // a. Get all history *except* the system prompt (which is conversationHistory[0])
        const recentMessages = conversationHistory.slice(1);
    
        // b. Slice the rest of the history to only include the last MAX_RECENT_MESSAGES
        const limitedRecentHistory = recentMessages.slice(-MAX_RECENT_MESSAGES);
    
        // c. Reconstruct the final list to send: [System Prompt] + [Recent Messages]
        const historyToSend = [
            conversationHistory[0], // ALWAYS include the system prompt
            ...limitedRecentHistory // Spread the limited recent history
        ];

        // Call the native Gemini function
        const botResponseText = await askGeminiWithSearch(historyToSend); 
        
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

// Liveness Check
app.get('/healthz', (req, res) => {
    res.status(200).send({ status: 'up' });
});

// Server Start
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Process management (Good practice to keep this)
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});