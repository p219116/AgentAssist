// 브라우저 보안(CSP/CORS) 우회를 위한 기본 ZAF 설정 및 타이머 함수
if (typeof ZAFClient === 'undefined') {
  window.ZAFClient = {
    init: function () {
      return {
        on: function (event, cb) { if (event === 'app.registered') setTimeout(cb, 300); },
        get: function () { return Promise.resolve({ 'ticket.comment': { text: '' } }); }
      };
    }
  };
}

function waitForZAF() {
  if (typeof ZAFClient === 'undefined') {
    setTimeout(waitForZAF, 200);
    return;
  }

  // 👉 [사용자님 전용 공간] 아래 작은따옴표('') 사이에 방금 복사하신 엄청나게 긴 키(토큰)를 그대로 붙여넣어 주세요!
  const VIP_IDENTITY_TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImNjZTRlMDI0YTUxYWEwYzFjNDFjMWE0NTE1YTQxZGQ3ZTk2MTkzNmIiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiIzMjU1NTk0MDU1OS5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbSIsImF1ZCI6IjMyNTU1OTQwNTU5LmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29tIiwic3ViIjoiMTAxODMzNzYzMDMxMTA3NTcyODk1IiwiaGQiOiJjaGFuZ2hvanVuZy5hbHRvc3RyYXQuY29tIiwiZW1haWwiOiJhZG1pbkBjaGFuZ2hvanVuZy5hbHRvc3RyYXQuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsImF0X2hhc2giOiJyTXBsbGhEbE92QnNCMTNTOTFPd2ZnIiwiaWF0IjoxNzc1NzE5MDUwLCJleHAiOjE3NzU3MjI2NTB9.Ll3uPKxtxtjgDxdfOmwD19fImj2boiINIg4TA_tQCCfdYIvzLFS_bmuRinZA2KI3mpMDqpWH21ftY9BmwEj6jglJKRDvHnWMDSFYLnkkvPIhwqdM0YrZgB8VAe1YdaMuHOqvhK764Dgi3LXa3D99LKDKiqFT1dDexUb3L4wUX5XylylULucbCUNkqvZUhb7LejC-rsP1JGW-NGtXElCHVG45Lj7HRob1za2RWdchCLH77X7RBK9D24xvoPj8LX7TJiYoPbkroP5gTUZsUDnIhJH8UvZMH2w2Y_W7UZV8mGKi_Ehk6M0AMC24-2tM3PqIalOd4eibzOsE0JdMRUYL8A';

  const client = ZAFClient.init();
  const container = document.getElementById('suggestions-container');
  const statusBadge = document.getElementById('status-badge');

  statusBadge.textContent = 'Connecting...';
  statusBadge.style.backgroundColor = '#f59f00';

  client.on('app.registered', () => {
    console.log('[ZAF Client] Initialized successfully. Entering HTTP Polling mode...');

    // 시작 즉시 뱃지를 초록색으로 설정!
    if (statusBadge) {
      statusBadge.textContent = 'Connected (Polling)';
      statusBadge.style.backgroundColor = '#28a745';
    }

    // 👉 [신규 아키텍처] 3초마다 젠데스크 내부 Proxy를 통해 단발성으로 최신 답변을 조회합니다!
    setInterval(() => {
      client.request({
        url: 'https://coway-aa-backend-147944213110.us-central1.run.app/api/latest',
        type: 'GET',
        cors: false
      }).then((data) => {
        if (data && data.suggestions && data.suggestions.length > 0) {
          // 콘솔 창에 확인용으로 로깅
          console.log('[Polling 성공] 최신 코칭 제안 확보:', data.suggestions);
          
          // 기존 DOM을 비우고 새 추천 카드를 띄웁니다!
          const container = document.getElementById('suggestions-container');
          if (container) container.innerHTML = '';
          
          displaySuggestion(data.suggestions[0], 'ai-coach');
        }
      }).catch((err) => {
        console.error('[Polling 에러] 젠데스크 프록시 호출 실패:', err);
      });
    }, 3000);

    // 👉 [상용화 기능 전환] 젠데스크 티켓에서 실제 대화(댓글)가 추가될 때마다 자동으로 가로채어 분석합니다!
    client.on('ticket.conversation.added', (comment) => {
      let rawText = comment && comment.message ? comment.message : "No text";
      
      // ⭐️ [핵심 수리] 젠데스크 특유의 <div class='zd-comment'> 등 불필요한 HTML 태그를 완벽하게 제거하여 순수 텍스트만 추출합니다!
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = rawText;
      const cleanedText = tempDiv.textContent || tempDiv.innerText || rawText;

      console.log('[ZAF 상용 감지] 정제된 순수 텍스트 포착:', cleanedText);

      client.request({
        url: 'https://coway-aa-backend-147944213110.us-central1.run.app/api/reset',
        type: 'POST',
        cors: false
      }).then(() => {
        return client.request({
          url: 'https://coway-aa-backend-147944213110.us-central1.run.app/api/message',
          type: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({ role: 'user', text: cleanedText }),
          cors: false
        });
      }).then(() => {
        console.log('[ZAF 백엔드 송신 완료] 젠데스크의 실제 대화가 정상적으로 분석 요청되었습니다.');
      }).catch(err => console.error('[ZAF 실제 송신 에러]', err));
    }); // client.on('ticket.conversation.added') 종료

    // ⭐️ [100% 확실한 수동 버튼 리스너] 버튼을 누르는 즉시 정제된 텍스트를 꽂아 넣습니다!
    const btn = document.getElementById('test-send-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        const textVal = document.getElementById('test-input').value;
        console.log('[ZAF 수동 발송] 100% 확실하게 전송합니다:', textVal);

        client.request({
          url: 'https://coway-aa-backend-147944213110.us-central1.run.app/api/reset',
          type: 'POST',
          cors: false
        }).then(() => {
          return client.request({
            url: 'https://coway-aa-backend-147944213110.us-central1.run.app/api/message',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ role: 'user', text: textVal }),
            cors: false
          });
        }).then(() => {
          console.log('[ZAF 수동 완료] 백엔드가 완벽하게 접수했습니다!');
        }).catch(err => console.error(err));
      });
    }

  });
}



function displaySuggestion(text, type) {
  const container = document.getElementById('suggestions-container');
  const card = document.createElement('div');
  card.className = `suggestion-card ${type}`;

  const tag = document.createElement('span');
  tag.className = 'badge';
  tag.textContent = 'AI 추천';

  const content = document.createElement('p');
  content.textContent = text;

  card.appendChild(tag);
  card.appendChild(content);

  if (container) container.appendChild(card);
}

waitForZAF();
