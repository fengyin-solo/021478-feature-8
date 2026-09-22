/**
 * 赛事报名存储管理
 *
 * 功能说明：
 * - 管理赛事报名资料、参赛号与候补名单（localStorage 持久化）
 * - 满员时报名自动进入候补，名额空出按候补顺序自动替补
 * - 参赛号统一分配/回收，保证名额、参赛号与展示结果一致
 *
 * 报名记录状态：
 * - confirmed:   已正式报名（已分配参赛号）
 * - waitlisted:  候补中（未分配参赛号，候补名次按 waitlistNo 排序动态计算）
 * - cancelled:   已取消（历史记录保留，不占名额，允许重新报名）
 */

import { authState, getCurrentUser } from './auth'
import { taskStore } from './taskStore'
import { logger } from './api'

const STORAGE_KEY = 'billiard_competition_state'
const STATE_VERSION = 1

/**
 * 基础赛事数据（与赛事页展示保持一致，赛事分类/直播/赛果不受影响）
 * baseConfirmed: 系统中已有的其他报名人数（占名额、占参赛号，但无独立记录）
 */
const baseCompetitions = [
  { id: 1, name: '2026春季斯诺克公开赛', type: '斯诺克', date: '2026-03-15', location: '主馆A区', prize: 50000, fee: 200, maxParticipants: 32, status: 'upcoming' },
  { id: 2, name: '周末九球挑战赛', type: '美式九球', date: '2026-02-14', location: '主馆B区', prize: 10000, fee: 100, maxParticipants: 16, status: 'ongoing' },
  { id: 3, name: '新年中式八球锦标赛', type: '中式八球', date: '2026-01-20', location: '主馆A区', prize: 30000, fee: 150, maxParticipants: 64, status: 'finished' },
  { id: 4, name: '会员积分争霸赛', type: '综合', date: '2026-04-01', location: '主馆C区', prize: 20000, fee: 50, maxParticipants: 48, status: 'upcoming' },
  { id: 5, name: '女子台球精英赛', type: '美式九球', date: '2026-03-08', location: '主馆B区', prize: 15000, fee: 80, maxParticipants: 16, status: 'upcoming' }
]

function getDefaultState() {
  const now = Date.now()
  return {
    version: STATE_VERSION,
    // 各赛事已有的正式报名人数（匿名的其他参赛者）
    baseConfirmed: { 1: 32, 2: 16, 3: 64, 4: 12, 5: 8 },
    // 下一个可分配的参赛号
    nextPlayerNo: { 1: 33, 2: 17, 3: 65, 4: 13, 5: 9 },
    // 取消报名后回收的参赛号（优先复用）
    freePlayerNos: { 1: [], 2: [], 3: [], 4: [], 5: [] },
    // 候补序号（永久递增，仅用于排序）
    nextWaitlistNo: { 1: 2, 2: 1, 3: 1, 4: 1, 5: 1 },
    // 报名编号序列
    regSeq: 1,
    registrations: [
      // 满员赛事预置 1 条候补，用于展示候补先后
      {
        regNo: 'REG019001',
        competitionId: 1,
        userId: null,
        name: '赵六',
        phone: '137****6688',
        note: '',
        status: 'waitlisted',
        playerNo: null,
        waitlistNo: 1,
        createdAt: now - 2 * 3600000
      }
    ]
  }
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return getDefaultState()
    const state = JSON.parse(stored)
    if (!state || state.version !== STATE_VERSION || !Array.isArray(state.registrations)) {
      return getDefaultState()
    }
    return state
  } catch (e) {
    logger.error('赛事报名状态加载失败', e)
    return getDefaultState()
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch (e) {
    logger.error('赛事报名状态保存失败', e)
    return false
  }
}

function getBaseCompetition(id) {
  return baseCompetitions.find(c => c.id === Number(id)) || null
}

/**
 * 计算某赛事的报名统计
 * 正式人数 = 基础报名人数 + 有效报名记录中的正式名额
 */
