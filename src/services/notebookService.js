/**
 * 多用户笔记本服务
 * 
 * 功能:
 * - 支持多用户各自的笔记本
 * - 母亲笔记本 / 我的笔记本
 * - 自动摘抄 AI 输出
 * - 知识库积累
 */

import { MongoClient } from 'mongodb';
import config from '../../config/index.js';
import logger from '../utils/logger.js';

// 用户配置
const USER_CONFIG = {
  // 母亲的 Telegram ID（需要配置）
  mother: {
    aliases: ['Leee', 'Cat', '妈', '媽', 'Lee'],
    notebookName: '妈妈的笔记本',
    icon: '👩‍🦳'
  },
  // 你的配置
  zhouwen: {
    aliases: ['周文', 'Zhouwen', 'Zhou'],
    notebookName: '我的笔记本',
    icon: '👨‍💻'
  }
};

class NotebookService {
  constructor() {
    this.client = null;
    this.db = null;
    this.collections = {
      notebooks: null,  // 笔记本元数据
      notes: null,      // 笔记内容
      knowledge: null   // 知识库
    };
    this.connected = false;
  }

  /**
   * 连接数据库
   */
  async connect() {
    if (this.connected) return true;

    try {
      const uri = config.mongodb.uri;
      this.client = new MongoClient(uri);
      await this.client.connect();
      
      this.db = this.client.db(config.mongodb.dbName);
      this.collections.notebooks = this.db.collection('notebooks');
      this.collections.notes = this.db.collection('user_notes');
      this.collections.knowledge = this.db.collection('knowledge_base');

      // 创建索引
      await this.createIndexes();
      
      this.connected = true;
      logger.info('Notebook service connected');
      return true;
    } catch (error) {
      logger.error('Notebook service connection error:', error);
      return false;
    }
  }

  /**
   * 创建索引
   */
  async createIndexes() {
    try {
      await this.collections.notes.createIndex({ oderId: 1 });
      await this.collections.notes.createIndex({ oderId: 1, category: 1 });
      await this.collections.notes.createIndex({ createdAt: -1 });
      await this.collections.notes.createIndex({ 
        title: 'text', 
        content: 'text' 
      });
      
      await this.collections.knowledge.createIndex({ category: 1 });
      await this.collections.knowledge.createIndex({ tags: 1 });
    } catch (error) {
      logger.error('Index creation error:', error);
    }
  }

  /**
   * 识别用户类型
   */
  identifyUser(userName, userId) {
    const lowerName = (userName || '').toLowerCase();
    
    // 检查是否是母亲
    for (const alias of USER_CONFIG.mother.aliases) {
      if (lowerName.includes(alias.toLowerCase())) {
        return { type: 'mother', config: USER_CONFIG.mother, userId };
      }
    }
    
    // 检查是否是周文
    for (const alias of USER_CONFIG.zhouwen.aliases) {
      if (lowerName.includes(alias.toLowerCase())) {
        return { type: 'zhouwen', config: USER_CONFIG.zhouwen, userId };
      }
    }
    
    // 默认返回普通用户
    return { 
      type: 'user', 
      config: { notebookName: '我的笔记', icon: '📝' },
      userId 
    };
  }

