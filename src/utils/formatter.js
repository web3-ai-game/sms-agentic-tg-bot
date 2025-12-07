/**
 * 统一输出格式化工具
 * 
 * 规则:
 * 1. 所有 AI 输出使用简体中文
 * 2. 使用 Markdown 格式
 * 3. Telegram 兼容的 MD 格式
 */

/**
 * 繁体转简体映射表（常用字）
 */
const TRAD_TO_SIMP = {
  '簽': '签', '證': '证', '國': '国', '長': '长', '時': '时',
  '間': '间', '費': '费', '護': '护', '機': '机', '場': '场',
  '預': '预', '訂': '订', '銀': '银', '萬': '万', '個': '个',
  '問': '问', '題': '题', '請': '请', '說': '说', '這': '这',
  '裡': '里', '會': '会', '對': '对', '後': '后', '過': '过',
  '還': '还', '進': '进', '開': '开', '關': '关', '點': '点',
  '無': '无', '電': '电', '話': '话', '網': '网', '頁': '页',
  '資': '资', '訊': '讯', '處': '处', '辦': '办', '應': '应',
  '該': '该', '當': '当', '發': '发', '現': '现', '實': '实',
  '際': '际', '經': '经', '濟': '济', '體': '体', '驗': '验',
  '學': '学', '習': '习', '業': '业', '務': '务', '員': '员',
  '單': '单', '複': '复', '雜': '杂', '難': '难', '準': '准',
  '備': '备', '確': '确', '認': '认', '詳': '详', '細': '细',
  '總': '总', '結': '结', '論': '论', '議': '议', '討': '讨',
  '計': '计', '劃': '划', '書': '书', '寫': '写', '讀': '读',
  '記': '记', '錄': '录', '號': '号', '碼': '码', '類': '类',
  '別': '别', '區': '区', '選': '选', '擇': '择', '決': '决',
  '定': '定', '設': '设', '置': '置', '調': '调', '整': '整',
  '變': '变', '換': '换', '轉': '转', '運': '运', '動': '动',
  '靜': '静', '態': '态', '狀': '状', '況': '况', '條': '条',
  '件': '件', '規': '规', '則': '则', '標': '标', '準': '准',
  '價': '价', '格': '格', '質': '质', '量': '量', '數': '数',
  '據': '据', '庫': '库', '檔': '档', '案': '案', '夾': '夹',
  '層': '层', '級': '级', '組': '组', '織': '织', '構': '构',
  '建': '建', '築': '筑', '創': '创', '造': '造', '製': '制',
  '作': '作', '產': '产', '品': '品', '項': '项', '目': '目',
  '廣': '广', '東': '东', '車': '车', '輛': '辆', '飛': '飞',
  '機': '机', '場': '场', '站': '站', '線': '线', '路': '路',
  '門': '门', '戶': '户', '視': '视', '頻': '频', '聲': '声',
  '響': '响', '樂': '乐', '歡': '欢', '迎': '迎', '謝': '谢',
  '請': '请', '問': '问', '答': '答', '復': '复', '覆': '复',
  '蓋': '盖', '滿': '满', '達': '达', '離': '离', '開': '开',
  '關': '关', '閉': '闭', '啟': '启', '動': '动', '停': '停',
  '繼': '继', '續': '续', '終': '终', '結': '结', '束': '束',
  '頭': '头', '腦': '脑', '臉': '脸', '眼': '眼', '鼻': '鼻',
  '嘴': '嘴', '耳': '耳', '手': '手', '腳': '脚', '腿': '腿',
  '養': '养', '醫': '医', '療': '疗', '藥': '药', '險': '险',
  '歲': '岁', '齡': '龄', '歷': '历', '屆': '届', '屆': '届'
};

/**
 * 繁体转简体
 */
export function toSimplified(text) {
  if (!text) return text;
  
  let result = text;
  for (const [trad, simp] of Object.entries(TRAD_TO_SIMP)) {
    result = result.replace(new RegExp(trad, 'g'), simp);
  }
  return result;
}

/**
 * 格式化 AI 输出
 * - 转换为简体中文
 * - 确保 Markdown 格式正确
 */
export function formatAIOutput(text) {
  if (!text) return '';
  
  // 1. 转换为简体中文
  let formatted = toSimplified(text);
  
  // 2. 修复常见 Markdown 问题
  formatted = fixMarkdown(formatted);
  
  return formatted;
}

/**
 * 修复 Markdown 格式问题
 */
export function fixMarkdown(text) {
  let result = text;
  
  // 修复标题格式（确保 # 后有空格）
  result = result.replace(/^(#{1,6})([^#\s])/gm, '$1 $2');
  
  // 修复列表格式（确保 - 后有空格）
  result = result.replace(/^(\s*)-([^\s])/gm, '$1- $2');
  
  // 修复粗体格式
  result = result.replace(/\*\*\s+/g, '**');
  result = result.replace(/\s+\*\*/g, '**');
  
  // 修复代码块
  result = result.replace(/```(\w+)\n/g, '```$1\n');
  
  return result;
}

/**
 * 格式化仪表盘（精简版）
 */
export function formatDashboard(data) {
  const { messageCount, model, tokens, timestamp } = data;
  const time = timestamp || new Date().toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  // 精简单行格式
  return `\n───\n📊 #${messageCount || 0} | ${model || 'AI'} | ${tokens || 0}t | ${time}`;
}

/**
 * 格式化签证咨询结果
 */
export function formatVisaResponse(response, expandedQuestions = []) {
  let formatted = toSimplified(response);
  
  // 添加扩展问题（如果有）
  if (expandedQuestions.length > 0) {
    formatted += `\n\n---\n### 🔗 相关问题\n`;
    expandedQuestions.forEach((q, i) => {
      formatted += `${i + 1}. ${toSimplified(q)}\n`;
    });
  }
  
  return formatted;
}

/**
 * 格式化便签列表
 */
export function formatNotesList(notes) {
  if (!notes || notes.length === 0) {
    return '📋 **你的便签**\n\n还没有任何便签，点击「新建便签」创建一个吧！';
  }
  
  let text = '📋 **你的便签**\n\n';
  notes.forEach((note, i) => {
    const date = new Date(note.createdAt).toLocaleDateString('zh-CN');
    const title = toSimplified(note.title);
    const content = toSimplified(note.content).substring(0, 50);
    text += `${i + 1}. **${title}**\n   ${content}${note.content.length > 50 ? '...' : ''}\n   📅 ${date}\n\n`;
  });
  
  return text;
}

/**
 * 格式化错误消息
 */
export function formatError(error) {
  return `❌ **错误**: ${toSimplified(error.message || String(error))}`;
}

/**
 * Telegram Markdown 转义
 * 转义特殊字符以避免解析错误
 */
export function escapeTelegramMd(text) {
  if (!text) return '';
  
  // Telegram MarkdownV2 需要转义的字符
  // 但我们使用 Markdown 模式，只需处理部分
  return text
    .replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * 安全的 Markdown 格式化
 * 用于 Telegram 发送
 */
export function safeMd(text) {
  if (!text) return '';
  
  // 先转简体
  let result = toSimplified(text);
  
  // 确保 Markdown 格式正确
  result = fixMarkdown(result);
  
  return result;
}

export default {
  toSimplified,
  formatAIOutput,
  fixMarkdown,
  formatDashboard,
  formatVisaResponse,
  formatNotesList,
  formatError,
  escapeTelegramMd,
  safeMd
};
