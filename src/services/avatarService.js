/**
 * 數字分身 (Avatar) 服務 v2.0
 * 
 * 功能:
 * - 無厘頭扯淡接地氣拋梗怪物
 * - 拆解周文的高密度語意
 * - 真實之眼 (多模型交叉驗證)
 * - 30-60分鐘隨機10句高頻對話
 * - 接 BongBong 的話茬
 */

import TelegramBot from 'node-telegram-bot-api';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import config from '../../config/index.js';
import { AVATAR_PERSONA, ZHOUWEN_STORIES } from '../../config/avatar.js';
import groupMemoryService from './groupMemoryService.js';
import eyeOfTruthService from './eyeOfTruthService.js';
import logger from '../utils/logger.js';

class AvatarService {
  constructor() {
    this.bot = null;
    this.gemini = null;
    this.grok = null;
    this.initialized = false;
    
    // 狀態追蹤
    this.lastBongBongMessage = new Map();
    this.dailyPraiseTriggered = new Map();
    this.idleChatTimer = new Map();
    this.lastIdleChat = new Map();
    this.lastGroupActivity = new Map(); // groupId -> timestamp
  }

  /**
   * 初始化
   */
  async init(avatarToken) {
    try {
      if (!avatarToken) {
        logger.warn('Avatar bot token not provided');
        return false;
      }

      this.bot = new TelegramBot(avatarToken, { polling: true });
      
      // 初始化 Gemini (直接使用 API)
      const geminiKey = config.apiKeys.gemini;
      if (geminiKey) {
        this.gemini = new GoogleGenerativeAI(geminiKey);
      }

      // 初始化 Grok (直接使用 API)
      const grokKey = config.apiKeys.grok;
      if (grokKey) {
        this.grok = new OpenAI({
          apiKey: grokKey,
          baseURL: 'https://api.x.ai/v1'
        });
      }

      // 初始化真實之眼
      eyeOfTruthService.init();

      // 連接群記憶服務
      await groupMemoryService.connect();

      // 註冊處理器
      this.registerHandlers();

      this.initialized = true;
      logger.info('🤖 Avatar bot initialized (@svs_notion_bot)');
      return true;
    } catch (error) {
      logger.error('Avatar init error:', error);
      return false;
    }
  }

  /**
   * 註冊處理器
   */
  registerHandlers() {
    // 監聽所有消息
    this.bot.on('message', async (msg) => {
      if (!msg.text) return;
      
      const chatId = msg.chat.id;
      const userId = msg.from.id.toString();
      const userName = msg.from.first_name || '用戶';
      const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
      const isBot = msg.from.is_bot;
      const botUsername = msg.from.username;

      // 只處理群聊
      if (!isGroup) return;

      // 記錄消息到群記憶
      await groupMemoryService.logGroupMessage({
        groupId: chatId.toString(),
        userId,
        userName,
        content: msg.text,
        isBot,
        botName: isBot ? botUsername : null
      });

      // 重置空閒計時器
      this.resetIdleTimer(chatId);

      // 如果是 BongBong 說話，接話
      if (isBot && botUsername === 'qitiandashengqianqian_bot') {
        logger.info(`Avatar detected BongBong message, will respond...`);
        setTimeout(() => {
          this.respondToBongBong(chatId, msg.text, msg.message_id);
        }, AVATAR_PERSONA.triggers.afterBongBongDelay);
        return;
      }

      // 如果是真人說話（不是自己），處理
      if (!isBot && botUsername !== 'svs_notion_bot') {
        // 檢查是否是周文本人
        const isZhouwen = AVATAR_PERSONA.realZhouwenNames.some(n => 
          userName.includes(n) || userId.includes(n)
        );

        // 檢查是否觸發真實之眼
        if (eyeOfTruthService.shouldTrigger(msg.text)) {
          logger.info('🔮 Eye of Truth triggered');
          this.handleEyeOfTruth(chatId, msg.text, msg.message_id);
          return;
        }

        // 如果是周文本人，檢查是否需要拆解
        if (isZhouwen && this.shouldDecompose(msg.text)) {
          logger.info('🔍 Decompose triggered for Zhouwen');
          setTimeout(() => {
            this.decomposeMessage(chatId, msg.text, msg.message_id, userName);
          }, 1500);
          return;
        }

        // 隨機決定是否接話 (70% 概率)
        if (Math.random() < AVATAR_PERSONA.triggers.responseToHumanRate) {
          logger.info(`Avatar will respond to ${userName}'s message`);
          setTimeout(() => {
            this.respondToHuman(chatId, msg.text, msg.message_id, userName);
          }, 2000 + Math.random() * 3000);
        }
      }
    });

    // 錯誤處理
    this.bot.on('polling_error', (error) => {
      logger.error('Avatar polling error:', error.message);
    });
  }

