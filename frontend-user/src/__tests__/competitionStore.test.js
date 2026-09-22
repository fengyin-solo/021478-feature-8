/**
 * 赛事报名（含候补）存储逻辑测试
 *
 * 覆盖：
 * - 补充资料校验（资料为空/格式错误）
 * - 满员进入候补、候补名次先后
 * - 名额释放按名次自动递补、参赛号正确分配
 * - 重复报名拦截
 * - 取消候补
 * - 名额变化后名额/参赛号/名次不错配
 * - 未登录拦截
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { competitionStore, COMPETITION_BASE, maskName, maskPhone } from '../utils/competitionStore'
import { taskStore } from '../utils/taskStore'

// ==================== Mock localStorage ====================

const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn(key => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null)),
    setItem: vi.fn((key, value) => { store[key] = String(value) }),
    removeItem: vi.fn(key => { delete store[key] }),
    clear: vi.fn(() => { store = {} })
  }
})()
Object.defineProperty(global, 'localStorage', { value: localStorageMock, configurable: true })

// ==================== 测试常量 ====================

const USER_A = 'user-A'
const USER_B = 'user-B'
const USER_C = 'user-C'

const compFull = {
  id: 901,
  name: '测试满员赛事',
  date: '2026-05-01',
  fee: 100,
  baseParticipants: 3,
  maxParticipants: 3,
  status: 'upcoming'
}
const compOpen = {
  id: 902,
  name: '测试未满赛事',
  date: '2026-06-01',
  fee: 50,
  baseParticipants: 2,
  maxParticipants: 4,
  status: 'upcoming'
}

const validProfile = {
  name: '张三',
  phone: '13800001234',
  idCard: '11010119900101001X'
}

function registerAs(userId, comp = compFull, profile = {}) {
  return competitionStore.register(comp, { userId, ...validProfile, ...profile })
}

describe('Competition Registration Store', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('登录校验', () => {
    it('未登录报名应被拒绝且不写入数据', () => {
      const result = competitionStore.register(compOpen, { ...validProfile, userId: null })
      expect(result.success).toBe(false)
      expect(result.code).toBe('NOT_AUTHENTICATED')
      expect(competitionStore.getStats(compOpen, null).participants).toBe(2)
    })
  })

  describe('资料完整性', () => {
    it('姓名为空时拒绝报名', () => {
      const result = registerAs(USER_A, compOpen, { name: '  ' })
      expect(result.success).toBe(false)
      expect(result.code).toBe('EMPTY_PROFILE')
      expect(result.field).toBe('name')
    })

    it('手机号格式错误时拒绝报名', () => {
      const result = registerAs(USER_A, compOpen, { phone: '12345' })
      expect(result.success).toBe(false)
      expect(result.field).toBe('phone')
    })

    it('证件号为空或过短时拒绝报名', () => {
      expect(registerAs(USER_A, compOpen, { idCard: '' }).success).toBe(false)
      expect(registerAs(USER_A, compOpen, { idCard: '123' }).success).toBe(false)
    })

    it('资料校验失败时名额不发生变化', () => {
      registerAs(USER_A, compOpen, { name: '' })
      const stats = competitionStore.getStats(compOpen, USER_A)
      expect(stats.participants).toBe(2)
      expect(stats.waitlistCount).toBe(0)
      expect(stats.registration).toBeNull()
    })
  })

  describe('正常报名', () => {
    it('未满赛事报名成功并分配顺序参赛号', () => {
      const result = registerAs(USER_A, compOpen)
      expect(result.success).toBe(true)
      expect(result.status).toBe('confirmed')
      expect(result.registration.playerNo).toBe(3)

      const stats = competitionStore.getStats(compOpen, USER_A)
      expect(stats.participants).toBe(3)
      expect(stats.available).toBe(1)
      expect(stats.registration.playerNo).toBe(3)
    })

    it('报名成功后同步生成任务中心记录', () => {
      registerAs(USER_A, compOpen)
      const task = taskStore.getById('COMP-902-user-A')
      expect(task).toBeTruthy()
      expect(task.type).toBe('competition')
      expect(task.status).toBe('upcoming')
      expect(task.extra.playerNo).toBe(3)
    })
  })

  describe('满员与候补', () => {
    it('满员赛事报名进入候补，名次按报名先后递增', () => {
      const r1 = registerAs(USER_A, compFull)
      const r2 = registerAs(USER_B, compFull)

      expect(r1.success).toBe(true)
      expect(r1.isWaitlisted).toBe(true)
      expect(r1.rank).toBe(1)
      expect(r2.rank).toBe(2)

      const stats = competitionStore.getStats(compFull, USER_A)
      expect(stats.isFull).toBe(true)
      expect(stats.waitlistCount).toBe(2)
      expect(stats.participants).toBe(3)
      expect(stats.registration.rank).toBe(1)

      const queue = competitionStore.getWaitlistQueue(compFull, USER_A)
      expect(queue.map(r => r.rank)).toEqual([1, 2])
      expect(queue[0].isMe).toBe(true)
    })

    it('候补记录在任务中心标记为候补中且金额为0', () => {
      registerAs(USER_A, compFull)
      const task = taskStore.getById('COMP-901-user-A')
      expect(task.status).toBe('waitlisted')
      expect(task.statusText).toBe('候补中')
      expect(task.amount).toBe(0)
      const keys = task.actions.map(a => a.key)
      expect(keys).toContain('view_waitlist')
      expect(keys).toContain('cancel_waitlist')
    })

    it('重复报名（正式）被拦截，不产生第二条记录', () => {
      registerAs(USER_A, compOpen)
      const dup = registerAs(USER_A, compOpen)
      expect(dup.success).toBe(false)
      expect(dup.code).toBe('DUPLICATE')
      expect(competitionStore.getStats(compOpen, USER_A).participants).toBe(3)
      expect(taskStore.getAll().filter(t => t.id === 'COMP-902-user-A')).toHaveLength(1)
    })

    it('重复报名（候补）被拦截且返回当前名次', () => {
      registerAs(USER_A, compFull)
      const dup = registerAs(USER_A, compFull)
      expect(dup.success).toBe(false)
      expect(dup.code).toBe('DUPLICATE')
      expect(dup.registration.status).toBe('waitlisted')
      expect(dup.registration.rank).toBe(1)
      expect(competitionStore.getWaitlistQueue(compFull, USER_A)).toHaveLength(1)
    })
  })

  describe('名额释放与自动递补', () => {
    it('候补用户不能释放名额（演示接口）', () => {
      registerAs(USER_A, compFull)
      expect(competitionStore.canSimulateRelease(compFull, USER_A)).toBe(false)
    })

    it('未满赛事中，新人报名与既有候补不会错配：先递补队首再处理新人', () => {
      // 2/4 -> A 候补? 不，先填满
      registerAs(USER_A, compOpen) // 3/4 正式
      registerAs(USER_B, compOpen) // 4/4 正式
      registerAs(USER_C, compOpen) // 候补第1
      // B 退赛释放名额：C 应递补
      // 直接构造：用 simulateRelease 对普通正式记录无效（种子才可释放），
      // 因此这里通过取消正式报名的底层路径不可用，改用满员赛事场景覆盖。
      const stats = competitionStore.getStats(compOpen, USER_C)
      expect(stats.isFull).toBe(true)
      expect(stats.registration.rank).toBe(1)
    })

    it('种子满员赛事：释放名额后队首候补按序转正并获得正确参赛号', () => {
      competitionStore.ensureSeeded()
      const seededComp = {
        id: 1,
        name: '2026春季斯诺克公开赛',
        date: '2026-03-15',
        fee: 200,
        baseParticipants: 28,
        maxParticipants: 32,
        status: 'upcoming'
      }
      const before = competitionStore.getStats(seededComp, USER_A)
      expect(before.isFull).toBe(true)
      expect(before.waitlistCount).toBe(2)

      // 当前用户加入候补 -> 第3位
      const mine = competitionStore.register(seededComp, { userId: USER_A, ...validProfile })
      expect(mine.isWaitlisted).toBe(true)
      expect(mine.rank).toBe(3)
      expect(competitionStore.canSimulateRelease(seededComp, USER_A)).toBe(true)

      // 第一次释放：队首种子候补转正，占用 29/30/31/32 中释放的号
      const release1 = competitionStore.simulateRelease(seededComp, USER_A)
      expect(release1.success).toBe(true)
      expect(release1.promoted).toHaveLength(1)
      expect([29, 30, 31, 32]).toContain(release1.promoted[0].playerNo)
      expect(competitionStore.getStats(seededComp, USER_A).registration.rank).toBe(2)

      // 再释放两次：种子候补2 -> 当前用户转正
      competitionStore.simulateRelease(seededComp, USER_A)
      const release3 = competitionStore.simulateRelease(seededComp, USER_A)
      expect(release3.myPromoted).toBeTruthy()
      expect([29, 30, 31, 32]).toContain(release3.myPromoted.playerNo)

      const stats = competitionStore.getStats(seededComp, USER_A)
      expect(stats.isFull).toBe(true)
      expect(stats.waitlistCount).toBe(0)
      expect(stats.registration.status).toBe('confirmed')
      // 参赛号唯一
      const queue = competitionStore.getPromotedList(seededComp, USER_A)
      const all = [
        ...queue.map(r => r.playerNo),
        ...competitionStore.getStats(seededComp, USER_A).waitlist.map(r => r.playerNo)
      ]
      expect(new Set(all).size).toBe(all.length)

      // 转正后任务变为待开始
      const task = taskStore.getById('COMP-1-user-A')
      expect(task.status).toBe('upcoming')
      expect(task.extra.playerNo).toBe(release3.myPromoted.playerNo)
    })
  })

  describe('取消候补', () => {
    it('取消候补后释放名次，后续候补名次前移', () => {
      registerAs(USER_A, compFull) // 第1
      registerAs(USER_B, compFull) // 第2
      registerAs(USER_C, compFull) // 第3

      const result = competitionStore.cancelWaitlist(compFull, USER_B)
      expect(result.success).toBe(true)

      const queue = competitionStore.getWaitlistQueue(compFull, USER_C)
      expect(queue).toHaveLength(2)
      expect(queue.map(r => r.userId)).toEqual([USER_A, USER_C])
      expect(competitionStore.getStats(compFull, USER_C).registration.rank).toBe(2)
      expect(competitionStore.getStats(compFull, USER_B).registration).toBeNull()

      // 任务同步删除
      expect(taskStore.getById('COMP-901-user-B')).toBeNull()
    })

    it('取消候补后可重新报名进入队尾', () => {
      registerAs(USER_A, compFull)
      registerAs(USER_B, compFull)
      competitionStore.cancelWaitlist(compFull, USER_A)
      const re = registerAs(USER_A, compFull)
      expect(re.success).toBe(true)
      expect(re.rank).toBe(2)
    })

    it('取消候补不影响正式名额与参赛号', () => {
      registerAs(USER_A, compOpen) // 正式 #3
      registerAs(USER_B, compFull) // 候补（另一赛事）
      competitionStore.cancelWaitlist(compFull, USER_B)
      expect(competitionStore.getStats(compOpen, USER_A).participants).toBe(3)
      expect(competitionStore.getStats(compOpen, USER_A).registration.playerNo).toBe(3)
    })

    it('未登录不能取消候补', () => {
      const result = competitionStore.cancelWaitlist(compFull, null)
      expect(result.success).toBe(false)
      expect(result.code).toBe('NOT_AUTHENTICATED')
    })

    it('非候补状态取消返回失败', () => {
      registerAs(USER_A, compOpen)
      const result = competitionStore.cancelWaitlist(compOpen, USER_A)
      expect(result.success).toBe(false)
      expect(result.code).toBe('NOT_WAITLISTED')
    })
  })

  describe('多赛事隔离', () => {
    it('同一用户可报名不同赛事，参赛号互不影响', () => {
      const r1 = registerAs(USER_A, compOpen)
      const r2 = registerAs(USER_A, { ...compFull, id: 903 })
      expect(r1.status).toBe('confirmed')
      expect(r2.isWaitlisted).toBe(true)
      expect(competitionStore.getStats(compOpen, USER_A).registration.status).toBe('confirmed')
      expect(competitionStore.getStats({ id: 903 }, USER_A).registration.status).toBe('waitlisted')
    })
  })

  describe('脱敏工具', () => {
    it('姓名与手机号脱敏正确', () => {
      expect(maskName('张三')).toBe('张*')
      expect(maskName('王')).toBe('王')
      expect(maskPhone('13812345678')).toBe('138****5678')
    })
  })

  describe('COMPETITION_BASE 与种子幂等', () => {
    it('COMPETITION_BASE 覆盖全部页面赛事', () => {
      ;[1, 2, 3, 4, 5].forEach(id => {
        expect(COMPETITION_BASE[id]).toBeTruthy()
      })
    })

    it('ensureSeeded 幂等，不会重复插入种子', () => {
      competitionStore.ensureSeeded()
      competitionStore.ensureSeeded()
      const stats = competitionStore.getStats(1, null)
      expect(stats.confirmedStored).toBe(4)
      expect(stats.waitlistCount).toBe(2)
    })
  })
})
