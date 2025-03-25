const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const marked = require('marked');

function formatMessage(role, content) {
    return {
        role,
        content: marked.parse(content)
    };
}

const app = express();
const PORT = process.env.PORT || 2000;

// Middleware
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Load context from JSON file
const context = JSON.parse(fs.readFileSync('./context.json', 'utf8'));

// Chat history storage
let conversationHistory = [
    {
        role: "assistant",
        content: context.system_prompt
    }
];

// Format messages for display
function nformatMessage(role, content) {
    // Remove markdown formatting for cleaner display
    let cleanContent = content
        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
        .replace(/\*(.*?)\*/g, '$1')    // Remove italics
        .replace(/`(.*?)`/g, '$1');     // Remove code
    
    // Add proper line breaks
    cleanContent = cleanContent.replace(/\n/g, '<br>');
    
    return {
        role,
        content: cleanContent
    };
}

// Endpoint to handle chatbot requests
app.post('/chat', async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    // Add user message to history
    conversationHistory.push({
        role: "user",
        content: message
    });

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'deepseek/deepseek-r1:free',
                messages: [
                    {
                        role: "system",
                        content: context.system_prompt
                    },
                    ...conversationHistory.slice(-6) // Keep last 3 exchanges
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
        
        // Add assistant response to history
        conversationHistory.push({
            role: "assistant",
            content: botResponse
        });

        // Return formatted response
        res.json({ 
            response: formatMessage("assistant", botResponse).content
        });

    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Failed to get response',
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