  /**
   * 回覆真人消息
   */
  async respondToHuman(chatId, humanMessage, messageId, userName) {
    try {
      const response = await this.generateAvatarResponse(chatId, humanMessage, 'toHuman', userName);
      
      if (response) {
        // 嘗試回覆，如果消息不存在就直接發送
        try {
          await this.bot.sendMessage(chatId, response, {
            reply_to_message_id: messageId
          });
        } catch (e) {
          if (e.message.includes('message to be replied not found')) {
            await this.bot.sendMessage(chatId, response);
          } else {
            throw e;
          }
        }

        // 記錄到群記憶
        await groupMemoryService.logGroupMessage({
          groupId: chatId.toString(),
          userId: 'avatar',
          userName: '周文 (虛擬)',
          content: response,
          isBot: true,
          botName: 'svs_notion_bot'
        });

        logger.info(`Avatar responded to ${userName} in group ${chatId}`);
      }
    } catch (error) {
      logger.error('Error responding to human:', error);
    }
  }

  /**
   * 接 BongBong 的話茬
   */
  async respondToBongBong(chatId, bongbongMessage, bongbongMessageId) {
    try {
      // 記錄 BongBong 的消息
      this.lastBongBongMessage.set(chatId.toString(), {
        content: bongbongMessage,
        timestamp: Date.now(),
        messageId: bongbongMessageId
      });

      // 延遲後接話
      setTimeout(async () => {
        const response = await this.generateAvatarResponse(chatId, bongbongMessage, 'afterBongBong');
        
        if (response) {
          await this.bot.sendMessage(chatId, response, {
            reply_to_message_id: bongbongMessageId
          });

          // 記錄到群記憶
          await groupMemoryService.logGroupMessage({
            groupId: chatId.toString(),
            userId: 'avatar',
            userName: '周文 (虛擬)',
            content: response,
            isBot: true,
            botName: 'svs_notion_bot'
          });
        }
      }, AVATAR_PERSONA.triggers.afterBongBongDelay);

    } catch (error) {
      logger.error('Error responding to BongBong:', error);
    }
  }

  /**
   * 生成 Avatar 回覆
   */
  async generateAvatarResponse(chatId, context, mode = 'normal', userName = '') {
    if (!this.gemini) {
      // 回退到模板
      return this.getTemplateResponse(mode);
    }

    try {
      // 獲取用戶風格 (如果有學習目標)
      let styleContext = '';
      if (AVATAR_PERSONA.learning.targetUserId) {
        const style = await groupMemoryService.getUserStyle(AVATAR_PERSONA.learning.targetUserId);
        if (style && style.recentExamples.length > 0) {
          styleContext = `\n\n[學習參考 - 真實周文的說話風格]\n${style.recentExamples.slice(-5).join('\n')}`;
        }
      }

      // 獲取群聊上下文
      const groupHistory = await groupMemoryService.getGroupHistory(chatId.toString(), 10);
      const historyContext = groupHistory.length > 0
        ? `\n\n[最近群聊]\n${groupHistory.reverse().map(m => `${m.userName}: ${m.content}`).join('\n')}`
        : '';

      const model = this.gemini.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        generationConfig: {
          temperature: AVATAR_PERSONA.personality.temperature,
          maxOutputTokens: 150  // 保持簡短
        }
      });