  /**
   * 保存笔记
   */
  async saveNote(ownerId, ownerType, note) {
    try {
      const doc = {
        ownerId,
        ownerType,  // 'mother' | 'zhouwen' | 'user'
        title: note.title || '无标题',
        content: note.content,
        category: note.category || 'general',
        tags: note.tags || [],
        source: note.source || 'manual',  // 'manual' | 'auto' | 'ai_output'
        aiModel: note.aiModel || null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await this.collections.notes.insertOne(doc);
      logger.info(`Note saved for ${ownerType}: ${note.title}`);
      
      return { 
        success: true, 
        id: result.insertedId,
        ...doc 
      };
    } catch (error) {
      logger.error('Save note error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 保存到母亲的笔记本
   */
  async saveToMotherNotebook(content, options = {}) {
    const { title, category, tags, source, aiModel } = options;
    
    return await this.saveNote('mother', 'mother', {
      title: title || this.generateTitle(content),
      content,
      category: category || 'ai_knowledge',
      tags: tags || this.extractTags(content),
      source: source || 'ai_output',
      aiModel
    });
  }

  /**
   * 保存到我的笔记本
   */
  async saveToMyNotebook(userId, content, options = {}) {
    const { title, category, tags, source, aiModel } = options;
    
    return await this.saveNote(userId, 'zhouwen', {
      title: title || this.generateTitle(content),
      content,
      category: category || 'ai_knowledge',
      tags: tags || this.extractTags(content),
      source: source || 'ai_output',
      aiModel
    });
  }

  /**
   * 获取笔记列表
   */
  async getNotes(ownerId, ownerType, options = {}) {
    const { limit = 20, category, search } = options;
    
    try {
      const query = { ownerType };
      if (ownerId && ownerType !== 'mother') {
        query.ownerId = ownerId;
      }
      if (category) {
        query.category = category;
      }
      
      let cursor;
      if (search) {
        cursor = this.collections.notes.find({
          ...query,
          $text: { $search: search }
        });
      } else {
        cursor = this.collections.notes.find(query);
      }
      
      return await cursor
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
    } catch (error) {
      logger.error('Get notes error:', error);
      return [];
    }
  }

  /**
   * 获取母亲的笔记
   */
  async getMotherNotes(options = {}) {
    return await this.getNotes(null, 'mother', options);
  }

  /**
   * 获取我的笔记
   */
  async getMyNotes(userId, options = {}) {
    return await this.getNotes(userId, 'zhouwen', options);
  }

  /**
   * 自动生成标题
   */
  generateTitle(content) {
    if (!content) return '无标题';
    
    // 尝试提取第一行作为标题
    const firstLine = content.split('\n')[0]
      .replace(/^#+\s*/, '')
      .replace(/\*\*/g, '')
      .trim();
    
    if (firstLine.length > 0 && firstLine.length <= 30) {
      return firstLine;
    }
    
    // 截取前20个字符
    return content.substring(0, 20).replace(/\n/g, ' ') + '...';
  }

  /**
   * 自动提取标签
   */
  extractTags(content) {
    const tags = [];
    const lowerContent = content.toLowerCase();
    
    // 签证相关
    if (/签证|visa|移民|入境/.test(lowerContent)) {
      tags.push('签证');
    }
    
    // 养生相关
    if (/养生|健康|中医|穴位|食疗/.test(lowerContent)) {
      tags.push('养生');
    }
    
    // 泰国相关
    if (/泰国|泰铢|曼谷|清迈/.test(lowerContent)) {
      tags.push('泰国');
    }
    
    // 政策相关
    if (/政策|规定|要求|条件/.test(lowerContent)) {
      tags.push('政策');
    }
    
    return tags;
  }

  /**
   * 添加到知识库
   */
  async addToKnowledge(content, options = {}) {
    try {
      const doc = {
        content,
        category: options.category || 'general',
        tags: options.tags || this.extractTags(content),
        source: options.source || 'ai_output',
        aiModel: options.aiModel,
        createdAt: new Date()
      };

      await this.collections.knowledge.insertOne(doc);
      logger.info('Knowledge added:', doc.category);
      return { success: true };
    } catch (error) {
      logger.error('Add knowledge error:', error);
      return { success: false };
    }
  }

  /**
   * 搜索知识库
   */
  async searchKnowledge(query, options = {}) {
    const { limit = 10, category } = options;
    
    try {
      const filter = {};
      if (category) filter.category = category;
      
      return await this.collections.knowledge
        .find({
          ...filter,
          $text: { $search: query }
        })
        .limit(limit)
        .toArray();
    } catch (error) {
      logger.error('Search knowledge error:', error);
      return [];
    }
  }

  /**
   * 获取笔记统计
   */
  async getStats(ownerType) {
    try {
      const total = await this.collections.notes.countDocuments({ ownerType });
      const categories = await this.collections.notes.aggregate([
        { $match: { ownerType } },
        { $group: { _id: '$category', count: { $sum: 1 } } }
      ]).toArray();
      
      return { total, categories };
    } catch (error) {
      logger.error('Get stats error:', error);
      return { total: 0, categories: [] };
    }
  }
}

export default new NotebookService();
