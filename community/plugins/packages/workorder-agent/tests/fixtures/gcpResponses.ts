/** 脱敏后的官方易协作列表行，含巡检所需列。 */
export const issueListItem = {
  id: 81001,
  subject: { value: '脱敏工单甲', type: 'string', id: 81001 },
  status: '美术完成',
  assigned_to: { value: '脱敏用户', id: 301 },
  project: { value: '渠道美术', id: 7 },
  start_date: '2026-08-01',
  due_date: '2026-08-10',
  created_on: '2026-08-01T00:00:00.000Z',
  updated_on: '2026-08-10T00:00:00.000Z',
  closed_on: '2026-08-10T12:00:00.000Z',
  spent_hours: { value: 2.5, type: 'timelog_link', id: 1 },
  cf_7: '2026-08-14',
  cf_127: '脱敏游戏',
  cf_128: '脱敏渠道',
  cf_129: '子单',
  cf_134: 3,
  cf_2002: '是',
}

/** 脱敏后的官方易协作列表响应 fixture。 */
export const issueListResponse = {
  data: {
    list: [{ id: 81001, subject: '脱敏工单甲' }, { id: 81002, subject: '脱敏工单乙' }],
    total_count: 5,
    page: 1,
    per_page: 2,
  },
}

/** 脱敏后的官方易协作详情响应 fixture。 */
export const issueDetailResponse = {
  data: {
    base: {
      id: 81001,
      subject: '脱敏工单甲',
      status: { id: 6, name: '美术完成' },
      assigned_to: { id: 301, name: '脱敏用户' },
      project: { id: 2004, name: ' AI运营活动' },
      created_on: '2026-08-01T00:00:00.000Z',
      updated_on: '2026-08-10T00:00:00.000Z',
      closed_on: '2026-08-10T12:00:00.000Z',
    },
    core_fields: [
      [{ key: 'status_id', name: '状态', value: { id: 6, name: '美术完成' }, identify: 'status_id' }],
      [{ key: 'assigned_to', name: '指派给', value: { id: 301, name: '脱敏用户' }, identify: 'assigned_to' }],
      [{ key: 'start_date', name: '开始日期', value: '2026-08-01' }],
      [{ key: 'due_date', name: '完成日期', value: '2026-08-10' }],
      [{ key: 'total_spent_hours', name: '总工时', value: '2.5', position: 0 }],
    ],
    cf_fields: [
      { key: 'cf_7', name: '期望交付时间', value: '2026-08-14', identify: 'cf_7' },
      { key: 'cf_127', name: '游戏产品', value: '脱敏游戏', identify: 'cf_127' },
      { key: 'cf_129', name: '美术类型', value: '子单', identify: 'cf_129' },
      { key: 'cf_128', name: '投放渠道', value: '脱敏渠道', identify: 'cf_128' },
      { key: 'cf_2000', name: '回流投放渠道', value: '', identify: 'cf_2000' },
      { key: 'cf_2005', name: 'AI运营投放渠道', value: '脱敏AI渠道', identify: 'cf_2005' },
      { key: 'cf_2002', name: 'AI管线耗时', value: '是', identify: 'cf_2002' },
      { key: 'cf_134', name: '设计数量', value: 3, identify: 'cf_134' },
    ],
  },
}
