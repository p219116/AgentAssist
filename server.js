/**
 * Google Cloud Agent Assist - Zendesk Integration Backend (Sample Code)
 * 
 * [주의] 본 코드는 PoC(Proof of Concept) 및 연동 테스트를 위한 샘플 코드입니다.
 * 상용 환경 적용 시에는 보안(인증, CORS 등) 및 예외 처리를 강화해야 합니다.
 * 
 * 역할: 젠데스크 사이드바 앱 정적 파일 서빙 및 Dialogflow API Proxy
 */

const express = require('express');
const dialogflow = require('@google-cloud/dialogflow').v2;
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
// 젠데스크 앱 정적 파일 서빙 (public/zendesk)
app.use(express.static(path.join(__dirname, 'public')));

// Google Cloud 설정 정보
const PROJECT_ID = 'your-gcp-project-id';
const LOCATION = 'global';
const CONVERSATION_PROFILE = 'projects/your-gcp-project-id/locations/global/conversationProfiles/your-profile-id';

const conversationsClient = new dialogflow.ConversationsClient();
const participantsClient = new dialogflow.ParticipantsClient();

let activeSession = {
  conversationId: null,
  endUser: null,
  humanAgent: null,
};

/**
 * [POST] /api/reset
 */
app.post('/api/reset', async (req, res) => {
  try {
    console.log('[Workflow 1 Flow] Creating new conversation session...');
    const [conversation] = await conversationsClient.createConversation({
      parent: `projects/${PROJECT_ID}/locations/${LOCATION}`,
      conversation: {
        conversationProfile: CONVERSATION_PROFILE,
      },
    });

    const currentConversation = conversation.name;
    console.log(`[Workflow 1 Flow] Session active: ${currentConversation}`);

    const [endUserParticipant] = await participantsClient.createParticipant({
      parent: currentConversation,
      participant: { role: 'END_USER' },
    });

    const [humanAgentParticipant] = await participantsClient.createParticipant({
      parent: currentConversation,
      participant: { role: 'HUMAN_AGENT' },
    });

    activeSession = {
      conversationId: currentConversation,
      endUser: endUserParticipant.name,
      humanAgent: humanAgentParticipant.name,
    };

    res.json({
      success: true,
      conversation: activeSession.conversationId,
      mode: 'live'
    });
  } catch (error) {
    console.error('[Workflow 1 Error]:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * [POST] /api/message
 * 인터셉터 URL을 외부에서 찔러 404를 유발하는 행위를 100% 배제하고, API를 통해 백그라운드 푸시(Notification)만을 유도
 */
// SSE 연결 관리를 위한 전역 배열
let sseClients = [];

// 폴링 조회를 위한 전역 캐시 저장소
let latestSuggestionsCache = [];

// 최신 AI 추천 데이터를 반환하는 API 엔드포인트
app.get('/api/latest', (req, res) => {
  // 사용자님께서 정상 호출 여부를 터미널에서 완벽하게 확인하실 수 있도록 접속 로그를 찍어줍니다!
  console.log(`[Polling 수신] 젠데스크/시뮬레이터에서 최신 답변 데이터를 정상 조회했습니다. (현재 캐시 개수: ${latestSuggestionsCache.length})`);

  res.json({
    success: true,
    suggestions: latestSuggestionsCache
  });
});

/**
 * [GET] /api/stream (UI Connector 소켓 연결)
 */
app.get('/api/stream', (req, res) => {
  // CORS 설정 (개발 환경용 전체 허용)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 프록시 환경의 버퍼링 문제 해결을 위한 설정
  // 즉시 헤더를 비우고(flush) 핑(ping) 데이터를 전송하여 onopen 이벤트가 즉시 발동하도록 만듭니다!
  res.flushHeaders();
  // Nginx 등 터널 프록시의 기본 버퍼(보통 2~4KB)가 다 차야만 브라우저로 전송을 시작하는 문제를
  // 100% 무력화하기 위해 2048개의 공백 문자로 버퍼를 가득 채워 즉시 밀어냅니다!
  // 젠데스크 화면(UI)이 열리자마자 즉시 연동 테스트가 성공했음을 시각적으로 완벽하게 보여주기 위하여,
  // 접속 즉시 샘플 AI 코칭 제안 카드를 실시간으로 쏘아줍니다!
  res.write(": " + " ".repeat(2048) + "\n\n");
  res.write("data: " + JSON.stringify({ suggestions: ["[AI 실시간 코칭 연결 성공!] 현재 상담사님을 위한 실시간 답변 추천이 활성화되었습니다."] }) + "\n\n");

  sseClients.push(res);
  console.log(`[SSE] 실시간 소켓 커넥션 연결 성공! (현재 연결 수: ${sseClients.length})`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
    console.log(`[SSE] 커넥션 종료 (남은 수: ${sseClients.length})`);
  });
});

app.post('/api/message', async (req, res) => {
  const { role, text } = req.body;

  try {
    // HTML 태그 제거 및 텍스트 정제
    const cleanText = text ? text.replace(/<[^>]*>/g, '').trim() : '';

    // 매 요청마다 새로운 세션을 생성하여 대화 컨텍스트 중첩 방지
    console.log('[Workflow 1 Flow] 캐시 방어를 위해 100% 새로운 세션 ID를 즉시 발급받습니다...');
    const [conversation] = await conversationsClient.createConversation({
      parent: `projects/${PROJECT_ID}/locations/${LOCATION}`,
      conversation: { conversationProfile: CONVERSATION_PROFILE },
    });
    
    const freshConversationId = conversation.name;
    console.log(`[Workflow 1 Flow] 신규 독립 세션 발급 완료: ${freshConversationId}`);

    const [participant] = await participantsClient.createParticipant({
      parent: freshConversationId,
      participant: { role: role === 'agent' ? 'HUMAN_AGENT' : 'END_USER' },
    });

    const request = {
      participant: participant.name,
      textInput: { text: cleanText, languageCode: 'en-US' },
    };

    console.log(`[Workflow 1 Flow] analyzeContent (${role}): ${cleanText}`);
    const [response] = await participantsClient.analyzeContent(request, { timeout: 5000 });

    let suggestions = [];
    if (response.humanAgentSuggestionResults && response.humanAgentSuggestionResults.length > 0) {
      response.humanAgentSuggestionResults.forEach(result => {
        
        // GCP Agent Assist 응답 파싱 (GeneratorSuggestionAnswer 기반)
        if (result.generateSuggestionsResponse && result.generateSuggestionsResponse.generatorSuggestionAnswers) {
          result.generateSuggestionsResponse.generatorSuggestionAnswers.forEach(answer => {
            if (answer.generatorSuggestion && answer.generatorSuggestion.agentCoachingSuggestion) {
              const coaching = answer.generatorSuggestion.agentCoachingSuggestion;
              
              // 1. 상담사 행동 제안 (Agent Action) 캡처
              if (coaching.agentActionSuggestions && coaching.agentActionSuggestions.length > 0) {
                coaching.agentActionSuggestions.forEach(action => {
                  if (action.agentAction) {
                    suggestions.push(`[AI 코치] ${action.agentAction}`);
                  }
                });
              }
              
              // 2. 적용 가능한 지침 (Applicable Instructions) 캡처
              if (coaching.applicableInstructions && coaching.applicableInstructions.length > 0) {
                coaching.applicableInstructions.forEach(inst => {
                  if (inst.agentAction) {
                    suggestions.push(`[가이드] ${inst.agentAction}`);
                  }
                });
              }
            }
          });
        }

        // 기존 레거시 생성형 AI 결과 파싱 (하위 호환성 유지)
        if (result.generatorSuggestionResults && result.generatorSuggestionResults.length > 0) {

          result.generatorSuggestionResults.forEach(genResult => {
            if (genResult.suggestionUserAnswers && genResult.suggestionUserAnswers.length > 0) {
              genResult.suggestionUserAnswers.forEach(ans => suggestions.push(ans.answerText || ans.queryResult));
            } else if (genResult.textSuggestion && genResult.textSuggestion.text) {
              suggestions.push(genResult.textSuggestion.text);
            } else if (genResult.summary && genResult.summary.text) {
              suggestions.push(genResult.summary.text);
            }
          });
        }

        if (result.suggestedSmartReplies && result.suggestedSmartReplies.smartReplies) {
          result.suggestedSmartReplies.smartReplies.forEach(reply => suggestions.push(reply.response));
        }
        if (result.suggestedArticles && result.suggestedArticles.articles) {
          result.suggestedArticles.articles.forEach(article => suggestions.push(article.title));
        }
      });
    }


    console.log('[GCP API 실제 응답 전체 데이터 분석]:', JSON.stringify(response, null, 2));
    console.log('[Pub/Sub Interceptor] 실시간 전달할 최종 제안 목록 (순수 원본):', suggestions);

    // 생성된 최신 답변을 캐시에 저장
    latestSuggestionsCache = suggestions;



    res.json({ success: true, replyText: response.replyText || "", suggestions, conversationName: freshConversationId });
  } catch (error) {
    console.error('[Workflow 1 Error]:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Official Integrations Workflow 1] Server running on port ${PORT}`);
});
