/**
 * 功能域主题（TOKENS_PLAN §1.5）。
 * 与 index.css 的 [data-domain] 选择器、L2 域指针一一对应：
 * work=工作台（品牌继承）/ time=时间 / tasks=事项 / insights=洞察 / system=体系（标签+设置）。
 */
export type DomainKey = 'work' | 'time' | 'tasks' | 'insights' | 'system'

export const DOMAIN_LABEL: Record<DomainKey, string> = {
  work: '工作台', time: '时间', tasks: '事项', insights: '洞察', system: '体系',
}
