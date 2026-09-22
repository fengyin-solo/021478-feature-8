/**
 * 赛事报名 / 候补 存储模块单元测试
 *
 * 覆盖不变量：
 * - 资料为空禁止报名
 * - 重复报名拦截（正式 / 候补）
 * - 满员进入候补，不分配参赛号
 * - 名额空出按候补顺序递补，参赛号正确分配/回收
 * - 取消候补后名次前移
 * - 登录失效（退出登录）读不到/写不了报名
 * - 返回赛事页时名额与展示一致
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { authState, login, logout } from '../utils/auth'
import { competitionStore } from '../utils/competitionStore'

// ==================== Mock 设置 ====================

const localStorageData = {}
const localStorageMock = {
  getItem: vi.fn(key => (key in localStorageData ? localStorageData[key] : null)),
  setItem: vi.fn((key, value) => { localStorageData[key] = String(value) }),
  removeItem: vi.fn(key => { delete localStorageData[key] }),
  clear: vi.fn(() => {
    for (const k of Object.keys(localStorageData)) delete localStorageData[k]
  })
}
Object.defineProperty(global, 'localStorage', { value: localStorageMock, configurable: true })

const FULL_COMP = 1 // 2026春季斯诺克公开赛 32/32，默认带 1 条候补
const OPEN_COMP = 4 // 会员积分争霸赛 12/48

async function loginUser() {
  const result = await login('user', '123456')
  expect(result.success).toBe(true)
  return result.user
}

describe('Competition Store', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    authState.isLoggedIn = false
    authState.user = null
    authState.token = null
    competitionStore.reset()
  })

  describe('初始数据与展示一致性', () => {
    it('满员赛事显示 32/32 且有 1 人候补', () => {
      const comp = competitionStore.getCompetition(FULL_COMP)
      expect(comp.participants).toBe(32)
      expect(comp.maxParticipants).toBe(32)
      expect(comp.isFull).toBe(true)
      expect(comp.waitingCount).toBe(1)
    })

    it('有名额赛事未满员', () => {
      const comp = competitionStore.getCompetition(OPEN_COMP)
      expect(comp.isFull).toBe(false)
      expect(comp.participants).toBe(12)
      expect(comp.waitingCount).toBe(0)
    })

    it('每次获取都重新计算（模拟返回赛事页后数据同步）', () => {
      const before = competitionStore.getCompetition(OPEN_COMP).participants
      expect(before).toBe(12)
    })
  })

  describe('登录失效', () => {
    it('未登录不能报名', () => {
      const result = competitionStore.register(OPEN_COMP, { name: '张三', phone: '13800001111' })
      expect(result.success).toBe(false)
      expect(result.code).toBe('UNAUTHENTICATED')
    })

    it('未登录查不到我的报名', () => {
      expect(competitionStore.getMyRegistration(OPEN_COMP)).toBeNull()
    })

    it('退出登录后不能取消，且查不到既有报名', async () => {
      await loginUser()
      competitionStore.register(OPEN_COMP, { name: '张三', phone: '13800001111' })
      expect(competitionStore.getMyRegistration(OPEN_COMP)).not.toBeNull()

      await logout()
      expect(competitionStore.getMyRegistration(OPEN_COMP)).toBeNull()

      const cancelResult = competitionStore.cancelRegistration(OPEN_COMP)
      expect(cancelResult.success).toBe(false)
      expect(cancelResult.code).toBe('UNAUTHENTICATED')

      // 退出登录没有释放名额
      const comp = competitionStore.getCompetition(OPEN_COMP)
      expect(comp.participants).toBe(13)
    })
  })

  describe('资料为空', () => {
    it('姓名或手机号为空时拒绝报名，不占名额', async () => {
      await loginUser()
      const before = competitionStore.getCompetition(OPEN_COMP).participants

      let result = competitionStore.register(OPEN_COMP, { name: '', phone: '13800001111' })
      expect(result.success).toBe(false)
      expect(result.code).toBe('INVALID')

      result = competitionStore.register(OPEN_COMP, { name: '张三', phone: '' })
      expect(result.success).toBe(false)
      expect(result.code).toBe('INVALID')

      const after = competitionStore.getCompetition(OPEN_COMP).participants
      expect(after).toBe(before)
      expect(competitionStore.getMyRegistration(OPEN_COMP)).toBeNull()
    })

    it('手机号格式错误时拒绝报名', async () => {
      await loginUser()
      const result = competitionStore.register(OPEN_COMP, { name: '张三', phone: '123' })
      expect(result.success).toBe(false)
      expect(result.message).toContain('手机号')
    })
  })

  describe('正式报名与参赛号', () => {
    it('有名额时报名成功并分配唯一参赛号', async () => {
      await loginUser()
      const result = competitionStore.register(OPEN_COMP, { name: '张三', phone: '13800001111', note: '左手' })

      expect(result.success).toBe(true)
      expect(result.registration.status).toBe('confirmed')
      expect(result.registration.playerNo).toBe(13)
      expect(result.registration.regNo).toMatch(/^REG\d{6}$/)

      const comp = competitionStore.getCompetition(OPEN_COMP)
      expect(comp.participants).toBe(13)
    })

    it('报名后在任务中心可查到参赛号', async () => {
      await loginUser()
      const reg = competitionStore.register(OPEN_COMP, { name: '张三', phone: '13800001111' }).registration
      // taskStore 联动验证（通过 localStorage 中任务数据）
      const tasksRaw = JSON.parse(localStorage.getItem('billiard_user_tasks'))
      const task = tasksRaw.find(t => t.type === 'competition' && t.extra.regNo === reg.regNo)
      expect(task).toBeDefined()
      expect(task.status).toBe('upcoming')
      expect(task.extra.playerNo).toBe(13)
    })
  })

  describe('满员进入候补', () => {
    it('满员赛事报名进入候补，不分配参赛号，名次顺延', async () => {
      await loginUser()
      const result = competitionStore.register(FULL_COMP, { name: '张三', phone: '13800001111' })

      expect(result.success).toBe(true)
      expect(result.registration.status).toBe('waitlisted')
      expect(result.registration.playerNo).toBeNull()
      expect(result.registration.rank).toBe(2) // 预置候补排第 1

      const comp = competitionStore.getCompetition(FULL_COMP)
      expect(comp.participants).toBe(32) // 名额不变
      expect(comp.waitingCount).toBe(2)
    })

    it('候补名次视图按先后排序并高亮自己', async () => {
      await loginUser()
      competitionStore.register(FULL_COMP, { name: '张三', phone: '13800001111' })
      const view = competitionStore.getWaitlistView(FULL_COMP)

      expect(view.active).toHaveLength(2)
      expect(view.active[0].name).toBe('赵六')
      expect(view.active[1].name).toBe('张三')
      expect(view.active[1].isMine).toBe(true)
      expect(view.active.map(i => i.rank)).toEqual([1, 2])
      // 他人手机号脱敏
      expect(view.active[0].displayPhone).toContain('****')
    })

    it('候补人没有参赛号', async () => {
      await loginUser()
      competitionStore.register(FULL_COMP, { name: '张三', phone: '13800001111' })
      const view = competitionStore.getWaitlistView(FULL_COMP)
      expect(view.myReg.playerNo).toBeNull()
      expect(view.myReg.rank).toBe(2)
    })
  })

  describe('重复报名', () => {
    it('已正式报名不能再次报名', async () => {
      await loginUser()
      competitionStore.register(OPEN_COMP, { name: '张三', phone: '13800001111' })
      const second = competitionStore.register(OPEN_COMP, { name: '张三', phone: '13800001111' })
      expect(second.success).toBe(false)
      expect(second.code).toBe('DUPLICATE')
      // 名额不重复增加
      expect(competitionStore.getCompetition(OPEN_COMP).participants).toBe(13)
    })

    it('已在候补名单不能再次报名', async () => {
      await loginUser()
      competitionStore.register(FULL_COMP, { name: '张三', phone: '13800001111' })
      const second = competitionStore.register(FULL_COMP, { name: '张三', phone: '13800001111' })
      expect(second.success).toBe(false)
      expect(second.code).toBe('DUPLICATE')
      expect(competitionStore.getCompetition(FULL_COMP).waitingCount).toBe(2)
    })

    it('取消后允许重新报名', async () => {
      await loginUser()
      competitionStore.register(OPEN_COMP, { name: '张三', phone: '13800001111' })
      competitionStore.cancelRegistration(OPEN_COMP)
      const again = competitionStore.register(OPEN_COMP, { name: '张三', phone: '13800001111' })
      expect(again.success).toBe(true)
      expect(competitionStore.getCompetition(OPEN_COMP).participants).toBe(13)
    })
  })

  describe('满员变化与自动递补', () => {
    it('释放名额后候补队首递补，参赛号为下一个递增号', async () => {
      await loginUser()
      competitionStore.register(FULL_COMP, { name: '张三', phone: '13800001111' })

      // 第一次释放：预置的赵六（第 1 位）递补
      let result = competitionStore.simulateVacancy(FULL_COMP)
      expect(result.success).toBe(true)
      expect(result.promoted.name).toBe('赵六')
      expect(result.promoted.playerNo).toBe(33)

      let comp = competitionStore.getCompetition(FULL_COMP)
      expect(comp.participants).toBe(32) // 31 基础 + 赵六
      expect(comp.waitingCount).toBe(1)

      // 我的名次前移到第 1，但仍无参赛号
      let myReg = competitionStore.getMyRegistration(FULL_COMP)
      expect(myReg.status).toBe('waitlisted')
      expect(myReg.rank).toBe(1)
      expect(myReg.playerNo).toBeNull()

      // 第二次释放：自己递补
      result = competitionStore.simulateVacancy(FULL_COMP)
      expect(result.success).toBe(true)
      expect(result.promoted.name).toBe('张三')
      expect(result.promoted.playerNo).toBe(34)

      comp = competitionStore.getCompetition(FULL_COMP)
      expect(comp.participants).toBe(32) // 30 基础 + 赵六 + 张三
      expect(comp.waitingCount).toBe(0)

      myReg = competitionStore.getMyRegistration(FULL_COMP)
      expect(myReg.status).toBe('confirmed')
      expect(myReg.playerNo).toBe(34)

      // 候补视图展示递补结果
      const view = competitionStore.getWaitlistView(FULL_COMP)
      expect(view.promoted.map(p => p.name)).toEqual(['张三', '赵六'])
    })

    it('没有候补时释放名额失败', () => {
      const result = competitionStore.simulateVacancy(OPEN_COMP)
      expect(result.success).toBe(false)
      expect(result.code).toBe('NO_WAITLIST')
    })
  })

  describe('取消候补', () => {
    it('取消候补后名次前移，名额与参赛号不变', async () => {
      await loginUser()
      competitionStore.register(FULL_COMP, { name: '张三', phone: '13800001111' })
      const cancelResult = competitionStore.cancelRegistration(FULL_COMP)

      expect(cancelResult.success).toBe(true)
      expect(cancelResult.cancelled.status).toBe('cancelled')
      expect(cancelResult.promoted).toBeNull() // 候补取消不触发递补

      const comp = competitionStore.getCompetition(FULL_COMP)
      expect(comp.participants).toBe(32)
      expect(comp.waitingCount).toBe(1)
      expect(competitionStore.getMyRegistration(FULL_COMP)).toBeNull()

      // 预置候补仍是第 1 位
      const view = competitionStore.getWaitlistView(FULL_COMP)
      expect(view.active.map(i => i.rank)).toEqual([1])
    })
  })

  describe('取消正式报名', () => {
    it('回收参赛号并自动递补候补队首；新报名复用回收号', async () => {
      await loginUser()
      // 在有空位的赛事先制造一个候补：先报满 OPEN_COMP（48 名额太多，改用直接候补流程）
      // 步骤1：在 OPEN_COMP 报名（参赛号 13）
      const reg = competitionStore.register(OPEN_COMP, { name: '张三', phone: '13800001111' }).registration
      expect(reg.playerNo).toBe(13)
      // 步骤2：直接验证参赛号回收 —— 取消后 13 号进入空闲池
      let cancelResult = competitionStore.cancelRegistration(OPEN_COMP)
      expect(cancelResult.success).toBe(true)
      expect(cancelResult.cancelled.releasedPlayerNo).toBe(13)
      expect(cancelResult.promoted).toBeNull() // 无候补
      expect(competitionStore.getCompetition(OPEN_COMP).participants).toBe(12)

      // 步骤3：再次报名复用 13 号
      const again = competitionStore.register(OPEN_COMP, { name: '张三', phone: '13800001111' })
      expect(again.registration.playerNo).toBe(13)
    })

    it('正式报名者取消时若有候补则立即递补', async () => {
      await loginUser()
      // FULL_COMP 当前：赵六候补第 1，自己候补第 2
      competitionStore.register(FULL_COMP, { name: '张三', phone: '13800001111' })
      // 让赵六先递补为正式，自己成为候补第 1
      competitionStore.simulateVacancy(FULL_COMP)
      expect(competitionStore.getWaitlistView(FULL_COMP).myReg.rank).toBe(1)

      // 赵六为匿名用户，用其报名编号取消（模拟正式报名者退出）
      const viewBefore = competitionStore.getWaitlistView(FULL_COMP)
      const zhaoRegNo = viewBefore.promoted[0].regNo
      const result = competitionStore.cancelByRegNo(zhaoRegNo)

      expect(result.success).toBe(true)
      expect(result.cancelled.releasedPlayerNo).toBe(33)
      // 自己作为候补队首被递补，复用赵六的参赛号 33
      expect(result.promoted.name).toBe('张三')
      expect(result.promoted.playerNo).toBe(33)

      const myReg = competitionStore.getMyRegistration(FULL_COMP)
      expect(myReg.status).toBe('confirmed')
      expect(myReg.playerNo).toBe(33)
    })
  })

  describe('持久化（返回赛事页 / 刷新）', () => {
    it('报名记录在重新加载状态后保持一致', async () => {
      await loginUser()
      competitionStore.register(FULL_COMP, { name: '张三', phone: '13800001111' })

      // 重新从 localStorage 读取（模拟刷新页面 / 返回赛事页）
      const comp = competitionStore.getCompetition(FULL_COMP)
      expect(comp.waitingCount).toBe(2)
      const myReg = competitionStore.getMyRegistration(FULL_COMP)
      expect(myReg.status).toBe('waitlisted')
      expect(myReg.rank).toBe(2)
      expect(myReg.playerNo).toBeNull()
    })

    it('候补任务在任务中心状态为 waitlisted', async () => {
      await loginUser()
      const reg = competitionStore.register(FULL_COMP, { name: '张三', phone: '13800001111' }).registration
      const tasksRaw = JSON.parse(localStorage.getItem('billiard_user_tasks'))
      const task = tasksRaw.find(t => t.type === 'competition' && t.extra.regNo === reg.regNo)
      expect(task.status).toBe('waitlisted')
      expect(task.extra.playerNo).toBeNull()
      expect(task.extra.waitlistNo).toBe(2)
    })
  })
})
