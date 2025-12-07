/**
 * 聊天記錄備份腳本
 * 
 * 每8小時執行一次 (由 PM2 cron 觸發)
 * - 備份群聊記錄到 JSON 文件
 * - 備份到 MongoDB 歸檔集合
 * - 生成向量嵌入 (可選)
 */

import { MongoClient } from 'mongodb';
import fs from 'fs/promises';
import path from 'path';

const BACKUP_DIR = '/mnt/volume_sgp1_01/sms-tg-bot/backups';
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_VPC_URI;
const DB_NAME = 'sms_tg_bot';

async function backup() {
  console.log('📦 Starting chat backup...');
  console.log(`Time: ${new Date().toISOString()}`);

  if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI not set');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // 確保備份目錄存在
    await fs.mkdir(BACKUP_DIR, { recursive: true });

    // 獲取今天的日期
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const timeStr = today.toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');

    // ===== 1. 備份群聊記錄 =====
    console.log('\n📝 Backing up group messages...');
    const groupMessages = await db.collection('group_messages')
      .find({})
      .sort({ timestamp: -1 })
      .limit(10000)  // 最近 10000 條
      .toArray();

    const groupBackupFile = path.join(BACKUP_DIR, `group_messages_${dateStr}_${timeStr}.json`);
    await fs.writeFile(groupBackupFile, JSON.stringify(groupMessages, null, 2));
    console.log(`✅ Group messages: ${groupMessages.length} records -> ${groupBackupFile}`);

    // ===== 2. 備份對話記錄 =====
    console.log('\n💬 Backing up conversations...');
    const conversations = await db.collection('conversations')
      .find({})
      .sort({ timestamp: -1 })
      .limit(5000)
      .toArray();

    const convBackupFile = path.join(BACKUP_DIR, `conversations_${dateStr}_${timeStr}.json`);
    await fs.writeFile(convBackupFile, JSON.stringify(conversations, null, 2));
    console.log(`✅ Conversations: ${conversations.length} records -> ${convBackupFile}`);

    // ===== 3. 備份記憶存檔 =====
    console.log('\n🧠 Backing up memories...');
    const memories = await db.collection('memories')
      .find({})
      .sort({ timestamp: -1 })
      .limit(2000)
      .toArray();

    const memBackupFile = path.join(BACKUP_DIR, `memories_${dateStr}_${timeStr}.json`);
    await fs.writeFile(memBackupFile, JSON.stringify(memories, null, 2));
    console.log(`✅ Memories: ${memories.length} records -> ${memBackupFile}`);

    // ===== 4. 備份用戶檔案 =====
    console.log('\n👤 Backing up user profiles...');
    const profiles = await db.collection('user_profiles')
      .find({})
      .toArray();

    const profileBackupFile = path.join(BACKUP_DIR, `user_profiles_${dateStr}_${timeStr}.json`);
    await fs.writeFile(profileBackupFile, JSON.stringify(profiles, null, 2));
    console.log(`✅ User profiles: ${profiles.length} records -> ${profileBackupFile}`);

    // ===== 5. 歸檔到 MongoDB =====
    console.log('\n📚 Archiving to MongoDB...');
    const archiveCollection = db.collection('chat_archives');
    
    await archiveCollection.insertOne({
      timestamp: new Date(),
      dateStr,
      stats: {
        groupMessages: groupMessages.length,
        conversations: conversations.length,
        memories: memories.length,
        profiles: profiles.length
      },
      backupFiles: [
        groupBackupFile,
        convBackupFile,
        memBackupFile,
        profileBackupFile
      ]
    });
    console.log('✅ Archive record created');

    // ===== 6. 清理舊備份 (保留7天) =====
    console.log('\n🧹 Cleaning old backups...');
    const files = await fs.readdir(BACKUP_DIR);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    
    let cleaned = 0;
    for (const file of files) {
      const filePath = path.join(BACKUP_DIR, file);
      const stat = await fs.stat(filePath);
      if (stat.mtimeMs < sevenDaysAgo) {
        await fs.unlink(filePath);
        cleaned++;
      }
    }
    console.log(`✅ Cleaned ${cleaned} old backup files`);

    // ===== 7. 統計信息 =====
    console.log('\n📊 Backup Summary:');
    console.log(`  - Group Messages: ${groupMessages.length}`);
    console.log(`  - Conversations: ${conversations.length}`);
    console.log(`  - Memories: ${memories.length}`);
    console.log(`  - User Profiles: ${profiles.length}`);
    console.log(`  - Backup Location: ${BACKUP_DIR}`);

    console.log('\n✅ Backup completed successfully!');

  } catch (error) {
    console.error('❌ Backup error:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// 執行備份
backup().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
