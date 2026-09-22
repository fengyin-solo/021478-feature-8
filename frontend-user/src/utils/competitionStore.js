/**
 * 赛事报名存储管理
 *
 * 职责：
 * - 维护赛事报名记录：正式报名（confirmed）/ 候补（waitlisted）/ 已取消（cancelled）
 * - 报名时原子校验：登录状态、资料完整性、重复报名、名额是否已满
 * - 名额释放时按候补先后顺序自动递补，参赛号随之分配，保证名额、参赛号、展示结果一致
 * - 与任务中心（taskStore）同步当前用户的赛事任务
 *
 * 使用 localStorage 持久化，单用户演示模式。
 */

import { taskStore } from './taskStore'

const STORAGE_KEY = 'billiard_competition_registrations_v1'
const SEED_FLAG_KEY = 'billiard_competition_seed_v1'
const SEED_VERSION = '1'

const logger = {
  info: (...args) => console.log('[competitionStore]', ...args),
  warn: (...args) => console.warn('[competitionStore]', ...args),
  error: (...args) => console.error('[competitionStore]', ...args)
}

/**
 * 赛事基础名额（与 Competitions.vue 中赛事数据保持一致）
 * baseParticipants: 系统模拟的已报名人数；maxParticipants: 名额上限
 */
export const COMPETITION_BASE = {
  1: { baseParticipants: 28, maxParticipants: 32 },
  2: { baseParticipants: 16, maxParticipants: 16 },
  3: { baseParticipants: 64, maxParticipants: 64 },
  4: { baseParticipants: 12, maxParticipants: 48 },
  5: { baseParticipants: 8, maxParticipants: 16 }
}

// ==================== 存储读写 ====================

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return {
      registrations: parsed && Array.isArray(parsed.registrations) ? parsed.registrations : []
    }
  } catch (e) {
    logger.error('加载赛事报名数据失败', e)
    return { registrations: [] }
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch (e) {
    logger.error('保存赛事报名数据失败', e)
    return false
  }
}

// ==================== 演示种子数据 ====================
// 赛事1（32人上限，基础28人）补足4名正式选手使赛事满员，另有2人在候补，
// 用于演示「满员报名 -> 进入候补 -> 名次展示 -> 名额释放自动递补」完整链路。

function buildSeedRegistrations() {
  const baseTime = new Date('2026-01-10T09:00:00').getTime()
  const day = 86400000
  const make = (i, name, phone, idCard, status, playerNo, offsetDays) => ({
    id: 'SEED-' + i,
    competitionId: 1,
    userId: 'seed_user_' + i,
    seed: true,
    seq: i,
    name,
    phone,
    idCard,
    regNo: 'REG' + (26010000 + i),
    status,
    playerNo,
    promotedFrom: null,
    canDemoRelease: status === 'confirmed',
    createdAt: baseTime + offsetDays * day
  })

  return [
    make(1, '陈强', '13800000001', '11010119900101001X', 'confirmed', 29, 1),
    make(2, '李磊', '13800000002', '31010119920303002X', 'confirmed', 30, 2),
    make(3, '王芳', '13800000003', '44010119940505003X', 'confirmed', 31, 3),
    make(4, '赵敏', '13800000004', '51010119960707004X', 'confirmed', 32, 4),
    make(5, '孙鹏', '13800000005', '33010119910202005X', 'waitlisted', null, 5),
    make(6, '周婷', '13800000006', '32010119930404006X', 'waitlisted', null, 6)
  ]
}

// ==================== 记录筛选与排序 ====================

function isActive(reg) {
  return reg.status !== 'cancelled'
}

function getList(state, competitionId) {
  return state.registrations.filter(r => r.competitionId === competitionId)
}

function getConfirmed(list) {
  return list
    .filter(r => isActive(r) && r.status === 'confirmed')
    .sort((a, b) => a.playerNo - b.playerNo)
}

function getWaitlist(list) {
  // 候补先后：先按报名序号（即报名先后），再按报名时间兜底，保证名次稳定
  return list
    .filter(r => isActive(r) && r.status === 'waitlisted')
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
}

let regSeq = 1000
function nextSeq() {
  return ++regSeq
}

function nextPlayerNo(list, comp) {
  const used = new Set(getConfirmed(list).map(r => r.playerNo))
  for (let no = comp.baseParticipants + 1; no <= comp.maxParticipants; no++) {
    if (!used.has(no)) return no
  }
  return null
}