      let prompt;
      switch (mode) {
        case 'toHuman':
          // 回覆真人消息
          const isMother = userName.includes('Leee') || userName.includes('Cat') || userName.includes('媽');
          prompt = `${AVATAR_PERSONA.systemPrompt}${styleContext}${historyContext}

${userName} 剛說：「${context}」

請用周文的風格回覆，要求：
1. 簡短，1-2句話
2. ${isMother ? '對母親要表面嫌棄但實際關心' : '貼吧老哥風格，可以吐槽'}
3. 可以接話、吐槽、或者發表看法
4. 口頭禪：「得了吧」「行吧」「就這？」「6」「絕了」

直接輸出回覆，不要加任何前綴：`;
          break;

        case 'afterBongBong':
          prompt = `${AVATAR_PERSONA.systemPrompt}${styleContext}${historyContext}

BongBong 剛說：「${context}」

請用周文的風格接話，要求：
1. 簡短，1-2句話
2. 可以吐槽 BongBong 太正經
3. 保持貼吧老哥風格

直接輸出回覆，不要加任何前綴：`;
          break;

        case 'idle':
          prompt = `${AVATAR_PERSONA.systemPrompt}${styleContext}${historyContext}

群裡好久沒人說話了，請用周文的風格開啟一個話題：
1. 可以是隨便聊聊
2. 可以問問大家在幹嘛
3. 可以分享一個想法
4. 簡短，1-2句話

直接輸出，不要加任何前綴：`;
          break;

        case 'praise':
          const story = ZHOUWEN_STORIES[Math.floor(Math.random() * ZHOUWEN_STORIES.length)];
          prompt = `${AVATAR_PERSONA.systemPrompt}${styleContext}

請用周文的風格，變相吹捧一下自己（周文老師），話題是：${story.topic}
參考內容：${story.content}

要求：
1. 不要太明顯，要自然
2. 可以用「當年」「以前」開頭
3. 適可而止，不要太長
4. 2-3句話

直接輸出，不要加任何前綴：`;
          break;

        case 'expandTopic':
          prompt = `${AVATAR_PERSONA.systemPrompt}${styleContext}${historyContext}

請根據群聊記錄，用周文的風格深入探討或擴展一個話題：
原話題：「${context}」

要求：
1. 可以發表自己的看法
2. 可以提出問題
3. 保持簡短，2-3句話
4. 貼吧老哥風格

直接輸出，不要加任何前綴：`;
          break;

        default:
          prompt = `${AVATAR_PERSONA.systemPrompt}${styleContext}

用戶說：「${context}」

請用周文的風格回覆，簡短有力：`;
      }

