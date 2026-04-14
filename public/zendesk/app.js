/**
 * Zendesk Sidebar App - Client Side Logic (Standard Event-Driven Pattern)
 * 
 * [주의] 본 코드는 샘플 목적이며, 타겟 URL은 상황에 맞게 대체하여 사용하십시오.
 */

const client = ZAFClient.init();
const container = document.getElementById('suggestions-container');
const statusBadge = document.getElementById('status-badge');
let socket;

statusBadge.textContent = 'Connecting...';
statusBadge.style.backgroundColor = '#f59f00';

client.on('app.registered', () => {
  console.log('[ZAF Client] Initialized successfully. Connecting to UI Connector...');

  const connectorUrl = 'https://<your-ui-connector-url>';
  console.log(`[Socket.IO] Connecting to ${connectorUrl}`);

  fetch(`${connectorUrl}/register`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer <your-custom-auth-token>' }
  }).then(res => {
    if (res.ok) return res.json();
    throw new Error('Auth negotiation bypassed');
  }).then(data => {
    initializeSocket(data.token);
  }).catch(() => {
    initializeSocket(null);
  });

  function initializeSocket(token) {
    const opts = {};
    if (token) opts.auth = { token };
    
    socket = io(connectorUrl, opts);

    socket.on('connect', () => {
      console.log("[Socket.IO] Connection established.");
      statusBadge.textContent = 'Connected (Real-time)';
      statusBadge.style.backgroundColor = '#28a745';
    });

    socket.on('human-agent-assistant-event', (data) => {
      console.log(`[Socket.IO] Streamed Event Detected:`, data);
      try {
        if (data.data) {
          const dataObject = JSON.parse(data.data);
          let suggestionsFound = false;

          if (dataObject.suggestionResults && dataObject.suggestionResults.length > 0) {
            let containerCleared = false;
            
            dataObject.suggestionResults.forEach(result => {
              if (result.generateSuggestionsResponse && result.generateSuggestionsResponse.generatorSuggestionAnswers) {
                result.generateSuggestionsResponse.generatorSuggestionAnswers.forEach(answer => {
                  if (answer.generatorSuggestion && answer.generatorSuggestion.toolCallInfo) {
                    answer.generatorSuggestion.toolCallInfo.forEach(info => {
                      let displayText = '';
                      if (info.toolCall) {
                        displayText += `**${info.toolCall.toolDisplayName || 'Tool'}**: ${info.toolCall.toolDisplayDetails || ''}<br>`;
                      }
                      if (info.toolCallResult && info.toolCallResult.content) {
                        try {
                          const cObj = JSON.parse(info.toolCallResult.content);
                          displayText += cObj.customer_message || info.toolCallResult.content;
                        } catch {
                          displayText += info.toolCallResult.content;
                        }
                      }
                      if (displayText) {
                        if (!containerCleared && container) { container.innerHTML = ''; containerCleared = true; }
                        displaySuggestion(displayText, 'ai-coach');
                        suggestionsFound = true;
                      }
                    });
                  }
                });
              }
            });
          }
        }
      } catch (e) {
        console.error("UI Parsing Error:", e);
      }
    });

    socket.on('disconnect', () => {
      statusBadge.textContent = 'Disconnected';
      statusBadge.style.backgroundColor = '#dc3545';
    });
  }

  client.on('ticket.conversation.added', (comment) => {
    let rawText = comment && comment.message ? comment.message : "";
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = rawText;
    const cleanedText = tempDiv.textContent || tempDiv.innerText || rawText;

    client.request({
      url: 'https://<your-backend-url>/api/message',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ role: 'user', text: cleanedText }),
      cors: false
    }).then((res) => {
      if (res && res.conversationName && socket) socket.emit('join-conversation', res.conversationName);
    }).catch(err => console.error('Error sending message gateway:', err));
  });
});

function displaySuggestion(text, type) {
  const card = document.createElement('div');
  card.className = `suggestion-card ${type}`;
  const tag = document.createElement('span');
  tag.className = 'badge';
  tag.textContent = 'AI 추천';
  const content = document.createElement('p');
  content.innerHTML = text;

  card.appendChild(tag);
  card.appendChild(content);

  if (container) container.appendChild(card);
}
