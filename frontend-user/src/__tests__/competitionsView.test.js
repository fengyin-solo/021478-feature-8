/**
 * 赛事报名页面集成测试
 *
 * 验证页面交互与数据一致性：
 * - 未登录点击报名 -> 登录弹窗
 * - 补充资料为空 -> 行内错误，不产生报名
 * - 满员报名 -> 候补名次视图展示名次与先后
 * - 重复点击 -> 直接打开状态视图，不重复报名
 * - 取消候补 -> 名次重排，可重新报名
 * - 返回赛事页 -> 关闭弹窗、清理 query
 * - 登录失效 -> 弹窗关闭并要求重新登录
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import Competitions from '../views/Competitions.vue'
import { authState } from '../utils/auth'

// localStorage mock
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

// scrollTo stub
global.window.scrollTo = vi.fn()

function mountPage(query = {}) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/competitions', name: 'Competitions', component: Competitions },
      { path: '/', name: 'Home', component: { template: '<div/>' } }
    ]
  })
  router.push({ path: '/competitions', query })
  return router.isReady().then(() => mount(Competitions, {
    global: {
      plugins: [router],
      stubs: { Teleport: true }
    }
  }))
}

function loginUser() {
  authState.isLoggedIn = true
  authState.token = 'test-token'
  authState.user = { id: 'U20260001', name: '张三', phone: '138****8888' }
}

function logoutUser() {
  authState.isLoggedIn = false
  authState.token = null
  authState.user = null
}

function compOne(wrapper) {
  return wrapper.vm.competitions.find(c => c.id === 1)
}

describe('Competitions Page Integration', () => {
  beforeEach(() => {
    localStorageMock.clear()
    logoutUser()
  })

  it('未登录点击报名打开登录弹窗，登录成功后继续报名流程', async () => {
    const wrapper = await mountPage()
    const comp = compOne(wrapper)
    wrapper.vm.handleAction(comp)
    await flushPromises()
    expect(wrapper.vm.showLoginModal).toBe(true)
    expect(wrapper.vm.pendingComp.id).toBe(1)

    loginUser()
    wrapper.vm.onLoginSuccess()
    await flushPromises()
    expect(wrapper.vm.showJoinModal).toBe(true)
  })

  it('资料为空时确认报名显示错误，不产生任何记录', async () => {
    loginUser()
    const wrapper = await mountPage()
    wrapper.vm.selectedComp = wrapper.vm.competitions.find(c => c.id === 4)
    wrapper.vm.openJoinModal()
    wrapper.vm.joinForm = { name: '', phone: '', idCard: '' }
    wrapper.vm.confirmJoin()
    await flushPromises()
    expect(wrapper.vm.formError).toBe('请填写参赛姓名')
    expect(wrapper.vm.showJoinModal).toBe(true)
  })

  it('满员赛事提交后进入候补并展示名次视图', async () => {
    loginUser()
    const wrapper = await mountPage()
    wrapper.vm.openJoinModal(compOne(wrapper))
    wrapper.vm.joinForm = { name: '测试用户', phone: '13811112222', idCard: '11010119900303123X' }
    wrapper.vm.confirmJoin()
    await vi.waitFor(() => expect(wrapper.vm.showWaitlistModal).toBe(true))

    expect(wrapper.vm.myWaitlistReg.rank).toBe(3)
    expect(wrapper.vm.waitlistQueue.map(r => r.rank)).toEqual([1, 2, 3])
    expect(wrapper.vm.waitlistQueue[2].isMe).toBe(true)
    expect(wrapper.vm.joinLoading).toBe(false)
  })

  it('候补状态下再次点击按钮，直接打开候补视图而非报名弹窗', async () => {
    loginUser()
    const wrapper = await mountPage()
    wrapper.vm.openJoinModal(compOne(wrapper))
    wrapper.vm.joinForm = { name: '测试用户', phone: '13811112222', idCard: '11010119900303123X' }
    wrapper.vm.confirmJoin()
    await vi.waitFor(() => expect(wrapper.vm.showWaitlistModal).toBe(true))

    wrapper.vm.showWaitlistModal = false
    wrapper.vm.handleAction(compOne(wrapper))
    await flushPromises()
    expect(wrapper.vm.showWaitlistModal).toBe(true)
    expect(wrapper.vm.showJoinModal).toBe(false)
    expect(wrapper.vm.waitlistQueue).toHaveLength(3)
  })

  it('取消候补后名次重排，按钮恢复为加入候补，可重新报名', async () => {
    loginUser()
    const wrapper = await mountPage()
    wrapper.vm.openJoinModal(compOne(wrapper))
    wrapper.vm.joinForm = { name: '测试用户', phone: '13811112222', idCard: '11010119900303123X' }
    wrapper.vm.confirmJoin()
    await vi.waitFor(() => expect(wrapper.vm.showWaitlistModal).toBe(true))

    // 取消候补
    wrapper.vm.showCancelWaitlistModal = true
    wrapper.vm.confirmCancelWaitlist()
    await vi.waitFor(() => expect(wrapper.vm.justCancelled).toBe(true))
    expect(wrapper.vm.myWaitlistReg).toBeNull()
    expect(wrapper.vm.waitlistQueue).toHaveLength(2)

    // 卡片按钮恢复
    expect(wrapper.vm.getActionText(compOne(wrapper))).toBe('加入候补')

    // 重新报名回到队尾
    wrapper.vm.rejoinAfterCancel()
    await vi.waitFor(() => expect(wrapper.vm.myWaitlistReg?.rank).toBe(3))
  })

  it('名额释放后候补自动递补，当前用户转正获得参赛号，任务与展示一致', async () => {
    loginUser()
    const wrapper = await mountPage()
    wrapper.vm.openJoinModal(compOne(wrapper))
    wrapper.vm.joinForm = { name: '测试用户', phone: '13811112222', idCard: '11010119900303123X' }
    wrapper.vm.confirmJoin()
    await vi.waitFor(() => expect(wrapper.vm.showWaitlistModal).toBe(true))

    wrapper.vm.simulateRelease()
    await vi.waitFor(() => expect(wrapper.vm.myWaitlistReg?.rank).toBe(2))
    wrapper.vm.simulateRelease()
    await vi.waitFor(() => expect(wrapper.vm.myWaitlistReg?.rank).toBe(1))
    wrapper.vm.simulateRelease()
    await vi.waitFor(() => expect(wrapper.vm.myPromotedReg).toBeTruthy())

    expect(wrapper.vm.myWaitlistReg).toBeNull()
    const stats = wrapper.vm.statsOf(compOne(wrapper))
    expect(stats.waitlistCount).toBe(0)
    expect(stats.isFull).toBe(true)
    expect(stats.registration.status).toBe('confirmed')
    expect(stats.registration.playerNo).toBe(wrapper.vm.myPromotedReg.playerNo)
    expect([29, 30, 31, 32]).toContain(stats.registration.playerNo)
  })

  it('返回赛事页关闭所有弹窗并清理路由参数', async () => {
    loginUser()
    const wrapper = await mountPage({ competitionId: '1' })
    await flushPromises()
    // 没有报名记录时进入报名弹窗
    expect(wrapper.vm.showJoinModal).toBe(true)
    expect(wrapper.vm.$route.path).toBe('/competitions')

    wrapper.vm.backToCompetitions()
    await flushPromises()
    expect(wrapper.vm.showJoinModal).toBe(false)
    expect(wrapper.vm.showWaitlistModal).toBe(false)
    expect(wrapper.vm.$route.query.competitionId).toBeUndefined()
  })

  it('提交过程中登录失效：关闭弹窗并重新拉起登录，不写入报名数据', async () => {
    loginUser()
    const wrapper = await mountPage()
    const comp = wrapper.vm.competitions.find(c => c.id === 4)
    wrapper.vm.openJoinModal(comp)
    wrapper.vm.joinForm = { name: '测试用户', phone: '13811112222', idCard: '11010119900303123X' }

    // 在异步等待期间退出登录
    const promise = wrapper.vm.confirmJoin()
    await new Promise(r => setTimeout(r, 50))
    logoutUser()
    await promise
    await flushPromises()

    expect(wrapper.vm.showJoinModal).toBe(false)
    expect(wrapper.vm.showLoginModal).toBe(true)
    expect(wrapper.vm.pendingComp.id).toBe(4)
    expect(wrapper.vm.statsOf(comp).participants).toBe(comp.baseParticipants)
  })
})