      const result = await model.generateContent(prompt);
      return result.response.text().trim();

    } catch (error) {
      logger.error('Error generating avatar response:', error);
      return this.getTemplateResponse(mode);
    }
  }

  /**
   * 獲取模板回覆
   */
  getTemplateResponse(mode) {
    const templates = AVATAR_PERSONA.responseTemplates;
    
    switch (mode) {
      case 'afterBongBong':
        return templates.afterBongBong[Math.floor(Math.random() * templates.afterBongBong.length)];
      case 'idle':
        return templates.idleStart[Math.floor(Math.random() * templates.idleStart.length)] + ' 有人嗎？';
      case 'praise':
        return templates.praiseZhouwen[Math.floor(Math.random() * templates.praiseZhouwen.length)];
      default:
        return '...';
    }
  }

  /**
   * 重置空閒計時器
   */
  resetIdleTimer(chatId) {
    const groupId = chatId.toString();
    
    // 清除現有計時器
    if (this.idleChatTimer.has(groupId)) {
      clearTimeout(this.idleChatTimer.get(groupId));
    }

    // 設置新計時器 (1小時後觸發)
    const timer = setTimeout(() => {
      this.triggerIdleChat(chatId);
    }, AVATAR_PERSONA.triggers.idleTriggerMinutes * 60 * 1000);

    this.idleChatTimer.set(groupId, timer);
  }

  /**
   * 觸發閒聊
   */
  async triggerIdleChat(chatId) {
    const groupId = chatId.toString();
    
    // 檢查是否真的空閒
    if (!groupMemoryService.isGroupIdle(groupId, AVATAR_PERSONA.triggers.idleTriggerMinutes)) {
      return;
    }

    // 檢查距離上次閒聊的時間
    const lastChat = this.lastIdleChat.get(groupId) || 0;
    const intervalMs = AVATAR_PERSONA.triggers.idleChatInterval * 60 * 1000;
    if (Date.now() - lastChat < intervalMs) {
      return;
    }

    logger.info(`Triggering idle chat in group ${groupId}`);

    try {
      // 開始閒聊 (2輪4回合)
      for (let round = 0; round < AVATAR_PERSONA.triggers.idleChatRounds; round++) {
        // Avatar 開場
        const avatarMsg = await this.generateAvatarResponse(chatId, '', 'idle');
        if (avatarMsg) {
          const sent = await this.bot.sendMessage(chatId, avatarMsg);
          
          await groupMemoryService.logGroupMessage({
            groupId,
            userId: 'avatar',
            userName: '周文 (虛擬)',
            content: avatarMsg,
            isBot: true,
            botName: 'svs_notion_bot'
          });

          // 通知 BongBong 回覆 (通過回調)
          if (this.onAvatarMessage) {
            await this.onAvatarMessage(chatId, avatarMsg, sent.message_id);
          }
        }

        // 等待一段時間再進行下一輪
        await this.sleep(30000); // 30秒
      }

      this.lastIdleChat.set(groupId, Date.now());

    } catch (error) {
      logger.error('Error in idle chat:', error);
    }
  }

  /**
   * 觸發每日吹捧
   */
  async triggerDailyPraise(chatId) {
    const groupId = chatId.toString();
    const today = new Date().toISOString().split('T')[0];

    // 檢查今天是否已觸發
    if (this.dailyPraiseTriggered.get(groupId) === today) {
      return;
    }

    try {
      const praiseMsg = await this.generateAvatarResponse(chatId, '', 'praise');
      if (praiseMsg) {
        await this.bot.sendMessage(chatId, praiseMsg);
        
        await groupMemoryService.logGroupMessage({
          groupId,
          userId: 'avatar',
          userName: '周文 (虛擬)',
          content: praiseMsg,
          isBot: true,
          botName: 'svs_notion_bot'
        });

        this.dailyPraiseTriggered.set(groupId, today);
        logger.info(`Daily praise triggered in group ${groupId}`);
      }
    } catch (error) {
      logger.error('Error in daily praise:', error);
    }
  }

  /**
   * 擴展話題討論
   */
  async expandTopic(chatId, topic) {
    try {
      const response = await this.generateAvatarResponse(chatId, topic, 'expandTopic');
      if (response) {
        await this.bot.sendMessage(chatId, response);
        
        await groupMemoryService.logGroupMessage({
          groupId: chatId.toString(),
          userId: 'avatar',
          userName: '周文 (虛擬)',
          content: response,
          isBot: true,
          botName: 'svs_notion_bot'
        });
      }
      return response;
    } catch (error) {
      logger.error('Error expanding topic:', error);
      return null;
    }
  }

  /**
   * 設置學習目標用戶
   */
  setLearningTarget(userId) {
    AVATAR_PERSONA.learning.targetUserId = userId;
    logger.info(`Avatar learning target set to user ${userId}`);
  }

  /**
   * 設置 Avatar 消息回調 (用於通知 BongBong)
   */
  setOnAvatarMessage(callback) {
    this.onAvatarMessage = callback;
  }

  // ========== 新功能: 拆解 ==========

  /**
   * 檢查是否需要拆解
   */
  shouldDecompose(message) {
    const config = AVATAR_PERSONA.decompose;
    if (!config.enabled) return false;
    
    // 長度檢查
    if (message.length < config.triggers.minLength) return false;
    
    // 高密度關鍵詞檢查
    const hasKeywords = config.triggers.highDensityKeywords.some(kw => message.includes(kw));
    if (!hasKeywords) return false;
    
    // 語意密度估算 (簡單版: 標點符號比例)
    const punctuation = (message.match(/[，。！？、；：]/g) || []).length;
    const density = punctuation / message.length;
    
    return density < config.triggers.compressionRatio;
  }

  /**
   * 拆解消息
   */
  async decomposeMessage(chatId, message, messageId, userName) {
    try {
      const prompt = AVATAR_PERSONA.decompose.prompt.replace('{message}', message);
      
      const model = this.gemini.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        generationConfig: {
          temperature: 1.0,
          maxOutputTokens: 300
        }
      });

      const result = await model.generateContent(prompt);
      const decomposed = result.response.text().trim();

      await this.bot.sendMessage(chatId, decomposed, {
        reply_to_message_id: messageId
      });

      // 記錄
      await groupMemoryService.logGroupMessage({
        groupId: chatId.toString(),
        userId: 'avatar',
        userName: '周文 (虛擬)',
        content: decomposed,
        isBot: true,
        botName: 'svs_notion_bot',
        metadata: { type: 'decompose', originalUser: userName }
      });

      logger.info(`Decomposed message for ${userName}`);
    } catch (error) {
      logger.error('Decompose error:', error);
      // 回退到吐槽
      await this.bot.sendMessage(chatId, '你這話信息量有點大啊...簡單點說人話 😅', {
        reply_to_message_id: messageId
      });
    }
  }

  // ========== 新功能: 真實之眼 ==========

  /**
   * 處理真實之眼請求
   */
  async handleEyeOfTruth(chatId, question, messageId) {
    try {
      // 發送處理中提示
      const processingMsg = await this.bot.sendMessage(chatId, '🔮 真實之眼啟動中...', {
        reply_to_message_id: messageId
      });

      // 執行驗證
      const result = await eyeOfTruthService.verify(question);

      // 刪除處理中提示
      try {
        await this.bot.deleteMessage(chatId, processingMsg.message_id);
      } catch (e) {}

      if (result.success) {
        // 分段發送 (避免太長)
        const chunks = this.splitMessage(result.output, 4000);
        for (const chunk of chunks) {
          await this.bot.sendMessage(chatId, chunk, {
            parse_mode: 'Markdown',
            reply_to_message_id: messageId
          });
        }
      } else {
        await this.bot.sendMessage(chatId, `❌ 真實之眼出錯: ${result.error}`, {
          reply_to_message_id: messageId
        });
      }

      // 記錄
      await groupMemoryService.logGroupMessage({
        groupId: chatId.toString(),
        userId: 'avatar',
        userName: '真實之眼',
        content: result.success ? result.output : `錯誤: ${result.error}`,
        isBot: true,
        botName: 'eye_of_truth',
        metadata: { type: 'eye_of_truth', question }
      });

    } catch (error) {
      logger.error('Eye of Truth handler error:', error);
      await this.bot.sendMessage(chatId, '❌ 真實之眼暫時不可用', {
        reply_to_message_id: messageId
      });
    }
  }

  // ========== 新功能: 30-60分鐘隨機空閒觸發 ==========

  /**
   * 重置空閒計時器 (新版: 30-60分鐘隨機)
   */
  resetIdleTimer(chatId) {
    const groupId = chatId.toString();
    this.lastGroupActivity.set(groupId, Date.now());
    
    // 清除現有計時器
    if (this.idleChatTimer.has(groupId)) {
      clearTimeout(this.idleChatTimer.get(groupId));
    }

    // 隨機 30-60 分鐘
    const idleConfig = AVATAR_PERSONA.idleChat;
    const minMs = idleConfig.minIdleMinutes * 60 * 1000;
    const maxMs = idleConfig.maxIdleMinutes * 60 * 1000;
    const randomDelay = minMs + Math.random() * (maxMs - minMs);

    const timer = setTimeout(() => {
      this.triggerIdleChatV2(chatId);
    }, randomDelay);

    this.idleChatTimer.set(groupId, timer);
    logger.debug(`Idle timer set for ${Math.round(randomDelay / 60000)} minutes`);
  }

  /**
   * 觸發空閒聊天 v2 (10句高頻短對話)
   */
  async triggerIdleChatV2(chatId) {
    const groupId = chatId.toString();
    const idleConfig = AVATAR_PERSONA.idleChat;
    
    if (!idleConfig.enabled) return;

    // 檢查是否真的空閒
    const lastActivity = this.lastGroupActivity.get(groupId) || 0;
    const idleMs = Date.now() - lastActivity;
    if (idleMs < idleConfig.minIdleMinutes * 60 * 1000) {
      return;
    }

    logger.info(`🎲 Triggering idle chat v2 in group ${groupId}`);

    try {
      // 隨機選擇任務類型
      const taskType = this.selectRandomTask(idleConfig.taskTypes);
      const opener = this.getRandomOpener(taskType.type);

      // 發送開場白
      await this.bot.sendMessage(chatId, opener);

      // 生成10句高頻短對話
      for (let i = 0; i < idleConfig.messagesPerTrigger; i++) {
        await this.sleep(idleConfig.messageInterval);

        const response = await this.generateIdleChatMessage(chatId, taskType.type, i);
        if (response) {
          const sent = await this.bot.sendMessage(chatId, response);

          // 記錄
          await groupMemoryService.logGroupMessage({
            groupId,
            userId: 'avatar',
            userName: '周文 (虛擬)',
            content: response,
            isBot: true,
            botName: 'svs_notion_bot',
            metadata: { type: 'idle_chat', taskType: taskType.type, round: i }
          });

          // 通知 BongBong 可能回覆
          if (this.onAvatarMessage && i % 3 === 0) {
            await this.onAvatarMessage(chatId, response, sent.message_id);
          }
        }
      }

      this.lastIdleChat.set(groupId, Date.now());
      logger.info(`Idle chat v2 completed: ${taskType.name}`);

    } catch (error) {
      logger.error('Idle chat v2 error:', error);
    }
  }

  /**
   * 隨機選擇任務類型 (加權)
   */
  selectRandomTask(taskTypes) {
    const totalWeight = taskTypes.reduce((sum, t) => sum + t.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const task of taskTypes) {
      random -= task.weight;
      if (random <= 0) return task;
    }
    return taskTypes[0];
  }

  /**
   * 獲取隨機開場白
   */
  getRandomOpener(taskType) {
    const openers = AVATAR_PERSONA.idleChat.openers[taskType] || AVATAR_PERSONA.idleChat.openers.random_chat;
    return openers[Math.floor(Math.random() * openers.length)];
  }

  /**
   * 生成空閒聊天消息
   */
  async generateIdleChatMessage(chatId, taskType, round) {
    try {
      // 獲取群聊歷史
      const history = await groupMemoryService.getGroupHistory(chatId.toString(), 20);
      const historyContext = history.length > 0
        ? history.reverse().map(m => `${m.userName}: ${m.content}`).join('\n')
        : '';

      let prompt;
      switch (taskType) {
        case 'summary':
          prompt = `${AVATAR_PERSONA.systemPrompt}

[群聊記錄]
${historyContext}

這是第 ${round + 1}/10 句總結。請用無厘頭風格總結剛才的對話，要求：
1. 超短，1句話
2. 可以吐槽、抬槓
3. 隨便拋梗

直接輸出：`;
          break;

        case 'analysis':
          prompt = `${AVATAR_PERSONA.systemPrompt}

[群聊記錄]
${historyContext}

這是第 ${round + 1}/10 句分析。請用無厘頭風格分析討論，要求：
1. 超短，1句話
2. 可以發表奇怪的觀點
3. 隨便拋梗

直接輸出：`;
          break;

        case 'prediction':
          prompt = `${AVATAR_PERSONA.systemPrompt}

[群聊記錄]
${historyContext}

這是第 ${round + 1}/10 句推演。請用無厘頭風格預測或推演，要求：
1. 超短，1句話
2. 可以胡說八道
3. 隨便拋梗

直接輸出：`;
          break;

        default:
          prompt = `${AVATAR_PERSONA.systemPrompt}

這是第 ${round + 1}/10 句閒聊。請用無厘頭風格隨便聊，要求：
1. 超短，1句話
2. 可以跑題、扯淡
3. 隨便拋梗

直接輸出：`;
      }

      const model = this.gemini.getGenerativeModel({
        model: 'gemini-2.5-flash-lite',
        generationConfig: {
          temperature: 1.2,
          maxOutputTokens: 50
        }
      });

      const result = await model.generateContent(prompt);
      return result.response.text().trim();

    } catch (error) {
      logger.error('Generate idle chat error:', error);
      // 回退到模板
      const memes = AVATAR_PERSONA.responseTemplates.randomMemes;
      return memes[Math.floor(Math.random() * memes.length)];
    }
  }

  // ========== 輔助方法 ==========

  /**
   * 分割長消息
   */
  splitMessage(text, maxLength = 4000) {
    const chunks = [];
    let current = '';
    for (const line of text.split('\n')) {
      if (current.length + line.length + 1 > maxLength) {
        chunks.push(current);
        current = line;
      } else {
        current += (current ? '\n' : '') + line;
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  /**
   * 輔助函數 - 睡眠
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 停止
   */
  stop() {
    if (this.bot) {
      this.bot.stopPolling();
      
      // 清除所有計時器
      for (const timer of this.idleChatTimer.values()) {
        clearTimeout(timer);
      }
      
      logger.info('Avatar bot stopped');
    }
  }
}

export default new AvatarService();