/**
 * 名额释放后自动递补：按候补顺序将队首转正，分配空余参赛号
 * list 为该赛事范围内的记录数组（同一 state.registrations 引用，变更由调用方持久化）
 * 返回本次被递补的记录列表
 */
function promoteWaitlist(list, comp) {
  const promoted = []
  let guard = 0
  while (guard++ < comp.maxParticipants) {
    const confirmedCount = getConfirmed(list).length
    if (comp.baseParticipants + confirmedCount >= comp.maxParticipants) break
    const queue = getWaitlist(list)
    if (queue.length === 0) break
    const playerNo = nextPlayerNo(list, comp)
    if (playerNo == null) break
    const head = queue[0]
    head.status = 'confirmed'
    head.playerNo = playerNo
    head.promotedFrom = 'waitlisted'
    head.promotedAt = Date.now()
    head.canDemoRelease = false
    promoted.push(head)
  }
  return promoted
}

function generateRegNo() {
  return 'REG' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 90 + 10)
}

function generateRegId() {
  return 'R' + Date.now() + Math.floor(Math.random() * 1000).toString().padStart(3, '0')
}

function toPublicView(reg, rank) {
  if (!reg) return null
  return {
    id: reg.id,
    competitionId: reg.competitionId,
    userId: reg.userId,
    name: reg.name,
    phone: reg.phone,
    idCard: reg.idCard,
    regNo: reg.regNo,
    status: reg.status,
    playerNo: reg.playerNo,
    promotedFrom: reg.promotedFrom || null,
    rank: rank || null,
    createdAt: reg.createdAt
  }
}

// ==================== 任务中心同步 ====================

function syncRegistrationTask(comp, reg, rank) {
  const isWaitlisted = reg.status === 'waitlisted'
  taskStore.upsertCompetitionRegistration({
    id: 'COMP-' + comp.id + '-' + reg.userId,
    type: 'competition',
    title: comp.name,
    subtitle: isWaitlisted
      ? '候补中，名额释放时将按名次自动递补'
      : reg.promotedFrom
        ? '候补已转正，等待比赛开始'
        : '报名成功，等待比赛开始',
    amount: isWaitlisted ? 0 : comp.fee,
    status: isWaitlisted ? 'waitlisted' : 'upcoming',
    extra: {
      competitionId: comp.id,
      regNo: reg.regNo,
      playerNo: reg.playerNo,
      regStatus: reg.status,
      waitlistRank: isWaitlisted ? rank : null,
      date: comp.date
    }
  })
}

// ==================== 脱敏展示 ====================

export function maskName(name) {
  if (!name) return ''
  if (name.length <= 1) return name
  return name[0] + '*'.repeat(name.length - 1)
}

export function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || ''
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

// ==================== 对外接口 ====================

