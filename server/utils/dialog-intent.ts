// ============================================================
// Shared dialog intent detection — used by agent.post.ts, ai.post.ts, system-prompt.ts
// Single source of truth for end-dialog keyword matching
// ============================================================

const END_DIALOG_KEYWORDS = [
  '分配调解员', '选择调解员', '我要找调解员', '帮我找调解员',
  '我要联系调解员', '联系调解员',
  '结束谈话', '结束对话', '结束', '就这样', '可以了',
  '不用了', '不需要', '无需', '无补充', '我不想聊了',
  '不需要调解', '找调解员', '推荐调解员', '安排调解员',
  '帮我联系', '帮我找',
]

/**
 * Check if a user message indicates intent to end the dialog.
 * Strips whitespace before matching to avoid false negatives.
 */
export function isEndDialogIntent(message: string): boolean {
  const cleaned = message.replace(/\s/g, '')
  return END_DIALOG_KEYWORDS.some(kw => cleaned.includes(kw))
}

/**
 * Get the keyword list (for use in system prompts)
 */
export function getEndDialogKeywords(): string[] {
  return END_DIALOG_KEYWORDS
}
