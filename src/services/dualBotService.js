/**
 * 雙 Bot 協調服務
 * 
 * 協調 BongBong 和 Avatar (周文虛擬分身) 的互動
 * 
 * 互動模式:
 * 1. BongBong 回覆後，Avatar 接話 (3秒延遲)
 * 2. Avatar 接話後，BongBong 15% 概率爆擊
 * 3. 群聊空閒1小時，觸發閒聊
 * 4. 每90分鐘一次閒聊 (2輪4回合)
 * 5. 每日一次吹捧周文老師
 */

import TelegramBot from 'node-telegram-bot-api';
import config from '../../config/index.js';
import { BONGBONG_PERSONA } from '../../config/bongbong.js';
import { AVATAR_PERSONA } from '../../config/avatar.js';
import bongbongService from './bongbongService.js';
import avatarService from './avatarService.js';
import groupMemoryService from './groupMemoryService.js';
import memoryService from './memoryService.js';
import menuService, { MAIN_MENU } from './menuService.js';
import newsService from './newsService.js';
import imageService from './imageService.js';
import visionService from './visionService.js';
import { handleVoiceMessage } from '../handlers/voiceHandlerV2.js';
import { detectKeyword, isDrawRequest, isNewsRequest, extractDrawPrompt } from '../utils/keywords.js';
import logger from '../utils/logger.js';

class DualBotService {
  constructor() {
    this.bongbongBot = null;
    this.avatarBot = null;
    this.initialized = false;
    
    // 群聊追蹤
    this.activeGroups = new Set();
    this.conversationHistory = new Map();
    
    // 計時器
    this.idleTimers = new Map();
    this.dailyPraiseTimer = null;
  }

  /**
   * 初始化雙 Bot
   */
  async init() {
    try {
      const bongbongToken = config.telegram.botToken;
      const avatarToken = process.env.TELEGRAM_BOT_TOKEN_AVATAR;

      if (!bongbongToken) {
        throw new Error('BongBong token not configured');
      }

      // 初始化 BongBong Bot
      this.bongbongBot = new TelegramBot(bongbongToken, { polling: true });
      await bongbongService.init();
      
      // 初始化 Avatar Bot
      if (avatarToken) {
        await avatarService.init(avatarToken);
        this.avatarBot = avatarService.bot;
        
        // 設置 Avatar 消息回調
        avatarService.setOnAvatarMessage(this.handleAvatarSpoke.bind(this));
      } else {
        logger.warn('Avatar token not configured, running in single bot mode');
      }

      // 初始化其他服務
      await groupMemoryService.connect();
      await newsService.init();
      await imageService.init();
      visionService.init();

      // 註冊處理器
      this.registerBongBongHandlers();
      
      // 啟動定時任務
      this.startScheduledTasks();

      this.initialized = true;
      logger.info('🎭 Dual Bot Service initialized');
      logger.info('  - BongBong: @qitiandashengqianqian_bot');
      if (avatarToken) {
        logger.info('  - Avatar: @svs_notion_bot');
      }
      
      return true;
    } catch (error) {
      logger.error('Dual bot init error:', error);
      throw error;
    }
  }

  /**
   * 註冊 BongBong 處理器
   */
  registerBongBongHandlers() {
    // 命令處理
    this.bongbongBot.onText(/\/start/, (msg) => this.handleStart(msg));
    this.bongbongBot.onText(/\/menu/, (msg) => this.showMainMenu(msg.chat.id));
    this.bongbongBot.onText(/\/help/, (msg) => this.handleHelp(msg));
    this.bongbongBot.onText(/\/news/, (msg) => this.handleNews(msg));
    this.bongbongBot.onText(/\/draw(?:\s+(.+))?/, (msg, match) => this.handleDraw(msg, match));
    this.bongbongBot.onText(/\/stats/, (msg) => this.handleStats(msg));
    this.bongbongBot.onText(/\/task/, (msg) => this.handleDailyTask(msg));

    // 消息處理
    this.bongbongBot.on('message', async (msg) => {
      if (msg.text?.startsWith('/')) return;

      const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
      
      // 記錄群聊
      if (isGroup) {
        this.activeGroups.add(msg.chat.id.toString());
        this.resetIdleTimer(msg.chat.id);
      }

      // 語音消息
      if (msg.voice) {
        await handleVoiceMessage(this.bongbongBot, msg);
        return;
      }

      // 圖片消息
      if (msg.photo) {
        await this.handlePhotoMessage(msg);
        return;
      }

      // 文本消息
      if (msg.text) {
        await this.handleBongBongMessage(msg);
      }
    });

    // 回調處理
    this.bongbongBot.on('callback_query', async (query) => {
      await this.handleCallback(query);
    });

    // 錯誤處理
    this.bongbongBot.on('polling_error', (error) => {
      logger.error('BongBong polling error:', error.message);
    });
  }

