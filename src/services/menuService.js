/**
 * 互動菜單服務 - Telegram Inline Keyboard
 * 
 * 為母親設計的友好界面，無需輸入 /指令
 */

export const MAIN_MENU = {
  text: `🎭 *BongBong 主菜單*

選擇你想要的功能：`,
  
  keyboard: [
    [
      { text: '💬 聊天對話', callback_data: 'menu_chat' },
      { text: '📝 記事本', callback_data: 'menu_notes' }
    ],
    [
      { text: '🎨 創作工具', callback_data: 'menu_creative' },
      { text: '🧠 腦力訓練', callback_data: 'menu_brain' }
    ],
    [
      { text: '🌿 養生專區', callback_data: 'menu_health' },
      { text: '🎮 休閒遊戲', callback_data: 'menu_games' }
    ],
    [
      { text: '⚙️ 設置', callback_data: 'menu_settings' },
      { text: '📊 統計', callback_data: 'menu_stats' }
    ]
  ]
};

export const CHAT_MENU = {
  text: `💬 *聊天模式*

選擇對話風格：`,
  
  keyboard: [
    [
      { text: '🚀 快速問答', callback_data: 'chat_fast' },
      { text: '🧠 深度分析', callback_data: 'chat_deep' }
    ],
    [
      { text: '😎 幽默模式', callback_data: 'chat_humor' },
      { text: '💝 情感支持', callback_data: 'chat_emotional' }
    ],
    [
      { text: '🔮 玄學算命', callback_data: 'chat_fortune' },
      { text: '📚 知識問答', callback_data: 'chat_knowledge' }
    ],
    [
      { text: '🔥 全火力模式', callback_data: 'chat_fullpower' }
    ],
    [
      { text: '◀️ 返回主菜單', callback_data: 'menu_main' }
    ]
  ]
};

// 全火力模式說明
export const FULLPOWER_MODE = {
  text: `🔥 *全火力模式啟動*

這是一個特殊模式，用於複雜問題的深度分析：

**觸發條件：**
- 問題真的很複雜
- 需要多角度分析
- 現實生活中的實際問題

**模型配置：**
- Gemini 2.5 Pro (嚴謹分析)
- Grok 3 Mini (擴散思考)
- 語意分析決定 token 用量

**注意：**
- 會消耗較多 token
- 適合重要問題
- 不適合閒聊

發送你的問題，我會全力分析！`,
  
  keyboard: [
    [
      { text: '◀️ 返回聊天菜單', callback_data: 'menu_chat' }
    ]
  ]
};

export const NOTES_MENU = {
  text: `📝 *記事本*

管理你的筆記和便簽：`,
  
  keyboard: [
    [
      { text: '➕ 新建便簽', callback_data: 'notes_new' },
      { text: '📋 查看全部', callback_data: 'notes_list' }
    ],
    [
      { text: '🔍 搜索筆記', callback_data: 'notes_search' },
      { text: '⭐ 重要筆記', callback_data: 'notes_important' }
    ],
    [
      { text: '💾 保存對話', callback_data: 'notes_save_chat' },
      { text: '📤 導出筆記', callback_data: 'notes_export' }
    ],
    [
      { text: '◀️ 返回主菜單', callback_data: 'menu_main' }
    ]
  ]
};

export const CREATIVE_MENU = {
  text: `🎨 *創作工具*

釋放你的創意：`,
  
  keyboard: [
    [
      { text: '✍️ 寫作助手', callback_data: 'creative_writing' },
      { text: '📖 故事續寫', callback_data: 'creative_story' }
    ],
    [
      { text: '🖼️ 生成圖片', callback_data: 'creative_image' },
      { text: '🎬 生成視頻', callback_data: 'creative_video' }
    ],
    [
      { text: '💡 靈感激發', callback_data: 'creative_inspire' },
      { text: '📝 擴寫潤色', callback_data: 'creative_expand' }
    ],
    [
      { text: '◀️ 返回主菜單', callback_data: 'menu_main' }
    ]
  ]
};

export const IMAGE_MENU = {
  text: `🖼️ *圖片生成*

選擇圖片風格：`,
  
  keyboard: [
    [
      { text: '📷 寫實風格 (Gemini)', callback_data: 'image_realistic' },
      { text: '😂 搞笑模因 (Grok)', callback_data: 'image_meme' }
    ],
    [
      { text: '🎨 藝術風格', callback_data: 'image_art' },
      { text: '🌸 中國風', callback_data: 'image_chinese' }
    ],
    [
      { text: '◀️ 返回創作工具', callback_data: 'menu_creative' }
    ]
  ]
};

export const VIDEO_MENU = {
  text: `🎬 *視頻生成*

⚠️ 每日限制: 5次 (每次8秒)
📊 今日剩餘: {remaining}/5

選擇視頻類型：`,
  
  keyboard: [
    [
      { text: '🎥 生成視頻', callback_data: 'video_generate' }
    ],
    [
      { text: '📊 查看配額', callback_data: 'video_quota' },
      { text: '◀️ 返回', callback_data: 'menu_creative' }
    ]
  ]
};

