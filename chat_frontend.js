
        const chatLog = document.getElementById('chat-log');
        const userInput = document.getElementById('user-input');
        const sendBtn = document.getElementById('send-btn');
        const loading = document.getElementById('loading');
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        let timeoutId;

        // Initial bot message
        chatLog.innerHTML = `
            <div class="bot-message">
                <strong>FUTO Assistant:</strong> Welcome to the Federal University of Technology, Owerri chatbot! 
                I can help with admissions, academics, campus life, and more. How may I assist you today?
            </div>
        `;
        // Function to send user message to the server
        async function sendMessage(retryMessage) {
            const message = retryMessage || userInput.value.trim();
            if (!message) return;

            if (!retryMessage) {
                chatLog.innerHTML += `<div class="user-message"><strong>You:</strong> ${message}</div>`;
                userInput.value = '';
            }

            const tempId = Date.now();
            chatLog.innerHTML += `
                <div id="${tempId}" class="bot-message">
                    <div class="loading-text">Generating response...</div>
                </div>
            `;

            loading.classList.remove('hidden');
            timeoutId = setTimeout(() => {
                const parentElement = document.getElementById(tempId);
                const loadingElement = parentElement.querySelector('.loading-text');
                if (loadingElement) {
                    loadingElement.textContent = "Checking network connection...";
                }
            }, 5000);

            try {
                const response = await fetch('/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ message }),
                });

                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }

                const data = await response.json();
                
                document.getElementById(tempId).outerHTML = `
                    <div class="bot-message">
                        <strong>FUTO Assistant:</strong> ${data.response}
                        <div class="message-actions">
                            <button class="action-btn" onclick="copyResponse(this)">
                                <i class="bi bi-clipboard"></i>
                            </button>
                            <button class="action-btn" onclick="retry('${encodeURIComponent(message)}')">
                                <i class="bi bi-arrow-clockwise"></i>
                            </button>
                        </div>
                    </div>
                `;
            } catch (error) {
                console.error('Error:', error);
                clearTimeout(timeoutId);
                document.getElementById(tempId).outerHTML = `
                    <div class="bot-message">
                        <strong>FUTO Assistant:</strong> ${error.message || "Sorry, I'm having trouble connecting. Please try again later."}
                        <div class="message-actions">
                            <button class="action-btn" onclick="copyResponse(this)">
                                <i class="bi bi-clipboard"></i>
                            </button>
                            <button class="action-btn" onclick="retry('${encodeURIComponent(message)}')">
                                <i class="bi bi-arrow-clockwise"></i>
                            </button>
                        </div>
                    </div>
                `;
            } finally {
                loading.classList.add('hidden');
                chatLog.scrollTop = chatLog.scrollHeight;
            }
        }

        // Retry function
        window.retry = function(encodedMessage) {
            const message = decodeURIComponent(encodedMessage);
            sendMessage(message);
        }

        // Copy response function
        window.copyResponse = function(button) {
            const messageElement = button.closest('.bot-message');
            const messageText = Array.from(messageElement.childNodes)
                .filter(node => node.nodeType === Node.TEXT_NODE)
                .map(node => node.textContent.trim())
                .join(' ');
            
            navigator.clipboard.writeText(messageText).then(() => {
                const originalIcon = button.innerHTML;
                button.innerHTML = '<i class="bi bi-check2"></i>';
                button.style.color = '#006400';
                setTimeout(() => {
                    button.innerHTML = originalIcon;
                    button.style.color = '';
                }, 2000);
            });
        }

        // Event listener for send button
        sendBtn.addEventListener('click', () => sendMessage());

        // Event listener for Enter key
        userInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