function getStats(state, competitionId) {
  const cid = Number(competitionId)
  const records = state.registrations.filter(
    r => r.competitionId === cid && r.status !== 'cancelled'
  )
  const confirmedRecords = records.filter(r => r.status === 'confirmed')
  const waitingRecords = records
    .filter(r => r.status === 'waitlisted')
    .sort((a, b) => a.waitlistNo - b.waitlistNo)

  return {
    confirmed: (state.baseConfirmed[cid] || 0) + confirmedRecords.length,
    max: getBaseCompetition(cid)?.maxParticipants || 0,
    waiting: waitingRecords,
    confirmedRecords
  }
}

/** 分配参赛号：优先使用回收号码，否则使用递增号码 */
function allocatePlayerNo(state, competitionId) {
  const cid = Number(competitionId)
  const pool = state.freePlayerNos[cid] || (state.freePlayerNos[cid] = [])
  if (pool.length > 0) {
    return pool.pop()
  }
  const no = state.nextPlayerNo[cid] || 1
  state.nextPlayerNo[cid] = no + 1
  return no
}

function generateRegNo(state, competitionId) {
  const seq = String(state.regSeq++).padStart(4, '0')
  return `REG${String(competitionId).padStart(2, '0')}${seq}`
}

/**
 * 名额空出时按候补顺序递补队首
 * @returns 被递补的报名记录，无候补时返回 null
 */
function promoteIfPossible(state, competitionId) {
  const cid = Number(competitionId)
  const stats = getStats(state, cid)
  if (stats.confirmed >= stats.max) return null

  const head = stats.waiting[0]
  if (!head) return null

  head.status = 'confirmed'
  head.playerNo = allocatePlayerNo(state, cid)
  logger.info('候补递补', { competitionId: cid, regNo: head.regNo, playerNo: head.playerNo })

  // 同步当前登录用户的任务中心
  const currentUser = getCurrentUser()
  if (head.userId && currentUser && head.userId === currentUser.id) {
    const task = taskStore
      .getAll()
      .find(t => t.type === 'competition' && t.extra?.regNo === head.regNo)
    if (task) {
      taskStore.update(task.id, {
        status: 'upcoming',
        subtitle: '候补转正，等待比赛开始',
        extra: { ...task.extra, playerNo: head.playerNo }
      })
    }
  }
  return head
}

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || ''
  return phone.slice(0, 3) + '****' + phone.slice(-4)
}

function toView(record, state) {
  if (!record) return null
  const active = getStats(state, record.competitionId).waiting
  const rank = record.status === 'waitlisted' ? active.findIndex(r => r.regNo === record.regNo) + 1 : 0
  return {
    ...record,
    rank: rank > 0 ? rank : null,
    competitionName: getBaseCompetition(record.competitionId)?.name || ''
  }
}

