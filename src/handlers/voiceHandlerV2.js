/**
 * 語音處理器 v3.0 - 雙 Bot 回覆版
 * 
 * 功能:
 * - 精確轉換語音為文字
 * - BongBong 專業回覆
 * - Avatar 搞笑回覆
 * - 雙 Bot 互動
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import axios from 'axios';
import config from '../../config/index.js';
import bongbongService from '../services/bongbongService.js';
import memoryService from '../services/memoryService.js';
import groupMemoryService from '../services/groupMemoryService.js';
import { AVATAR_PERSONA } from '../../config/avatar.js';
import logger from '../utils/logger.js';

const genAI = new GoogleGenerativeAI(config.apiKeys.gemini);

/**
 * 處理語音消息
 */
export async function handleVoiceMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString();
  const userName = msg.from.first_name || '用戶';

  try {
    // 發送處理中狀態
    await bot.sendChatAction(chatId, 'typing');

    // 1. 獲取語音文件
    const fileId = msg.voice.file_id;
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;

    // 2. 下載音頻數據
    const audioResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const audioData = Buffer.from(audioResponse.data).toString('base64');

    // 3. 使用 Gemini 轉錄語音
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    const transcriptionPrompt = `請精確轉錄這段語音的內容。
要求：
1. 完全按照說話者的原話轉錄
2. 保留語氣詞（嗯、啊、哦等）
3. 如果聽不清楚，用 [聽不清] 標記
4. 只輸出轉錄文字，不要加任何說明

請開始轉錄：`;

    const transcriptionResult = await model.generateContent([
      { text: transcriptionPrompt },
      { inlineData: { mimeType: 'audio/ogg', data: audioData } }
    ]);

    const transcribedText = transcriptionResult.response.text().trim();

    // 4. 發送轉錄結果
    const transcriptMsg = await bot.sendMessage(chatId, 
      `🎤 *語音轉文字：*\n「${transcribedText}」`,
      { parse_mode: 'Markdown' }
    );

    // 5. BongBong 專業回覆
    const bongbongResponse = await bongbongService.generateResponse(transcribedText, {
      userId,
      chatId,
      userName,
      history: []
    });

    const bongbongMsg = `🤖 *BongBong (專業版)*

${bongbongResponse.response}

${bongbongResponse.dashboard}`;

    await bot.sendMessage(chatId, bongbongMsg, {
      parse_mode: 'Markdown',
      reply_to_message_id: transcriptMsg.message_id
    });

    // 6. Avatar 搞笑回覆 (延遲2秒)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const avatarResponse = await generateAvatarVoiceResponse(transcribedText, userName);
    
    await bot.sendMessage(chatId, 
      `🎭 *周文 (搞笑版)*\n\n${avatarResponse}`,
      { 
        parse_mode: 'Markdown',
        reply_to_message_id: transcriptMsg.message_id 
      }
    );

    // 7. 記錄到記憶
    await memoryService.logConversation({
      chatId,
      userId,
      userName,
      message: `[語音] ${transcribedText}`,
      response: `BongBong: ${bongbongResponse.response}\nAvatar: ${avatarResponse}`,
      model: bongbongResponse.modelId,
      tokens: bongbongResponse.tokens?.input + bongbongResponse.tokens?.output || 0,
      memoryRefs: bongbongResponse.memoryRefs
    });

    // 8. 記錄到群記憶
    const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
    if (isGroup) {
      await groupMemoryService.logGroupMessage({
        groupId: chatId.toString(),
        userId,
        userName,
        content: `[語音] ${transcribedText}`,
        isBot: false
      });
    }

    logger.info(`Voice message processed for user ${userId}: "${transcribedText.substring(0, 50)}..."`);

  } catch (error) {
    logger.error('Voice handler error:', error);
    
    await bot.sendMessage(chatId, 
      `❌ 抱歉，處理語音時出現問題。\n\n錯誤: ${error.message}\n\n請嘗試重新發送，或者直接打字告訴我。`,
      { parse_mode: 'Markdown' }
    );
  }
}

/**
 * 生成 Avatar 搞笑回覆
 */
async function generateAvatarVoiceResponse(transcribedText, userName) {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 1.3,  // 高溫度，更搞笑
        maxOutputTokens: 150
      }
    });

    const isMother = userName.includes('Leee') || userName.includes('Cat') || userName.includes('媽');

    const prompt = `${AVATAR_PERSONA.systemPrompt}

用戶 ${userName} 發了一段語音，內容是：「${transcribedText}」

請用無厘頭搞笑的方式回覆，要求：
1. 超短，1-3句話
2. 可以吐槽、抬槓、拋梗
3. ${isMother ? '對母親要表面嫌棄但實際關心' : '貼吧老哥風格'}
4. 可以用網絡梗：「6」「絕了」「好家伙」「笑死」等
5. 可以吐槽語音消息本身

直接輸出回覆：`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();

  } catch (error) {
    logger.error('Avatar voice response error:', error);
    // 回退到模板
    const templates = [
      '語音消息？打字不香嗎 😅',
      '聽了，但沒完全聽懂',
      '好家伙，這語音信息量有點大',
      '6，說得好像很有道理',
      '絕了，我直接一個絕了'
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
}

/**
 * 處理音頻文件（非語音消息）
 */
export async function handleAudioFile(bot, msg) {
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId, 
    '🎵 收到音頻文件！請使用語音消息功能（按住麥克風說話）來與我對話。',
    { parse_mode: 'Markdown' }
  );
}

export default {
  handleVoiceMessage,
  handleAudioFile
};