  /**
   * 處理 BongBong 消息
   */
  async handleBongBongMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const userName = msg.from.first_name || '用戶';
    const text = msg.text;
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    try {
      // 記錄到群記憶
      if (isGroup) {
        await groupMemoryService.logGroupMessage({
          groupId: chatId.toString(),
          userId,
          userName,
          content: text,
          isBot: false
        });
      }

      // 檢測關鍵詞
      const keyword = detectKeyword(text);
      if (keyword) {
        await this.handleKeywordAction(chatId, userId, keyword, text);
        return;
      }

      // 檢測新聞/畫畫請求
      if (isNewsRequest(text)) {
        await this.handleNews(msg);
        return;
      }
      if (isDrawRequest(text)) {
        await this.handleDraw(msg, [null, extractDrawPrompt(text)]);
        return;
      }

      // 發送輸入狀態
      await this.bongbongBot.sendChatAction(chatId, 'typing');

      // 獲取上下文
      let history = [];
      if (isGroup) {
        const groupHistory = await groupMemoryService.getGroupHistory(chatId.toString(), 20);
        history = groupHistory.reverse().map(m => ({
          role: m.isBot ? 'assistant' : 'user',
          content: `${m.userName}: ${m.content}`
        }));
      } else {
        history = this.getHistory(userId);
      }

      // 生成回覆
      const result = await bongbongService.generateResponse(text, {
        userId,
        chatId,
        userName,
        history
      });

      // 構建回覆 (精簡儀表盤)
      const responseText = `${result.response}${result.dashboard}`;

      // 發送回覆 (帶精簡菜單按鈕)
      const sentMessage = await this.bongbongBot.sendMessage(chatId, responseText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📋', callback_data: 'menu_main' },
              { text: '💾', callback_data: 'quick_save' },
              { text: '🔄', callback_data: 'quick_regenerate' }
            ]
          ]
        }
      });

      // 記錄 BongBong 的回覆
      if (isGroup) {
        await groupMemoryService.logGroupMessage({
          groupId: chatId.toString(),
          userId: 'bongbong',
          userName: 'BongBong',
          content: result.response,
          isBot: true,
          botName: 'qitiandashengqianqian_bot'
        });

        // 通知 Avatar 接話
        if (this.avatarBot) {
          setTimeout(() => {
            avatarService.respondToBongBong(chatId, result.response, sentMessage.message_id);
          }, AVATAR_PERSONA.triggers.afterBongBongDelay);
        }
      }

      // 更新歷史
      if (!isGroup) {
        this.addToHistory(userId, { role: 'user', content: text });
        this.addToHistory(userId, { role: 'assistant', content: result.response });
      }

    } catch (error) {
      logger.error('BongBong message error:', error);
      await this.bongbongBot.sendMessage(chatId, `❌ 處理消息時出錯: ${error.message}`);
    }
  }

  /**
   * 處理 Avatar 說話後的回調
   */
  async handleAvatarSpoke(chatId, avatarMessage, messageId) {
    // 檢查是否應該爆擊回覆
    const counterResult = await bongbongService.handleAvatarMessage(avatarMessage);
    
    if (counterResult.shouldRespond && counterResult.response) {
      // 延遲後爆擊回覆
      setTimeout(async () => {
        try {
          await this.bongbongBot.sendMessage(chatId, `🎯 ${counterResult.response}`, {
            reply_to_message_id: messageId
          });

          // 記錄到群記憶
          await groupMemoryService.logGroupMessage({
            groupId: chatId.toString(),
            userId: 'bongbong',
            userName: 'BongBong',
            content: counterResult.response,
            isBot: true,
            botName: 'qitiandashengqianqian_bot'
          });

          logger.info(`BongBong counter-attacked in group ${chatId}`);
        } catch (error) {
          logger.error('Counter attack send error:', error);
        }
      }, 2000);
    }
  }

  /**
   * 重置空閒計時器
   */
  resetIdleTimer(chatId) {
    const groupId = chatId.toString();
    
    if (this.idleTimers.has(groupId)) {
      clearTimeout(this.idleTimers.get(groupId));
    }

    // 1小時後觸發閒聊
    const timer = setTimeout(() => {
      this.triggerIdleChat(chatId);
    }, AVATAR_PERSONA.triggers.idleTriggerMinutes * 60 * 1000);

    this.idleTimers.set(groupId, timer);
  }

  /**
   * 觸發閒聊
   */
  async triggerIdleChat(chatId) {
    if (!this.avatarBot) return;

    const groupId = chatId.toString();
    
    // 檢查是否真的空閒
    if (!groupMemoryService.isGroupIdle(groupId, AVATAR_PERSONA.triggers.idleTriggerMinutes)) {
      return;
    }

    logger.info(`Triggering idle chat in group ${groupId}`);

    try {
      // 2輪4回合閒聊
      for (let round = 0; round < AVATAR_PERSONA.triggers.idleChatRounds; round++) {
        // 獲取隨機話題
        const randomTopic = await groupMemoryService.getRandomTopic(groupId);
        
        // Avatar 開場或擴展話題
        let avatarMsg;
        if (randomTopic && Math.random() > 0.5) {
          avatarMsg = await avatarService.expandTopic(chatId, randomTopic.content);
        } else {
          avatarMsg = await avatarService.generateAvatarResponse(chatId, '', 'idle');
          if (avatarMsg) {
            await this.avatarBot.sendMessage(chatId, avatarMsg);
            await groupMemoryService.logGroupMessage({
              groupId,
              userId: 'avatar',
              userName: '周文 (虛擬)',
              content: avatarMsg,
              isBot: true,
              botName: 'svs_notion_bot'
            });
          }
        }

        // 等待 BongBong 回覆
        await this.sleep(5000);

        // BongBong 回覆
        if (avatarMsg) {
          const bongbongResponse = await bongbongService.generateResponse(
            `周文說：${avatarMsg}`,
            { userId: 'idle_chat', chatId, history: [] }
          );

          if (bongbongResponse.response) {
            const sent = await this.bongbongBot.sendMessage(chatId, 
              `${bongbongResponse.icon} ${bongbongResponse.response}`
            );

            await groupMemoryService.logGroupMessage({
              groupId,
              userId: 'bongbong',
              userName: 'BongBong',
              content: bongbongResponse.response,
              isBot: true,
              botName: 'qitiandashengqianqian_bot'
            });

            // Avatar 可能接話
            setTimeout(() => {
              avatarService.respondToBongBong(chatId, bongbongResponse.response, sent.message_id);
            }, 3000);
          }
        }

        // 等待下一輪
        await this.sleep(30000);
      }

    } catch (error) {
      logger.error('Idle chat error:', error);
    }
  }

  /**
   * 啟動定時任務
   */
  startScheduledTasks() {
    // 每日吹捧檢查 (每小時檢查一次)
    this.dailyPraiseTimer = setInterval(() => {
      this.checkDailyPraise();
    }, 60 * 60 * 1000);

    // 立即檢查一次
    setTimeout(() => this.checkDailyPraise(), 10000);
  }

  /**
   * 檢查每日吹捧
   */
  async checkDailyPraise() {
    if (!this.avatarBot) return;

    const now = new Date();
    const hour = now.getHours();
    
    // 在上午10點到下午6點之間隨機觸發
    if (hour >= 10 && hour <= 18) {
      for (const groupId of this.activeGroups) {
        await avatarService.triggerDailyPraise(parseInt(groupId));
      }
    }
  }

  /**
   * 處理 /start
   */
  async handleStart(msg) {
    const chatId = msg.chat.id;
    const userName = msg.from.first_name || '朋友';
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    if (isGroup) {
      this.activeGroups.add(chatId.toString());
    }

    const welcomeText = `🎭 *歡迎，${userName}！*

我是 *BongBong*，你的全能 AI 助手。

${isGroup ? '在群裡，我會和周文的虛擬分身一起陪你聊天！' : '有什麼需要幫忙的嗎？'}

點擊下方按鈕開始探索吧！`;

    await this.bongbongBot.sendMessage(chatId, welcomeText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: MAIN_MENU.keyboard
      }
    });
  }

  /**
   * 處理關鍵詞動作
   */
  async handleKeywordAction(chatId, userId, keyword, originalText) {
    switch (keyword.action) {
      case 'news':
        await this.handleNews({ chat: { id: chatId } });
        break;
      case 'draw':
        await this.handleDraw({ chat: { id: chatId }, from: { id: userId } }, [null, extractDrawPrompt(originalText)]);
        break;
      case 'menu':
        await this.showMainMenu(chatId);
        break;
      case 'health':
        await menuService.sendMenu(this.bongbongBot, chatId, 'health');
        break;
      case 'games':
        await menuService.sendMenu(this.bongbongBot, chatId, 'games');
        break;
      case 'brainTeaser':
        await this.sendBrainTeaser(chatId, userId);
        break;
      case 'fortune':
        await this.handleFortune(chatId, userId);
        break;
      default:
        break;
    }
  }

  /**
   * 處理圖片消息 - Gemini 多模態分析
   */
  async handlePhotoMessage(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const userName = msg.from.first_name || '用戶';
    const caption = msg.caption || '';
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

    try {
      // 發送處理中狀態
      await this.bongbongBot.sendChatAction(chatId, 'typing');
      const processingMsg = await this.bongbongBot.sendMessage(chatId, '🔍 正在分析圖片...');

      // 獲取最大尺寸的圖片
      const photo = msg.photo[msg.photo.length - 1];
      const file = await this.bongbongBot.getFile(photo.file_id);
      const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;

      // 使用 Vision 服務分析
      const result = await visionService.analyzeImage(fileUrl, caption);

      // 刪除處理中消息
      try {
        await this.bongbongBot.deleteMessage(chatId, processingMsg.message_id);
      } catch (e) {}

      if (result.success) {
        // 分段發送分析結果
        const chunks = this.splitMessage(result.analysis, 4000);
        for (const chunk of chunks) {
          await this.bongbongBot.sendMessage(chatId, 
            `📸 *圖片分析*\n\n${chunk}`,
            { parse_mode: 'Markdown' }
          );
        }

        // 記錄到群記憶
        if (isGroup) {
          await groupMemoryService.logGroupMessage({
            groupId: chatId.toString(),
            userId,
            userName,
            content: `[圖片] ${caption || '(無說明)'}\n分析: ${result.analysis.substring(0, 500)}...`,
            isBot: false,
            metadata: { type: 'image', hasCaption: !!caption }
          });
        }
      } else {
        await this.bongbongBot.sendMessage(chatId, `❌ 圖片分析失敗: ${result.error}`);
      }

      logger.info(`Photo analyzed for user ${userId}`);

    } catch (error) {
      logger.error('Photo handler error:', error);
      await this.bongbongBot.sendMessage(chatId, `❌ 處理圖片時出錯: ${error.message}`);
    }
  }

  /**
   * 處理新聞
   */
  async handleNews(msg) {
    const chatId = msg.chat.id;
    
    try {
      await this.bongbongBot.sendMessage(chatId, '📰 正在獲取今日新聞...');
      await this.bongbongBot.sendChatAction(chatId, 'typing');
      
      const news = await newsService.getDailyNews();
      const chunks = this.splitMessage(news, 4000);
      
      for (const chunk of chunks) {
        await this.bongbongBot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
      }
    } catch (error) {
      logger.error('News error:', error);
      await this.bongbongBot.sendMessage(chatId, `❌ 獲取新聞失敗: ${error.message}`);
    }
  }

  /**
   * 處理畫畫
   */
  async handleDraw(msg, match) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id?.toString() || 'unknown';
    const prompt = match?.[1] || null;

    try {
      await this.bongbongBot.sendMessage(chatId, '🎨 正在創作...');
      await this.bongbongBot.sendChatAction(chatId, 'typing');
      
      const finalPrompt = prompt || await imageService.getPersonalizedTopic(userId);
      const result = await imageService.generateImageDescription(finalPrompt, userId);
      
      if (result.success) {
        await this.bongbongBot.sendMessage(chatId, 
          `🎨 *畫作描述*\n\n📝 *主題*: ${finalPrompt}\n\n🖼️ ${result.description}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await this.bongbongBot.sendMessage(chatId, `❌ 創作失敗: ${result.error}`);
      }
    } catch (error) {
      logger.error('Draw error:', error);
      await this.bongbongBot.sendMessage(chatId, `❌ 創作失敗: ${error.message}`);
    }
  }

  /**
   * 處理統計
   */
  async handleStats(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    const stats = await memoryService.getStats(userId);
    const usage = bongbongService.getUsageStats();

    const text = `📊 *BongBong 統計*

💬 對話記錄: ${stats.conversations}
💾 記憶存檔: ${stats.memories}
📝 便簽數量: ${stats.notes}

🤖 *模型使用比例*
• Gemini: ${usage.routing.gemini.ratio}
• Grok: ${usage.routing.grok.ratio}`;

    await this.bongbongBot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  /**
   * 處理運勢
   */
  async handleFortune(chatId, userId) {
    await this.bongbongBot.sendChatAction(chatId, 'typing');
    
    const result = await bongbongService.generateResponse(
      '幫我算一下今天的運勢，包括事業、感情、健康，用幽默的方式說',
      { userId, chatId, history: [] }
    );
    
    await this.bongbongBot.sendMessage(chatId, 
      `🔮 *今日運勢*\n\n${result.response}`,
      { parse_mode: 'Markdown' }
    );
  }

  /**
   * 發送腦筋急轉彎
   */
  async sendBrainTeaser(chatId, userId) {
    const teasers = BONGBONG_PERSONA.dailyTaskTemplates.brainTeaser;
    const teaser = teasers[Math.floor(Math.random() * teasers.length)];
    await this.bongbongBot.sendMessage(chatId, teaser);
    await memoryService.logDailyTask(userId, 'brainTeaser');
  }

  /**
   * 處理每日任務
   */
  async handleDailyTask(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    const tasks = await memoryService.getTodayTasks(userId);
    const completedTypes = tasks.filter(t => t.completed).map(t => t.taskType);

    let text = '📋 *今日任務*\n\n';
    const taskList = [
      { type: 'brainTeaser', name: '🧩 腦筋急轉彎', completed: completedTypes.includes('brainTeaser') },
      { type: 'healthTip', name: '🌿 養生小貼士', completed: completedTypes.includes('healthTip') },
      { type: 'chat', name: '💬 和 BongBong 聊天', completed: completedTypes.includes('chat') }
    ];

    taskList.forEach(task => {
      text += `${task.completed ? '✅' : '⬜'} ${task.name}\n`;
    });

    await this.bongbongBot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  }

  /**
   * 處理幫助
   */
  async handleHelp(msg) {
    const chatId = msg.chat.id;
    const helpText = `🎭 *BongBong 使用指南*

*快捷關鍵詞* (支持簡繁體)
• 報新聞/报新闻 - 每日新聞
• 畫畫/画画 - 生成圖片
• 養生/养生 - 養生專區
• 算命/運勢 - 今日運勢

*命令*
• /start - 開始
• /menu - 菜單
• /news - 新聞
• /draw - 畫畫
• /stats - 統計
• /task - 每日任務

*群聊特色*
• 周文虛擬分身會接話
• 空閒時自動閒聊
• 跨用戶記憶共享`;

    await this.bongbongBot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
  }

  /**
   * 處理回調
   */
  async handleCallback(query) {
    const chatId = query.message.chat.id;
    const userId = query.from.id.toString();
    const data = query.data;
    const messageId = query.message.message_id;

    await this.bongbongBot.answerCallbackQuery(query.id);

    // ===== 菜單導航 =====
    if (data.startsWith('menu_')) {
      const menuName = data.replace('menu_', '');
      await menuService.updateMenu(this.bongbongBot, chatId, messageId, menuName);
      return;
    }

    // ===== 聊天模式 =====
    if (data.startsWith('chat_')) {
      const mode = data.replace('chat_', '');
      switch (mode) {
        case 'fast':
          await this.bongbongBot.sendMessage(chatId, '🚀 *快速問答模式*\n\n直接發送你的問題，我會快速回答！', { parse_mode: 'Markdown' });
          break;
        case 'deep':
          await this.bongbongBot.sendMessage(chatId, '🧠 *深度分析模式*\n\n發送複雜問題，我會詳細分析！', { parse_mode: 'Markdown' });
          break;
        case 'humor':
          await this.bongbongBot.sendMessage(chatId, '😎 *幽默模式*\n\n來聊點輕鬆的吧！', { parse_mode: 'Markdown' });
          break;
        case 'emotional':
          await this.bongbongBot.sendMessage(chatId, '💝 *情感支持模式*\n\n有什麼煩心事可以跟我說。', { parse_mode: 'Markdown' });
          break;
        case 'fortune':
          await this.handleFortune(chatId, userId);
          break;
        case 'knowledge':
          await this.bongbongBot.sendMessage(chatId, '📚 *知識問答模式*\n\n問我任何知識問題！', { parse_mode: 'Markdown' });
          break;
        case 'fullpower':
          await this.bongbongBot.sendMessage(chatId, 
            `🔥 *全火力模式啟動*\n\n這是深度分析模式，用於複雜問題：\n\n• Gemini Pro 嚴謹分析\n• Grok Mini 擴散思考\n• 語意分析決定 token 用量\n\n發送你的問題，我會全力分析！`, 
            { parse_mode: 'Markdown' }
          );
          break;
      }
      return;
    }

    // ===== 記事本 =====
    if (data.startsWith('notes_')) {
      const action = data.replace('notes_', '');
      switch (action) {
        case 'new':
          await this.bongbongBot.sendMessage(chatId, '📝 *新建便簽*\n\n請發送你要記錄的內容，格式：\n`標題 | 內容`', { parse_mode: 'Markdown' });
          break;
        case 'list':
          await this.bongbongBot.sendMessage(chatId, '📋 *你的便簽*\n\n(功能開發中...)', { parse_mode: 'Markdown' });
          break;
        case 'search':
          await this.bongbongBot.sendMessage(chatId, '🔍 *搜索筆記*\n\n發送關鍵詞搜索你的筆記。', { parse_mode: 'Markdown' });
          break;
        case 'save_chat':
          await this.bongbongBot.sendMessage(chatId, '💾 *對話已保存*', { parse_mode: 'Markdown' });
          break;
      }
      return;
    }

    // ===== 創作工具 =====
    if (data.startsWith('creative_')) {
      const action = data.replace('creative_', '');
      if (action === 'image') {
        await menuService.updateMenu(this.bongbongBot, chatId, messageId, 'image');
      } else if (action === 'video') {
        await menuService.updateMenu(this.bongbongBot, chatId, messageId, 'video');
      }
      return;
    }

    // ===== 圖片生成 =====
    if (data.startsWith('image_')) {
      const style = data.replace('image_', '');
      await this.bongbongBot.sendMessage(chatId, `🎨 *${style} 風格*\n\n發送你想畫的內容描述。`, { parse_mode: 'Markdown' });
      return;
    }

    // ===== 腦力訓練 =====
    if (data.startsWith('brain_')) {
      const action = data.replace('brain_', '');
      switch (action) {
        case 'teaser':
          await this.sendBrainTeaser(chatId, userId);
          break;
        case 'memory':
          await this.bongbongBot.sendMessage(chatId, '🧠 *記憶訓練*\n\n(功能開發中...)', { parse_mode: 'Markdown' });
          break;
        case 'logic':
          await this.bongbongBot.sendMessage(chatId, '🔢 *邏輯推理*\n\n(功能開發中...)', { parse_mode: 'Markdown' });
          break;
        case 'word':
          await this.bongbongBot.sendMessage(chatId, '📝 *文字遊戲*\n\n(功能開發中...)', { parse_mode: 'Markdown' });
          break;
      }
      return;
    }

    // ===== 養生專區 =====
    if (data.startsWith('health_')) {
      const action = data.replace('health_', '');
      switch (action) {
        case 'symptom':
          await this.bongbongBot.sendMessage(chatId, '🏥 *症狀查詢*\n\n描述你的症狀，我會給出建議。\n\n⚠️ 僅供參考，如有不適請就醫。', { parse_mode: 'Markdown' });
          break;
        case 'medicine':
          await this.bongbongBot.sendMessage(chatId, '💊 *藥物諮詢*\n\n告訴我藥物名稱，我會查詢相關信息。', { parse_mode: 'Markdown' });
          break;
        case 'food':
          await this.bongbongBot.sendMessage(chatId, '🍵 *食療養生*\n\n告訴我你的體質或症狀，我推薦食療方案。', { parse_mode: 'Markdown' });
          break;
        case 'tip':
          await this.bongbongBot.sendMessage(chatId, '💡 *今日養生小貼士*\n\n多喝水，早睡早起，保持心情愉快！', { parse_mode: 'Markdown' });
          break;
      }
      return;
    }

    // ===== 遊戲 =====
    if (data.startsWith('game_')) {
      const game = data.replace('game_', '');
      await this.bongbongBot.sendMessage(chatId, `🎮 *${game} 遊戲*\n\n(功能開發中...)`, { parse_mode: 'Markdown' });
      return;
    }

    // ===== 設置 =====
    if (data.startsWith('settings_')) {
      const setting = data.replace('settings_', '');
      if (setting === 'memory') {
        await menuService.updateMenu(this.bongbongBot, chatId, messageId, 'memory');
      } else {
        await this.bongbongBot.sendMessage(chatId, `⚙️ *${setting} 設置*\n\n(功能開發中...)`, { parse_mode: 'Markdown' });
      }
      return;
    }

    // ===== 快捷操作 =====
    if (data.startsWith('quick_')) {
      const action = data.replace('quick_', '');
      switch (action) {
        case 'save':
          await this.bongbongBot.sendMessage(chatId, '💾 已保存！');
          break;
        case 'regenerate':
          await this.bongbongBot.sendMessage(chatId, '🔄 重新生成中...');
          break;
      }
      return;
    }
  }

  /**
   * 顯示主菜單
   */
  async showMainMenu(chatId) {
    await menuService.sendMenu(this.bongbongBot, chatId, 'main');
  }

  // 輔助方法
  getHistory(userId) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, []);
    }
    return this.conversationHistory.get(userId);
  }

  addToHistory(userId, message) {
    const history = this.getHistory(userId);
    history.push(message);
    if (history.length > 20) history.shift();
  }

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

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 停止
   */
  stop() {
    if (this.bongbongBot) {
      this.bongbongBot.stopPolling();
    }
    avatarService.stop();
    
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    if (this.dailyPraiseTimer) {
      clearInterval(this.dailyPraiseTimer);
    }
    
    logger.info('Dual bot service stopped');
  }
}

export default new DualBotService();
