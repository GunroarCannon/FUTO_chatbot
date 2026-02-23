# FUTO Chatbot
Chatbot to be theoretically used on the official site of the Federal University of Technology Owerri.

The FUTO Assistant is a specialized, context-aware chatbot designed to provide accurate and up-to-date information regarding the Federal University of Technology, Owerri (FUTO). It serves as the official digital guide for prospective and current students, offering detailed information on academic programs, departmental structure, and campus services.

The Key Features

FUTO Academic Programs: Contains an internal, definitive database of all Schools and Departments (e.g., SICT, SEET, SAAT) to ensure accurate program information, overriding general search results when academic structure is queried.

Generative AI Core: Powered by the Gemini 2.5 Flash model for fast, accurate, and conversational responses.

Search Grounding: Integrates Google Search to access real-time, time-sensitive information such as current cut-off marks, registration deadlines, and admission requirements.

Context Injection: Utilizes a robust system prompt to enforce a specific identity and behavioral protocol, ensuring the assistant adheres strictly to official FUTO information and maintains a consistent tone.

Single Source of Truth: Implements a Hierarchy of Authority to resolve conflicting data, prioritizing the pre-defined internal academic structure over external search results.

Live Demo

You can interact with the live version of the FUTO Assistant here:

https://futo-chatbot-server.onrender.com

Technology Stack

The application is built using a modern, efficient, and secure stack:

Component

Technology

Role

Frontend

HTML, CSS, JavaScript

Provides the user interface for chat interaction.

Backend

Node.js / Express

Serves the static index.html file and handles the API requests.

AI Model

Google Gemini 2.5 Flash

The primary large language model for generating responses.

API

Generative Language API

Handles all interactions with the Gemini model, including search grounding.

Deployment

Render

Hosts the full-stack Node.js application.

📐 Architecture Note

The entire web application operates from a single Node.js server (index.js). This server is responsible for two primary functions:

Static Serving: Delivering the frontend client (index.html).

API Endpoint: Hosting the /chat endpoint, which securely handles user queries, injects the necessary FUTO context, executes the search-grounded Gemini API calls, and returns the response to the client.

⚙️ Development Setup

To run this project locally, you will need a Gemini API Key.

Clone the repository:

git clone [Your Repository URL]
cd futo-assistant


Install dependencies:

npm install


Configure Environment:
Create a file named .env in the root directory and add your API key:

GEMINI_API_KEY="YOUR_API_KEY_HERE"


Run the server:

node index.js