export const competitionStore = {
  /**
   * 初始化演示数据（幂等）
   */
  ensureSeeded() {
    if (localStorage.getItem(SEED_FLAG_KEY) === SEED_VERSION) return
    const state = loadState()
    const hasCompOne = state.registrations.some(r => r.competitionId === 1)
    if (!hasCompOne) {
      state.registrations.push(...buildSeedRegistrations())
      saveState(state)
    }
    localStorage.setItem(SEED_FLAG_KEY, SEED_VERSION)
  },

  /**
   * 归一化赛事参数：支持传入赛事对象或赛事ID
   */
  normalizeComp(comp) {
    if (comp == null) return null
    if (typeof comp === 'object') {
      const base = COMPETITION_BASE[comp.id] || {}
      return {
        id: comp.id,
        name: comp.name,
        date: comp.date,
        fee: comp.fee,
        baseParticipants: comp.baseParticipants != null ? comp.baseParticipants : base.baseParticipants,
        maxParticipants: comp.maxParticipants != null ? comp.maxParticipants : base.maxParticipants
      }
    }
    const base = COMPETITION_BASE[comp]
    if (!base) return null
    return { id: comp, name: '', date: '', fee: 0, ...base }
  },

  /**
   * 获取赛事报名统计
   * @returns {Object} stats
   * - participants: 实际报名人数（基础人数 + 存储内正式报名）
   * - waitlistCount: 候补人数
   * - available: 剩余名额
   * - isFull: 是否满员
   * - registration: 当前用户有效报名（含候补名次 myRank）
   */
  getStats(comp, userId) {
    const normalized = this.normalizeComp(comp)
    if (!normalized) {
      return { participants: 0, waitlistCount: 0, available: 0, isFull: false, registration: null }
    }
    const state = loadState()
    const list = getList(state, normalized.id)
    const confirmed = getConfirmed(list)
    const waitlist = getWaitlist(list)
    const participants = normalized.baseParticipants + confirmed.length
    const available = Math.max(0, normalized.maxParticipants - participants)

    let registration = null
    if (userId) {
      const mine = list.find(r => isActive(r) && r.userId === userId) || null
      if (mine) {
        const rank = mine.status === 'waitlisted' ? waitlist.findIndex(r => r.id === mine.id) + 1 : null
        registration = toPublicView(mine, rank > 0 ? rank : null)
      }
    }

    return {
      baseParticipants: normalized.baseParticipants,
      maxParticipants: normalized.maxParticipants,
      confirmedStored: confirmed.length,
      participants,
      available,
      isFull: available <= 0,
      waitlistCount: waitlist.length,
      waitlist,
      registration
    }
  },

  /**
   * 获取当前用户有效报名
   */
  getMyRegistration(comp, userId) {
    return this.getStats(comp, userId).registration
  },

  /**
   * 候补名单视图（按名次先后）
   */
  getWaitlistQueue(comp, userId) {
    const normalized = this.normalizeComp(comp)
    if (!normalized) return []
    const list = getList(loadState(), normalized.id)
    return getWaitlist(list).map((reg, index) => ({
      ...toPublicView(reg, index + 1),
      isMe: userId != null && reg.userId === userId
    }))
  },

  /**
   * 已从候补递补为正式选手的记录
   */
  getPromotedList(comp, userId) {
    const normalized = this.normalizeComp(comp)
    if (!normalized) return []
    const list = getList(loadState(), normalized.id)
    return list
      .filter(r => r.status === 'confirmed' && r.promotedFrom === 'waitlisted')
      .sort((a, b) => (a.promotedAt || 0) - (b.promotedAt || 0))
      .map(reg => ({
        ...toPublicView(reg, null),
        isMe: userId != null && reg.userId === userId
      }))
  },

  /**
   * 报名参赛（原子操作）
   * 校验顺序：登录 -> 赛事 -> 资料完整性 -> 重复报名 -> 名额/候补
   *
   * @returns {{success: boolean, code?: string, message?: string, registration?: Object, rank?: number}}
   */
  register(comp, payload) {
    this.ensureSeeded()
    const normalized = this.normalizeComp(comp)
    const data = payload || {}

    if (!data.userId) {
      return { success: false, code: 'NOT_AUTHENTICATED', message: '登录已失效，请重新登录' }
    }
    if (!normalized) {
      return { success: false, code: 'INVALID_COMPETITION', message: '赛事信息不存在' }
    }

    const name = (data.name || '').trim()
    const phone = (data.phone || '').trim()
    const idCard = (data.idCard || '').trim()

    if (!name) {
      return { success: false, code: 'EMPTY_PROFILE', field: 'name', message: '请填写参赛姓名' }
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return { success: false, code: 'EMPTY_PROFILE', field: 'phone', message: '请输入正确的11位手机号' }
    }
    if (!idCard || idCard.length < 6) {
      return { success: false, code: 'EMPTY_PROFILE', field: 'idCard', message: '请填写证件号（至少6位）' }
    }

    const state = loadState()
    const list = getList(state, normalized.id)

    // 重复报名：存在任何有效记录（正式/候补）均拒绝
    const existing = list.find(r => isActive(r) && r.userId === data.userId)
    if (existing) {
      const waitlist = getWaitlist(list)
      const rank = existing.status === 'waitlisted' ? waitlist.findIndex(r => r.id === existing.id) + 1 : null
      logger.warn('重复报名被拦截', { competitionId: normalized.id, userId: data.userId, status: existing.status })
      return {
        success: false,
        code: 'DUPLICATE',
        message: existing.status === 'waitlisted' ? '您已在该赛事的候补名单中' : '您已报名该赛事，请勿重复报名',
        registration: toPublicView(existing, rank > 0 ? rank : null)
      }
    }

    // 先处理可能存在的递补（防御性：任何空余名额都优先补给队首），再决定新人去向
    const promoted = promoteWaitlist(list, normalized)

    const confirmedCount = list.filter(r => isActive(r) && r.status === 'confirmed').length
    const isFull = normalized.baseParticipants + confirmedCount >= normalized.maxParticipants

    const reg = {
      id: generateRegId(),
      competitionId: normalized.id,
      userId: data.userId,
      seed: false,
      seq: nextSeq(),
      name,
      phone,
      idCard,
      regNo: generateRegNo(),
      promotedFrom: null,
      canDemoRelease: false,
      createdAt: Date.now()
    }

    if (!isFull) {
      reg.status = 'confirmed'
      reg.playerNo = nextPlayerNo(list, normalized)
    } else {
      reg.status = 'waitlisted'
      reg.playerNo = null
    }

    state.registrations.push(reg)
    saveState(state)

    const finalWaitlist = getWaitlist(getList(loadState(), normalized.id))
    const rank = reg.status === 'waitlisted' ? finalWaitlist.findIndex(r => r.id === reg.id) + 1 : null
    syncRegistrationTask(normalized, reg, rank)

    logger.info('赛事报名成功', {
      competitionId: normalized.id,
      status: reg.status,
      playerNo: reg.playerNo,
      rank
    })

    return {
      success: true,
      status: reg.status,
      isWaitlisted: reg.status === 'waitlisted',
      rank: rank || null,
      registration: toPublicView(reg, rank),
      promoted: promoted.map(r => r.id)
    }
  },

  /**
   * 取消候补（仅允许取消本人的候补记录，不释放正式名额）
   */
  cancelWaitlist(comp, userId) {
    const normalized = this.normalizeComp(comp)
    if (!userId) {
      return { success: false, code: 'NOT_AUTHENTICATED', message: '登录已失效，请重新登录' }
    }
    if (!normalized) {
      return { success: false, code: 'INVALID_COMPETITION', message: '赛事信息不存在' }
    }

    const state = loadState()
    const reg = state.registrations.find(
      r => r.competitionId === normalized.id && r.userId === userId && r.status === 'waitlisted'
    )
    if (!reg) {
      return { success: false, code: 'NOT_WAITLISTED', message: '当前没有候补记录' }
    }

    reg.status = 'cancelled'
    reg.cancelledAt = Date.now()
    saveState(state)
    taskStore.removeCompetitionRegistration(normalized.id, userId)

    logger.info('已取消候补', { competitionId: normalized.id, userId })
    return { success: true, registrationId: reg.id }
  },

  /**
   * 演示用：模拟一名正式选手退赛释放名额，触发候补按序自动递补
   */
  canSimulateRelease(comp, userId) {
    const normalized = this.normalizeComp(comp)
    if (!normalized) return false
    const list = getList(loadState(), normalized.id)
    return getConfirmed(list).some(r => r.canDemoRelease && r.userId !== userId)
  },

  simulateRelease(comp, userId) {
    this.ensureSeeded()
    const normalized = this.normalizeComp(comp)
    if (!normalized) {
      return { success: false, code: 'INVALID_COMPETITION', message: '赛事信息不存在' }
    }

    const state = loadState()
    const list = getList(state, normalized.id)
    const target = getConfirmed(list).find(r => r.canDemoRelease && r.userId !== userId)
    if (!target) {
      return { success: false, code: 'NO_DEMO_SLOT', message: '暂无可释放的名额' }
    }

    target.status = 'cancelled'
    target.releasedBy = 'demo'
    target.cancelledAt = Date.now()
    target.canDemoRelease = false

    const promoted = promoteWaitlist(list, normalized)
    saveState(state)

    // 仅同步当前用户的任务（种子选手没有任务）
    promoted.forEach(reg => {
      if (userId != null && reg.userId === userId) {
        syncRegistrationTask(normalized, reg, null)
      }
    })

    const myPromoted = promoted.find(r => r.userId === userId) || null
    logger.info('模拟名额释放', {
      competitionId: normalized.id,
      releasedPlayerNo: target.playerNo,
      promoted: promoted.map(r => ({ userId: r.userId, playerNo: r.playerNo }))
    })

    return {
      success: true,
      releasedPlayerNo: target.playerNo,
      promoted: promoted.map(r => toPublicView(r, null)),
      myPromoted: myPromoted ? toPublicView(myPromoted, null) : null
    }
  }
}

export default competitionStore
