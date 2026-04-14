/**
 * Zendesk Sidebar App - Client Side Logic (Sample Code)
 * 
 * [주의] 본 코드는 PoC(Proof of Concept) 및 연동 테스트를 위한 샘플 코드입니다.
 * 상용 환경 적용 시에는 자격 증명 관리 및 예외 처리를 강화해야 합니다.
 * 
 * 역할: UI Connector(Socket.IO)와 통신하여 실시간 AI 추천 표시
 */

// Zendesk App Framework (ZAF) 클라이언트 초기화
const client = ZAFClient.init();
const container = document.getElementById('suggestions-container');
const statusBadge = document.getElementById('status-badge');
let socket; // 글로벌 소켓 인스턴스

statusBadge.textContent = 'Connecting...';
statusBadge.style.backgroundColor = '#f59f00';

client.on('app.registered', () => {
  console.log('[ZAF Client] Initialized successfully. Connecting to WebSocket...');

  // Connect to UI Connector via Socket.IO
  const connectorUrl = 'https://<your-ui-connector-url>';
  console.log(`[Socket.IO] Connecting to ${connectorUrl}`);

  // Try to get JWT token first (optimistic fallback if auth is disabled)
  fetch(`${connectorUrl}/register`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer test-token' } // Placeholder
  }).then(res => {
    if (res.ok) return res.json();
    throw new Error('Auth failed');
  }).then(data => {
    console.log("[Socket.IO] JWT token acquired.");
    initializeSocket(data.token);
  }).catch(err => {
    console.log("[Socket.IO] Auth failed or not required, connecting directly.", err);
    initializeSocket(null);
  });

  function initializeSocket(token) {
    const opts = {};
    if (token) {
      opts.auth = { token: token };
    }
    
    socket = io(connectorUrl, opts);

    socket.on('connect', () => {
      console.log("[Socket.IO] Connection established");
      statusBadge.textContent = 'Connected (Real-time)';
      statusBadge.style.backgroundColor = '#28a745';
      
      // Removed hardcoded join-conversation. Will join dynamically after message response.
    });

    // Handle suggestions pushed by UI Connector
    socket.on('human-agent-assistant-event', (data) => {
      console.log(`[Socket.IO] Data received:`, data);
      try {
        if (data.data) {
          const dataObject = JSON.parse(data.data);
          console.log("[Socket.IO] Parsed dataObject:", dataObject);
          
          // Support both structures (fallback and new complex one)
          let suggestionsFound = false;
          
          // 1. New complex structure seen in logs (suggestionResults -> generateSuggestionsResponse)
          if (dataObject.suggestionResults && dataObject.suggestionResults.length > 0) {
            let containerCleared = false;
            
            dataObject.suggestionResults.forEach(result => {
              if (result.generateSuggestionsResponse && result.generateSuggestionsResponse.generatorSuggestionAnswers) {
                result.generateSuggestionsResponse.generatorSuggestionAnswers.forEach(answer => {
                  if (answer.generatorSuggestion && answer.generatorSuggestion.toolCallInfo) {
                    answer.generatorSuggestion.toolCallInfo.forEach(info => {
                      let displayText = '';
                      
                      // Extract tool info
                      if (info.toolCall) {
                        const name = info.toolCall.toolDisplayName || '스마트 툴';
                        const details = info.toolCall.toolDisplayDetails || '';
                        displayText += `**${name}**: ${details}<br>`;
                      }
                      
                      // Extract result content
                      if (info.toolCallResult && info.toolCallResult.content) {
                        try {
                          const contentObj = JSON.parse(info.toolCallResult.content);
                          if (contentObj.customer_message) {
                            displayText += `${contentObj.customer_message}`;
                          } else {
                            displayText += `${info.toolCallResult.content}`;
                          }
                        } catch (e) {
                          displayText += `${info.toolCallResult.content}`;
                        }
                      }
                      
                      if (displayText) {
                        if (!containerCleared && container) {
                          container.innerHTML = '';
                          containerCleared = true;
                        }
                        displaySuggestion(displayText, 'ai-coach');
                        suggestionsFound = true;
                      }
                    });
                  }
                });
              }
            });
          }
          
          // 2. Fallback to simpler structure if needed
          if (!suggestionsFound && dataObject.humanAgentSuggestionResults) {
            if (container) container.innerHTML = '';
            dataObject.humanAgentSuggestionResults.forEach(result => {
              if (result.suggestion) {
                displaySuggestion(result.suggestion.text, 'ai-coach');
              }
            });
          }
        }
      } catch (e) {
        console.error("[Socket.IO] Error parsing message", e);
      }
    });

    socket.on('disconnect', (reason) => {
      console.log("[Socket.IO] Connection closed:", reason);
      statusBadge.textContent = 'Disconnected';
      statusBadge.style.backgroundColor = '#dc3545';
    });

    socket.on('connect_error', (error) => {
      console.log(`[Socket.IO] Error: ${error.message}`);
      statusBadge.textContent = 'Error';
      statusBadge.style.backgroundColor = '#dc3545';
    });
  }

  // Listen for ticket conversation events to send data to backend
  client.on('ticket.conversation.added', (comment) => {
    let rawText = comment && comment.message ? comment.message : "No text";
    
    // Clean HTML tags
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = rawText;
    const cleanedText = tempDiv.textContent || tempDiv.innerText || rawText;

    console.log('[ZAF Event] Captured comment:', cleanedText);

    // Send to backend via standard HTTP request (ZAF Proxy)
    client.request({
      url: 'https://<your-backend-url>/api/message',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ role: 'user', text: cleanedText }),
      cors: false
    }).then((response) => {
      console.log('[ZAF Event] Message sent to backend successfully.', response);
      if (response && response.conversationName && socket) {
        socket.emit('join-conversation', response.conversationName);
        console.log(`[ZAF Event] Joined conversation dynamically: ${response.conversationName}`);
      }
    }).catch(err => console.error('[ZAF Event] Error sending message:', err));
  });

  // Manual trigger button
  const btn = document.getElementById('get-suggestions-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      console.log('[ZAF Event] Manual trigger clicked.');
      
      const cleanedText = "what is the status of the order 123";
      console.log('[ZAF Event] Forcing hardcoded comment:', cleanedText);

      client.request({
        url: 'https://<your-backend-url>/api/message',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ role: 'user', text: cleanedText }),
        cors: false
      }).then((response) => {
        console.log('[ZAF Event] Message sent to backend successfully.', response);
        if (response && response.conversationName && socket) {
          socket.emit('join-conversation', response.conversationName);
          console.log(`[ZAF Event] Joined conversation dynamically: ${response.conversationName}`);
        }
      }).catch(err => console.error('[ZAF Event] Error sending message:', err));
    });
  }
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
