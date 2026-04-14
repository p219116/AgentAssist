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

app.post('/api/message', async (req, res) => {
  const { role, text } = req.body;

  try {
    const cleanText = text ? text.replace(/<[^>]*>/g, '').trim() : '';

    console.log('[Workflow 1 Flow] 독립 세션 발급 중...');
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

    console.log(`[Workflow 1 Flow] AnalyzeContent 전달 (${role}): ${cleanText}`);
    await participantsClient.analyzeContent(request, { timeout: 5000 });

    res.json({ success: true, conversationName: freshConversationId });
  } catch (error) {
    console.error('[Workflow 1 Error]:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Official Integrations Workflow 1] Server running on port ${PORT}`);
});