export const BRAIN_MENU = {
  text: `🧠 *腦力訓練*

保持大腦活力：`,
  
  keyboard: [
    [
      { text: '🧩 腦筋急轉彎', callback_data: 'brain_teaser' },
      { text: '🖼️ 看圖說話', callback_data: 'brain_picture' }
    ],
    [
      { text: '📝 記憶測試', callback_data: 'brain_memory' },
      { text: '🔢 數學題', callback_data: 'brain_math' }
    ],
    [
      { text: '✅ 今日任務', callback_data: 'brain_daily' },
      { text: '🏆 成就', callback_data: 'brain_achievements' }
    ],
    [
      { text: '◀️ 返回主菜單', callback_data: 'menu_main' }
    ]
  ]
};

export const HEALTH_MENU = {
  text: `🌿 *養生專區*

中西醫結合的健康建議：`,
  
  keyboard: [
    [
      { text: '🏥 症狀查詢', callback_data: 'health_symptom' },
      { text: '💊 藥物諮詢', callback_data: 'health_medicine' }
    ],
    [
      { text: '🍵 食療養生', callback_data: 'health_food' },
      { text: '🧘 穴位按摩', callback_data: 'health_acupoint' }
    ],
    [
      { text: '📅 養生日曆', callback_data: 'health_calendar' },
      { text: '💡 今日小貼士', callback_data: 'health_tip' }
    ],
    [
      { text: '◀️ 返回主菜單', callback_data: 'menu_main' }
    ]
  ]
};

export const GAMES_MENU = {
  text: `🎮 *休閒遊戲*

放鬆一下：`,
  
  keyboard: [
    [
      { text: '🔢 數獨', callback_data: 'game_sudoku' },
      { text: '⚫ 五子棋', callback_data: 'game_gomoku' }
    ],
    [
      { text: '🎯 猜謎語', callback_data: 'game_riddle' },
      { text: '📝 成語接龍', callback_data: 'game_idiom' }
    ],
    [
      { text: '◀️ 返回主菜單', callback_data: 'menu_main' }
    ]
  ]
};

export const SETTINGS_MENU = {
  text: `⚙️ *設置*

個性化你的 BongBong：`,
  
  keyboard: [
    [
      { text: '🎭 人格風格', callback_data: 'settings_persona' },
      { text: '🔔 提醒設置', callback_data: 'settings_reminder' }
    ],
    [
      { text: '🤖 模型偏好', callback_data: 'settings_model' },
      { text: '💾 記憶管理', callback_data: 'settings_memory' }
    ],
    [
      { text: '◀️ 返回主菜單', callback_data: 'menu_main' }
    ]
  ]
};

export const MEMORY_MENU = {
  text: `💾 *記憶管理*

管理 BongBong 的記憶：`,
  
  keyboard: [
    [
      { text: '📥 創建存檔點', callback_data: 'memory_checkpoint' },
      { text: '📋 查看記憶', callback_data: 'memory_list' }
    ],
    [
      { text: '🔍 搜索記憶', callback_data: 'memory_search' },
      { text: '🗑️ 清除記憶', callback_data: 'memory_clear' }
    ],
    [
      { text: '◀️ 返回設置', callback_data: 'menu_settings' }
    ]
  ]
};

// 快捷回覆按鈕 (附加在每條消息後)
export const QUICK_ACTIONS = {
  keyboard: [
    [
      { text: '💾 保存', callback_data: 'quick_save' },
      { text: '📋 複製', callback_data: 'quick_copy' },
      { text: '🔄 重新生成', callback_data: 'quick_regenerate' }
    ]
  ]
};

// 確認對話框
export const CONFIRM_DIALOG = (action) => ({
  text: `⚠️ 確認${action}？`,
  keyboard: [
    [
      { text: '✅ 確認', callback_data: `confirm_${action}` },
      { text: '❌ 取消', callback_data: 'confirm_cancel' }
    ]
  ]
});

/**
 * 菜單服務類
 */
class MenuService {
  constructor() {
    this.menus = {
      main: MAIN_MENU,
      chat: CHAT_MENU,
      notes: NOTES_MENU,
      creative: CREATIVE_MENU,
      image: IMAGE_MENU,
      video: VIDEO_MENU,
      brain: BRAIN_MENU,
      health: HEALTH_MENU,
      games: GAMES_MENU,
      settings: SETTINGS_MENU,
      memory: MEMORY_MENU
    };
  }

  /**
   * 獲取菜單
   */
  getMenu(menuName) {
    return this.menus[menuName] || MAIN_MENU;
  }

  /**
   * 構建 Telegram Inline Keyboard
   */
  buildKeyboard(menu) {
    return {
      reply_markup: {
        inline_keyboard: menu.keyboard
      }
    };
  }

  /**
   * 發送菜單
   */
  async sendMenu(bot, chatId, menuName, customText = null) {
    const menu = this.getMenu(menuName);
    const text = customText || menu.text;
    
    return await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: menu.keyboard
      }
    });
  }

  /**
   * 更新菜單 (編輯現有消息)
   */
  async updateMenu(bot, chatId, messageId, menuName, customText = null) {
    const menu = this.getMenu(menuName);
    const text = customText || menu.text;
    
    try {
      return await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: menu.keyboard
        }
      });
    } catch (error) {
      // 忽略 "message is not modified" 錯誤
      if (error.message?.includes('message is not modified')) {
        return null;
      }
      // 如果消息不存在，發送新菜單
      if (error.message?.includes('message to edit not found')) {
        return await this.sendMenu(bot, chatId, menuName, customText);
      }
      throw error;
    }
  }

  /**
   * 添加快捷操作按鈕
   */
  getQuickActions() {
    return {
      reply_markup: {
        inline_keyboard: QUICK_ACTIONS.keyboard
      }
    };
  }
}

export default new MenuService();