export const competitionStore = {
  /** 赛事基础数据 */
  baseCompetitions,

  /**
   * 获取赛事列表（合并实时报名人数/候补人数）
   * 每次都从存储重新计算，保证“返回赛事页”后展示与名额一致
   */
  getCompetitions() {
    const state = loadState()
    return baseCompetitions.map(comp => {
      const stats = getStats(state, comp.id)
      return {
        ...comp,
        participants: stats.confirmed,
        waitingCount: stats.waiting.length,
        isFull: stats.confirmed >= comp.maxParticipants
      }
    })
  },

  getCompetition(competitionId) {
    return this.getCompetitions().find(c => c.id === Number(competitionId)) || null
  },

  /**
   * 获取当前用户在某赛事中的有效报名记录
   * 未登录/无记录均返回 null（登录失效或退出后不会读到他人记录）
   */
  getMyRegistration(competitionId) {
    const user = getCurrentUser()
    if (!user) return null
    const state = loadState()
    const reg = state.registrations.find(
      r =>
        r.competitionId === Number(competitionId) &&
        r.userId === user.id &&
        r.status !== 'cancelled'
    )
    return reg ? toView(reg, state) : null
  },

  /**
   * 候补名次视图数据
   * @returns {{ active: Array, promoted: Array, cancelled: Array, myReg: Object|null, competition: Object }}
   */
  getWaitlistView(competitionId) {
    const cid = Number(competitionId)
    const state = loadState()
    const user = getCurrentUser()
    const all = state.registrations.filter(r => r.competitionId === cid)

    const active = all
      .filter(r => r.status === 'waitlisted')
      .sort((a, b) => a.waitlistNo - b.waitlistNo)
      .map((r, index) => ({
        ...toView(r, state),
        rank: index + 1,
        isMine: !!(user && r.userId === user.id),
        displayPhone: r.userId && user && r.userId !== user.id ? maskPhone(r.phone) : r.phone
      }))

    const promoted = all
      .filter(r => r.status === 'confirmed' && r.waitlistNo != null)
      .sort((a, b) => b.waitlistNo - a.waitlistNo)
      .map(r => ({
        ...r,
        isMine: !!(user && r.userId === user.id),
        displayPhone: r.userId && user && r.userId !== user.id ? maskPhone(r.phone) : r.phone
      }))

    const cancelled = all
      .filter(r => r.status === 'cancelled')
      .sort((a, b) => b.createdAt - a.createdAt)

    const myReg = user
      ? all.find(r => r.userId === user.id && r.status !== 'cancelled')
      : null

    return {
      competition: this.getCompetition(cid),
      active,
      promoted,
      cancelled,
      myReg: myReg ? toView(myReg, state) : null
    }
  },

  /**
   * 报名参赛
   * 提交时重新校验登录状态与名额（满员变化以提交时刻为准）：
   * - 有名额：正式报名并分配参赛号
   * - 已满员：进入候补，不分配参赛号
   * @returns {{ success: boolean, code?: string, message?: string, registration?: Object }}
   */
  register(competitionId, form) {
    const user = getCurrentUser()
    if (!authState.isLoggedIn || !user) {
      return { success: false, code: 'UNAUTHENTICATED', message: '登录已失效，请重新登录' }
    }

    const comp = getBaseCompetition(competitionId)
    if (!comp) {
      return { success: false, code: 'NOT_FOUND', message: '赛事不存在' }
    }
    if (comp.status !== 'upcoming') {
      return { success: false, code: 'NOT_OPEN', message: '该赛事当前不可报名' }
    }

    const name = (form?.name || '').trim()
    const phone = (form?.phone || '').trim()
    if (!name || !phone) {
      return { success: false, code: 'INVALID', message: '请填写完整的参赛资料' }
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return { success: false, code: 'INVALID', message: '请输入正确的手机号' }
    }

    const state = loadState()

    // 重复报名拦截：同一用户在同一赛事已有有效报名（正式/候补）
    const duplicated = state.registrations.find(
      r =>
        r.competitionId === comp.id &&
        r.userId === user.id &&
        r.status !== 'cancelled'
    )
    if (duplicated) {
      return {
        success: false,
        code: 'DUPLICATE',
        message: duplicated.status === 'waitlisted' ? '您已在该赛事的候补名单中' : '您已报名该赛事，请勿重复报名',
        registration: toView(duplicated, state)
      }
    }

    const stats = getStats(state, comp.id)
    const reg = {
      regNo: generateRegNo(state, comp.id),
      competitionId: comp.id,
      userId: user.id,
      name,
      phone,
      note: (form?.note || '').trim(),
      status: 'waitlisted',
      playerNo: null,
      waitlistNo: null,
      createdAt: Date.now()
    }

    if (stats.confirmed < stats.max) {
      // 提交时刻仍有名额 → 正式报名
      reg.status = 'confirmed'
      reg.playerNo = allocatePlayerNo(state, comp.id)
    } else {
      // 提交时刻已满员 → 进入候补（候补序号永久递增，保证先后顺序）
      reg.waitlistNo = state.nextWaitlistNo[comp.id] || 1
      state.nextWaitlistNo[comp.id] = reg.waitlistNo + 1
    }

    state.registrations.push(reg)
    saveState(state)
    logger.info('赛事报名成功', { competitionId: comp.id, status: reg.status, regNo: reg.regNo })

    // 同步任务中心
    const liveComp = this.getCompetition(comp.id)
    taskStore.addCompetitionTask(liveComp, reg)

    return { success: true, code: 'OK', registration: toView(reg, state) }
  },

  /**
   * 取消当前用户在某赛事的报名（正式报名或候补）
   * - 取消候补：仅释放候补位置，后续名次自动前移
   * - 取消正式报名：回收参赛号、释放名额，并自动递补候补队首
   */
  cancelRegistration(competitionId) {
    const user = getCurrentUser()
    if (!user) {
      return { success: false, code: 'UNAUTHENTICATED', message: '登录已失效，请重新登录' }
    }
    return this.cancelByRegNo(this._findActiveRegNo(competitionId, user.id))
  },

  _findActiveRegNo(competitionId, userId) {
    const state = loadState()
    const reg = state.registrations.find(
      r =>
        r.competitionId === Number(competitionId) &&
        r.userId === userId &&
        r.status !== 'cancelled'
    )
    return reg?.regNo || null
  },

  /**
   * 按报名编号取消（供任务中心联动调用）
   * @returns {{ success, code?, message?, cancelled?, promoted? }}
   */
  cancelByRegNo(regNo) {
    if (!regNo) return { success: false, code: 'NOT_FOUND', message: '报名记录不存在' }

    const user = getCurrentUser()
    const state = loadState()
    const reg = state.registrations.find(r => r.regNo === regNo)
    if (!reg || reg.status === 'cancelled') {
      return { success: false, code: 'NOT_FOUND', message: '报名记录不存在或已取消' }
    }

    const wasConfirmed = reg.status === 'confirmed'
    const releasedPlayerNo = reg.playerNo
    reg.status = 'cancelled'
    reg.playerNo = null

    let promoted = null
    if (wasConfirmed) {
      const cid = reg.competitionId
      ;(state.freePlayerNos[cid] || (state.freePlayerNos[cid] = [])).push(releasedPlayerNo)
      promoted = promoteIfPossible(state, cid)
    }

    saveState(state)
    logger.info('赛事报名已取消', { regNo, wasConfirmed, releasedPlayerNo, promoted: promoted?.regNo })

    // 移除当前用户任务中心的对应任务（他人/匿名记录无任务）
    if (user && reg.userId === user.id) {
      const task = taskStore
        .getAll()
        .find(t => t.type === 'competition' && t.extra?.regNo === regNo)
      if (task) taskStore.remove(task.id)
    }

    return {
      success: true,
      code: 'OK',
      cancelled: { ...reg, releasedPlayerNo },
      promoted: promoted ? toView(promoted, state) : null
    }
  },

  /**
   * 模拟名额变化（演示用）：释放一个已有正式名额，触发候补自动递补
   * 真实环境中名额变化由后端推送，此处仅用于 Mock 演示候补流程
   */
  simulateVacancy(competitionId) {
    const cid = Number(competitionId)
    const comp = getBaseCompetition(cid)
    if (!comp) return { success: false, code: 'NOT_FOUND', message: '赛事不存在' }

    const state = loadState()
    const stats = getStats(state, cid)
    if (stats.waiting.length === 0) {
      return { success: false, code: 'NO_WAITLIST', message: '当前没有候补选手' }
    }
    if ((state.baseConfirmed[cid] || 0) <= 0) {
      return { success: false, code: 'NO_BASE_SLOT', message: '暂无可释放的演示名额' }
    }

    // 释放一个基础名额（参赛号不回收给基础池，递补者走递增新号）
    state.baseConfirmed[cid] -= 1
    const promoted = promoteIfPossible(state, cid)
    saveState(state)
    logger.info('模拟名额释放', { competitionId: cid, promoted: promoted?.regNo })

    return { success: true, code: 'OK', promoted: promoted ? toView(promoted, state) : null }
  },

  /** 格式化报名/候补时间 */
  formatTime(ts) {
    const d = new Date(ts)
    const pad = n => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  /** 重置数据（测试用） */
  reset() {
    const state = getDefaultState()
    saveState(state)
    return state
  },

  /** 清除数据（测试用） */
  clear() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      logger.warn('清除赛事报名状态失败', e)
    }
  }
}

export default competitionStore
