<template>
  <div class="competitions-page">
    <header class="page-header">
      <div class="header-content">
        <span class="page-tag">精彩赛事</span>
        <h1>赛事活动</h1>
        <p>参与精彩赛事，展示您的球技，赢取丰厚奖金</p>
      </div>
    </header>

    <div class="tabs-container">
      <div class="tabs">
        <button v-for="tab in tabs" :key="tab.id" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-text">{{ tab.name }}</span>
          <span class="tab-count">{{ getCount(tab.id) }}</span>
        </button>
      </div>
    </div>

    <div class="competitions-list">
      <div v-for="comp in filteredCompetitions" :key="comp.id" class="competition-card" :class="comp.status">
        <div class="card-left">
          <div class="date-block">
            <span class="month">{{ getMonth(comp.date) }}</span>
            <span class="day">{{ getDay(comp.date) }}</span>
          </div>
        </div>
        <div class="card-main">
          <div class="card-header">
            <div class="status-badge" :class="comp.status">
              <span class="status-dot"></span>
              <span>{{ statusText[comp.status] }}</span>
            </div>
            <div class="comp-type">{{ comp.type }}</div>
            <div v-if="comp.status === 'upcoming' && myRegs[comp.id]?.status === 'waitlisted'" class="my-badge waiting">
              候补第 {{ myRegs[comp.id].rank }} 位
            </div>
            <div v-else-if="comp.status === 'upcoming' && myRegs[comp.id]?.status === 'confirmed'" class="my-badge joined">
              ✓ 已报名
            </div>
          </div>
          <h3>{{ comp.name }}</h3>
          <div class="comp-details">
            <div class="detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>{{ comp.location }}</span>
            </div>
            <div class="detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <span>{{ comp.participants }}/{{ comp.maxParticipants }}人</span>
            </div>
            <div v-if="comp.waitingCount > 0" class="detail wait-tag">
              <span>🕓 候补 {{ comp.waitingCount }} 人</span>
            </div>
          </div>
        </div>
        <div class="card-right">
          <div class="prize-info"><span class="prize-label">奖金池</span><span class="prize-amount">¥{{ formatNumber(comp.prize) }}</span></div>
          <div class="fee-info"><span class="fee-label">报名费</span><span class="fee-amount">¥{{ comp.fee }}</span></div>
          <button class="btn-action" :class="getActionClass(comp)" @click="handleAction(comp)">
            <span>{{ getActionText(comp) }}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
        <div v-if="comp.status === 'upcoming'" class="progress-bar">
          <div class="progress" :class="{ full: comp.isFull }" :style="{ width: Math.min(comp.participants / comp.maxParticipants * 100, 100) + '%' }"></div>
        </div>
      </div>
    </div>

    <div v-if="filteredCompetitions.length === 0" class="empty-state">
      <div class="empty-icon">🏆</div>
      <h3>暂无{{ tabs.find(t => t.id === activeTab)?.name }}赛事</h3>
      <p>请关注其他类型的赛事或稍后再来查看</p>
    </div>

    <!-- Join Modal（补充参赛资料） -->
    <Modal v-model="showJoinModal" icon="🏆" icon-type="info" title="报名参赛" :subtitle="currentComp?.name" size="medium" confirm-text="提交报名" :loading="joinLoading" :confirm-disabled="joinLoading" @confirm="confirmJoin">
      <div v-if="currentComp" class="join-form">
        <div class="join-info">
          <div class="info-row"><span class="label">比赛日期</span><span class="value">{{ currentComp.date }}</span></div>
          <div class="info-row"><span class="label">比赛地点</span><span class="value">{{ currentComp.location }}</span></div>
          <div class="info-row"><span class="label">名额</span>
            <span class="value" :class="{ warn: currentComp.isFull }">
              {{ currentComp.participants }}/{{ currentComp.maxParticipants }}人
              <template v-if="currentComp.isFull">（已满，报名将进入候补）</template>
            </span>
          </div>
          <div class="info-row total"><span class="label">报名费</span><span class="value price">¥{{ currentComp.fee }}</span></div>
        </div>
        <div class="form-group">
          <label>真实姓名 <i>*</i></label>
          <input v-model.trim="joinForm.name" type="text" maxlength="20" placeholder="请输入参赛真实姓名" :disabled="joinLoading" />
        </div>
        <div class="form-group">
          <label>手机号 <i>*</i></label>
          <input v-model.trim="joinForm.phone" type="tel" maxlength="11" placeholder="用于赛前联系，请输入11位手机号" :disabled="joinLoading" />
        </div>
        <div class="form-group">
          <label>备注（选填）</label>
          <textarea v-model="joinForm.note" rows="2" maxlength="100" placeholder="如饮食习惯、让球说明等（选填）" :disabled="joinLoading"></textarea>
        </div>
        <p v-if="joinFormError" class="form-error">⚠️ {{ joinFormError }}</p>
      </div>
    </Modal>

    <!-- Registration Result Modal（正式报名 / 进入候补，两种结果） -->
    <Modal
      v-model="showRegResultModal" :icon="lastOutcome === 'waitlisted' ? '🕓' : '🎉'" :icon-type="lastOutcome === 'waitlisted' ? 'info' : 'success'"
      :title="lastOutcome === 'waitlisted' ? '已进入候补' : '报名成功'"
      :subtitle="lastOutcome === 'waitlisted' ? '名额空出时将按候补顺序自动递补' : '祝您比赛取得好成绩'"
      size="small">
      <div v-if="lastRegistration" class="success-info">
        <template v-if="lastOutcome === 'waitlisted'">
          <div class="info-row"><span class="label">候补编号</span><span class="value">{{ lastRegistration.regNo }}</span></div>
          <div class="info-row"><span class="label">比赛</span><span class="value">{{ lastRegistration.competitionName }}</span></div>
          <div class="info-row"><span class="label">候补名次</span><span class="value highlight">第 {{ lastRegistration.rank }} 位</span></div>
          <p class="result-tip">参赛号将在候补转正后分配，请留意通知</p>
        </template>
        <template v-else>
          <div class="info-row"><span class="label">报名编号</span><span class="value">{{ lastRegistration.regNo }}</span></div>
          <div class="info-row"><span class="label">比赛</span><span class="value">{{ lastRegistration.competitionName }}</span></div>
          <div class="info-row"><span class="label">参赛号</span><span class="value highlight">#{{ lastRegistration.playerNo }}</span></div>
        </template>
      </div>
      <template #footer>
        <button v-if="lastOutcome === 'waitlisted'" class="btn-cancel" @click="viewResultOutcome">查看候补名次</button>
        <button v-else class="btn-cancel" @click="viewResultOutcome">查看报名详情</button>
        <button class="btn-confirm primary" @click="showRegResultModal = false">返回赛事页</button>
      </template>
    </Modal>

    <!-- My Registration Detail Modal -->
    <Modal
v-model="showDetailModal" icon="🎫" icon-type="info" title="报名详情" :subtitle="currentComp?.name" size="small"
      confirm-text="取消报名" confirm-type="danger" @confirm="requestCancelFromDetail">
      <div v-if="detailReg" class="success-info">
        <div class="info-row"><span class="label">报名编号</span><span class="value">{{ detailReg.regNo }}</span></div>
        <div class="info-row"><span class="label">参赛号</span><span class="value highlight">#{{ detailReg.playerNo }}</span></div>
        <div class="info-row"><span class="label">姓名</span><span class="value">{{ detailReg.name }}</span></div>
        <div class="info-row"><span class="label">手机号</span><span class="value">{{ detailReg.phone }}</span></div>
        <div v-if="detailReg.note" class="info-row"><span class="label">备注</span><span class="value">{{ detailReg.note }}</span></div>
        <div class="info-row"><span class="label">报名时间</span><span class="value">{{ formatTime(detailReg.createdAt) }}</span></div>
      </div>
    </Modal>

    <!-- Waitlist Rank View Modal（候补名次视图：先后顺序 + 可操作结果） -->
    <Modal
v-model="showWaitlistModal" title="候补名次" :subtitle="waitlistData.competition?.name" size="large"
      :show-footer="false" @cancel="showWaitlistModal = false">
      <div class="waitlist-view">
        <!-- 我的状态 -->
        <div v-if="waitlistData.myReg" class="my-status" :class="waitlistData.myReg.status">
          <template v-if="waitlistData.myReg.status === 'waitlisted'">
            <div class="my-status-main">
              <span class="my-status-label">您的候补名次</span>
              <span class="my-status-rank">第 {{ waitlistData.myReg.rank }} 位</span>
            </div>
            <span class="my-status-sub">前面还有 {{ Math.max((waitlistData.myReg.rank || 1) - 1, 0) }} 人，名额空出时自动递补</span>
          </template>
          <template v-else>
            <div class="my-status-main">
              <span class="my-status-label">✓ 您已候补转正</span>
              <span class="my-status-rank">参赛号 #{{ waitlistData.myReg.playerNo }}</span>
            </div>
            <span class="my-status-sub">请按时参加比赛</span>
          </template>
        </div>

        <!-- 候补名单 -->
        <h4 class="waitlist-section-title">候补队列（{{ waitlistData.active.length }}）</h4>
        <div v-if="waitlistData.active.length" class="waitlist-queue">
          <div v-for="item in waitlistData.active" :key="item.regNo" class="waitlist-item" :class="{ mine: item.isMine }">
            <div class="wl-rank" :class="{ top: item.rank === 1 }">{{ item.rank }}</div>
            <div class="wl-info">
              <div class="wl-name">
                {{ item.name }}
                <span v-if="item.isMine" class="wl-tag">我</span>
                <span v-if="item.rank === 1" class="wl-tag next">下一位递补</span>
              </div>
              <div class="wl-meta">{{ item.displayPhone }} · {{ formatTime(item.createdAt) }} 报名</div>
            </div>
          </div>
        </div>
        <div v-else class="waitlist-empty">当前没有候补选手</div>

        <!-- 已递补结果 -->
        <template v-if="waitlistData.promoted.length">
          <h4 class="waitlist-section-title">已递补名额（{{ waitlistData.promoted.length }}）</h4>
          <div class="promoted-list">
            <div v-for="item in waitlistData.promoted" :key="item.regNo" class="promoted-item" :class="{ mine: item.isMine }">
              <span class="pm-name">{{ item.name }}<span v-if="item.isMine" class="wl-tag">我</span></span>
              <span class="pm-result">已获参赛号 <b>#{{ item.playerNo }}</b></span>
            </div>
          </div>
        </template>

        <!-- 操作区 -->
        <div class="waitlist-actions">
          <button class="wl-btn ghost" :disabled="vacancyLoading || waitlistData.active.length === 0" @click="simulateVacancy">
            {{ vacancyLoading ? '处理中...' : '🔄 模拟释放名额（演示）' }}
          </button>
          <button v-if="waitlistData.myReg?.status === 'waitlisted'" class="wl-btn danger" @click="requestCancel">
            取消候补
          </button>
          <button v-else-if="waitlistData.myReg?.status === 'confirmed'" class="wl-btn danger" @click="requestCancel">
            取消报名
          </button>
        </div>
      </div>
    </Modal>

    <!-- Cancel Confirm Modal -->
    <Modal
v-model="showCancelModal" icon="warning" icon-type="warning" title="确认取消"
      :subtitle="cancelTarget?.status === 'waitlisted' ? '取消候补后，您的位置将让给后续候补者' : '取消报名后参赛号将回收，名额按候补顺序递补'"
      size="small" confirm-text="确认取消" confirm-type="danger" :loading="cancelLoading" @confirm="confirmCancel">
      <div class="cancel-info">
        <p>赛事：{{ currentComp?.name }}</p>
        <p v-if="cancelTarget?.status === 'waitlisted'">当前候补名次：第 {{ cancelTarget?.rank }} 位</p>
        <p v-else>参赛号：#{{ cancelTarget?.playerNo }}</p>
      </div>
    </Modal>

    <!-- Live Modal（保持不变） -->
    <Modal v-model="showLiveModal" title="比赛直播" size="large" :show-footer="false">
      <div v-if="currentComp" class="live-content">
        <div class="live-player">
          <div class="live-placeholder">
            <div class="live-icon">📺</div>
            <p>直播信号加载中...</p>
          </div>
        </div>
        <div class="live-info">
          <h3>{{ currentComp.name }}</h3>
          <div class="live-stats">
            <div class="stat"><span class="value">{{ currentComp.participants }}</span><span class="label">参赛选手</span></div>
            <div class="stat"><span class="value">¥{{ formatNumber(currentComp.prize) }}</span><span class="label">奖金池</span></div>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Result Modal（赛果，保持不变） -->
    <Modal v-model="showMatchResultModal" title="比赛结果" size="medium" :show-footer="false">
      <div v-if="currentComp" class="result-content">
        <div class="result-header">
          <h3>{{ currentComp.name }}</h3>
          <p>{{ currentComp.date }} · {{ currentComp.location }}</p>
        </div>
        <div class="result-podium">
          <div class="podium-item second"><div class="rank">🥈</div><div class="name">李四</div><div class="prize">¥{{ Math.floor(currentComp.prize * 0.3) }}</div></div>
          <div class="podium-item first"><div class="rank">🥇</div><div class="name">张三</div><div class="prize">¥{{ Math.floor(currentComp.prize * 0.5) }}</div></div>
          <div class="podium-item third"><div class="rank">🥉</div><div class="name">王五</div><div class="prize">¥{{ Math.floor(currentComp.prize * 0.2) }}</div></div>
        </div>
      </div>
    </Modal>

    <Toast v-model="showToast" :type="toastType" :title="toastTitle" :message="toastMessage" />

    <LoginModal v-model="showLoginModal" @success="onLoginSuccess" />
  </div>
</template>

<script>
import Modal from '../components/Modal.vue'
import Toast from '../components/Toast.vue'
import LoginModal from '../components/LoginModal.vue'
import { isAuthenticated, getCurrentUser } from '../utils/auth'
import { competitionStore } from '../utils/competitionStore'

export default {
  name: 'Competitions',
  components: { Modal, Toast, LoginModal },
  data() {
    return {
      activeTab: 'upcoming',
      competitions: [],
      // 当前用户在各赛事的有效报名记录：{ [compId]: registration | null }
      myRegs: {},
      showJoinModal: false,
      showRegResultModal: false,
      showDetailModal: false,
      showWaitlistModal: false,
      showCancelModal: false,
      showLiveModal: false,
      showMatchResultModal: false,
      joinLoading: false,
      cancelLoading: false,
      vacancyLoading: false,
      selectedCompId: null,
      joinForm: { name: '', phone: '', note: '' },
      joinFormError: '',
      lastOutcome: 'confirmed',
      lastRegistration: null,
      detailReg: null,
      waitlistData: { active: [], promoted: [], cancelled: [], myReg: null, competition: null },
      cancelTarget: null,
      showToast: false,
      toastType: 'success',
      toastTitle: '',
      toastMessage: '',
      showLoginModal: false,
      pendingComp: null,
      tabs: [
        { id: 'upcoming', name: '即将开始', icon: '📅' },
        { id: 'ongoing', name: '进行中', icon: '🔴' },
        { id: 'finished', name: '已结束', icon: '✅' }
      ],
      statusText: { upcoming: '即将开始', ongoing: '进行中', finished: '已结束' }
    }
  },
  computed: {
    filteredCompetitions() { return this.competitions.filter(c => c.status === this.activeTab) },
    currentComp() {
      return this.competitions.find(c => c.id === this.selectedCompId) || null
    }
  },
  mounted() {
    this.refreshData()
    this.handleRouteQuery()
  },
  methods: {
    /** 每次从存储重新计算，保证返回赛事页后名额/参赛号/候补与底层数据一致 */
    refreshData() {
      this.competitions = competitionStore.getCompetitions()
      const regs = {}
      if (isAuthenticated()) {
        this.competitions.forEach(c => {
          regs[c.id] = competitionStore.getMyRegistration(c.id)
        })
      }
      this.myRegs = regs
    },
    handleRouteQuery() {
      const id = Number(this.$route.query.competitionId)
      if (!id) return
      const comp = this.competitions.find(c => c.id === id)
      if (!comp) return
      this.activeTab = comp.status
      if (comp.status !== 'upcoming') return
      this.selectedCompId = comp.id
      const myReg = this.myRegs[id]
      if (myReg?.status === 'waitlisted') this.openWaitlist(comp)
      else if (myReg?.status === 'confirmed') this.openDetail(myReg)
      else if (isAuthenticated()) this.openJoin(comp)
      else {
        // 未登录：先登录，登录后自动打开报名
        this.pendingComp = comp
        this.showLoginModal = true
      }
    },
    getCount(status) { return this.competitions.filter(c => c.status === status).length },
    getMonth(date) { return ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'][new Date(date).getMonth()] },
    getDay(date) { return new Date(date).getDate() },
    formatNumber(num) { return num.toLocaleString() },
    formatTime(ts) { return competitionStore.formatTime(ts) },
    getActionText(comp) {
      if (comp.status === 'ongoing') return '观看直播'
      if (comp.status === 'finished') return '查看结果'
      const reg = this.myRegs[comp.id]
      if (reg?.status === 'waitlisted') return `候补第 ${reg.rank} 位`
      if (reg?.status === 'confirmed') return '报名详情'
      return comp.isFull ? '进入候补' : '立即报名'
    },
    getActionClass(comp) {
      if (comp.status !== 'upcoming') return comp.status
      const reg = this.myRegs[comp.id]
      if (reg?.status === 'waitlisted') return 'waiting'
      if (reg?.status === 'confirmed') return 'joined'
      return comp.isFull ? 'full' : 'upcoming'
    },
    handleAction(comp) {
      this.selectedCompId = comp.id
      if (comp.status === 'ongoing') { this.showLiveModal = true; return }
      if (comp.status === 'finished') { this.showMatchResultModal = true; return }

      // 报名相关操作需要登录
      if (!isAuthenticated()) {
        this.pendingComp = comp
        this.showLoginModal = true
        return
      }
      const reg = this.myRegs[comp.id]
      if (reg?.status === 'waitlisted') this.openWaitlist(comp)
      else if (reg?.status === 'confirmed') this.openDetail(reg)
      else this.openJoin(comp)
    },
    openJoin(comp) {
      this.selectedCompId = comp.id
      const user = getCurrentUser()
      this.joinForm = { name: user?.name || '', phone: '', note: '' }
      this.joinFormError = ''
      this.showJoinModal = true
    },
    openDetail(reg) {
      this.detailReg = reg
      this.showDetailModal = true
    },
    openWaitlist(comp) {
      this.selectedCompId = comp.id
      this.loadWaitlist()
      this.showWaitlistModal = true
    },
    loadWaitlist() {
      this.waitlistData = competitionStore.getWaitlistView(this.selectedCompId)
    },
    onLoginSuccess() {
      this.showLoginModal = false
      this.refreshData()
      if (this.pendingComp) {
        const comp = this.pendingComp
        this.pendingComp = null
        // 登录后重新核对：可能已有报名，也可能名额已变化
        const reg = this.myRegs[comp.id]
        if (reg?.status === 'waitlisted') this.openWaitlist(comp)
        else if (reg?.status === 'confirmed') this.openDetail(reg)
        else this.openJoin(comp)
      }
    },
    async confirmJoin() {
      this.joinFormError = ''
      if (!this.joinForm.name || !this.joinForm.phone) {
        this.joinFormError = '请填写姓名和手机号后再提交'
        return
      }
      this.joinLoading = true
      // 保留模拟网络耗时
      await new Promise(resolve => setTimeout(resolve, 800))
      const result = competitionStore.register(this.selectedCompId, this.joinForm)
      this.joinLoading = false

      if (result.success) {
        this.showJoinModal = false
        this.refreshData()
        const reg = competitionStore.getMyRegistration(this.selectedCompId)
        this.lastRegistration = reg
        this.lastOutcome = reg.status === 'waitlisted' ? 'waitlisted' : 'confirmed'
        this.showRegResultModal = true
        if (reg.status === 'waitlisted') {
          this.showNotification('info', '已进入候补', `您在候补队列中排第 ${reg.rank} 位，名额空出时将自动递补`)
        } else {
          this.showNotification('success', '报名成功', `参赛号 #${reg.playerNo}`)
        }
        return
      }

      // 错误分支：名额、参赛号与展示不得错配，全部以 store 返回为准
      if (result.code === 'UNAUTHENTICATED') {
        this.showJoinModal = false
        this.pendingComp = this.currentComp
        this.showLoginModal = true
        this.showNotification('warning', '登录已失效', '请重新登录后继续报名')
      } else if (result.code === 'DUPLICATE') {
        this.showJoinModal = false
        this.refreshData()
        const reg = result.registration
        this.showNotification('info', '请勿重复报名', result.message)
        if (reg?.status === 'waitlisted') this.openWaitlist(this.currentComp)
        else if (reg) this.openDetail(competitionStore.getMyRegistration(this.selectedCompId))
      } else {
        this.joinFormError = result.message || '报名失败，请稍后重试'
      }
    },
    /** 报名结果弹窗：查看候补名次 / 查看详情 */
    viewResultOutcome() {
      const reg = this.lastRegistration
      if (!reg) { this.showRegResultModal = false; return }
      this.showRegResultModal = false
      this.selectedCompId = reg.competitionId
      if (reg.status === 'waitlisted') {
        this.loadWaitlist()
        this.showWaitlistModal = true
      } else {
        this.detailReg = reg
        this.showDetailModal = true
      }
    },
    requestCancelFromDetail() {
      const reg = this.myRegs[this.selectedCompId]
      if (!reg) { this.showDetailModal = false; return }
      this.cancelTarget = reg
      this.showCancelModal = true
    },
    requestCancel() {
      const reg = this.waitlistData.myReg || this.myRegs[this.selectedCompId]
      if (!reg) return
      this.cancelTarget = reg
      this.showCancelModal = true
    },
    async confirmCancel() {
      if (!this.cancelTarget) return
      this.cancelLoading = true
      await new Promise(resolve => setTimeout(resolve, 600))
      // 提交时再次校验登录状态
      if (!isAuthenticated()) {
        this.cancelLoading = false
        this.showCancelModal = false
        this.showWaitlistModal = false
        this.showDetailModal = false
        this.pendingComp = this.currentComp
        this.showLoginModal = true
        this.showNotification('warning', '登录已失效', '请重新登录后再操作')
        return
      }
      const result = competitionStore.cancelByRegNo(this.cancelTarget.regNo)
      this.cancelLoading = false
      this.showCancelModal = false

      if (!result.success) {
        if (result.code === 'UNAUTHENTICATED') {
          this.showWaitlistModal = false
          this.showDetailModal = false
          this.pendingComp = this.currentComp
          this.showLoginModal = true
          this.showNotification('warning', '登录已失效', '请重新登录后再操作')
        } else {
          this.showNotification('error', '操作失败', result.message || '请稍后重试')
        }
        return
      }

      const wasWaitlist = this.cancelTarget.status === 'waitlisted'
      this.cancelTarget = null
      this.showDetailModal = false
      this.showWaitlistModal = false
      this.refreshData()

      if (wasWaitlist) {
        this.showNotification('success', '已取消候补', '候补位置已释放，后续名次自动前移')
      } else {
        const promoted = result.promoted
        this.showNotification(
          'success',
          '报名已取消',
          promoted
            ? `参赛号已回收，候补选手 ${promoted.name} 已递补（参赛号 #${promoted.playerNo}）`
            : '参赛号已回收'
        )
      }
    },
    async simulateVacancy() {
      this.vacancyLoading = true
      await new Promise(resolve => setTimeout(resolve, 600))
      const result = competitionStore.simulateVacancy(this.selectedCompId)
      this.vacancyLoading = false
      if (!result.success) {
        this.showNotification('warning', '无法释放名额', result.message || '请稍后重试')
        return
      }
      this.refreshData()
      this.loadWaitlist()
      const mine = this.myRegs[this.selectedCompId]
      if (mine?.status === 'confirmed' && result.promoted?.regNo === mine.regNo) {
        this.showNotification('success', '恭喜，候补转正！', `您已获得参赛号 #${mine.playerNo}`)
      } else if (result.promoted) {
        this.showNotification('info', '名额已释放', `候补第 1 位 ${result.promoted.name} 已递补（参赛号 #${result.promoted.playerNo}）`)
      }
    },
    showNotification(type, title, message) {
      this.toastType = type
      this.toastTitle = title
      this.toastMessage = message
      this.showToast = true
    }
  }
}
</script>

<style scoped>
.competitions-page { max-width: 1200px; margin: 0 auto; padding: 0 3rem 4rem; }
.page-header { text-align: center; padding: 2rem 0 4rem; }
.page-tag { display: inline-block; background: rgba(0, 217, 165, 0.1); color: var(--primary); padding: 0.5rem 1rem; border-radius: 50px; font-size: 0.85rem; font-weight: 500; margin-bottom: 1rem; }
.page-header h1 { font-family: 'Space Grotesk', sans-serif; font-size: 3rem; font-weight: 700; margin-bottom: 0.75rem; }
.page-header p { color: var(--text-secondary); font-size: 1.1rem; }
.tabs-container { margin-bottom: 2.5rem; }
.tabs { display: flex; background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; padding: 0.5rem; gap: 0.5rem; }
.tabs button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.6rem; background: transparent; border: none; padding: 1rem 1.5rem; color: var(--text-secondary); font-size: 0.95rem; font-weight: 500; border-radius: 12px; cursor: pointer; transition: all 0.3s; }
.tabs button:hover { color: var(--text-primary); background: rgba(255, 255, 255, 0.03); }
.tabs button.active { background: var(--primary); color: var(--bg-dark); }
.tab-icon { font-size: 1.1rem; }
.tab-count { background: rgba(255, 255, 255, 0.15); padding: 0.2rem 0.6rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
.tabs button.active .tab-count { background: rgba(0, 0, 0, 0.2); }
.competitions-list { display: flex; flex-direction: column; gap: 1rem; }
.competition-card { display: flex; align-items: stretch; background: var(--bg-card); border: 1px solid var(--border); border-radius: 20px; overflow: hidden; transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); position: relative; }
.competition-card:hover { transform: translateX(8px); border-color: rgba(255, 255, 255, 0.15); }
.competition-card.upcoming:hover { border-color: var(--primary); box-shadow: var(--shadow-glow); }
.card-left { padding: 1.5rem; display: flex; align-items: center; border-right: 1px solid var(--border); }
.date-block { display: flex; flex-direction: column; align-items: center; min-width: 60px; }
.date-block .month { font-size: 0.75rem; color: var(--primary); font-weight: 600; text-transform: uppercase; }
.date-block .day { font-family: 'Space Grotesk', sans-serif; font-size: 2rem; font-weight: 700; line-height: 1; }
.card-main { flex: 1; padding: 1.5rem; }
.card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
.status-badge { display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; }
.status-badge.upcoming { background: rgba(0, 217, 165, 0.15); color: var(--primary); }
.status-badge.ongoing { background: rgba(255, 193, 7, 0.15); color: #ffc107; }
.status-badge.finished { background: rgba(108, 117, 125, 0.15); color: #6c757d; }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.status-badge.ongoing .status-dot { animation: blink 1.5s infinite; }
@keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
.comp-type { font-size: 0.75rem; color: var(--text-muted); padding: 0.3rem 0.6rem; background: rgba(255, 255, 255, 0.05); border-radius: 6px; }
.my-badge { font-size: 0.75rem; font-weight: 600; padding: 0.3rem 0.6rem; border-radius: 6px; }
.my-badge.waiting { background: rgba(79, 172, 254, 0.15); color: #4facfe; }
.my-badge.joined { background: rgba(0, 217, 165, 0.15); color: var(--primary); }
.card-main h3 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem; }
.comp-details { display: flex; gap: 1.5rem; flex-wrap: wrap; }
.detail { display: flex; align-items: center; gap: 0.4rem; color: var(--text-secondary); font-size: 0.85rem; }
.detail svg { width: 16px; height: 16px; opacity: 0.7; }
.detail.wait-tag { color: #4facfe; }
.card-right { padding: 1.5rem; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 0.5rem; min-width: 180px; border-left: 1px solid var(--border); }
.prize-info, .fee-info { text-align: right; }
.prize-label, .fee-label { display: block; font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.prize-amount { font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; font-weight: 700; color: var(--primary); }
.fee-amount { font-size: 0.9rem; color: var(--text-secondary); }
.btn-action { display: flex; align-items: center; gap: 0.5rem; border: none; padding: 0.7rem 1.25rem; font-size: 0.85rem; font-weight: 600; border-radius: 10px; cursor: pointer; transition: all 0.3s; margin-top: 0.5rem; white-space: nowrap; }
.btn-action.upcoming { background: var(--gradient-1); color: var(--bg-dark); }
.btn-action.full { background: rgba(79, 172, 254, 0.15); color: #4facfe; border: 1px solid rgba(79, 172, 254, 0.4); }
.btn-action.waiting { background: rgba(79, 172, 254, 0.15); color: #4facfe; border: 1px solid rgba(79, 172, 254, 0.4); }
.btn-action.joined { background: rgba(0, 217, 165, 0.12); color: var(--primary); border: 1px solid rgba(0, 217, 165, 0.35); }
.btn-action.ongoing { background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%); color: var(--bg-dark); }
.btn-action.finished { background: rgba(255, 255, 255, 0.1); color: var(--text-primary); }
.btn-action svg { width: 16px; height: 16px; transition: transform 0.3s; }
.btn-action:hover svg { transform: translateX(3px); }
.btn-action.upcoming:hover { box-shadow: 0 5px 20px var(--primary-glow); }
.progress-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: rgba(255, 255, 255, 0.05); }
.progress { height: 100%; background: var(--gradient-1); border-radius: 0 3px 3px 0; transition: width 0.5s ease; }
.progress.full { background: linear-gradient(135deg, #4facfe 0%, #00b4d8 100%); }
.empty-state { text-align: center; padding: 4rem 2rem; }
.empty-icon { font-size: 4rem; margin-bottom: 1rem; opacity: 0.5; }
.empty-state h3 { font-size: 1.25rem; margin-bottom: 0.5rem; color: var(--text-secondary); }
.empty-state p { color: var(--text-muted); font-size: 0.9rem; }

/* 报名表单 */
.join-form { display: flex; flex-direction: column; gap: 1rem; text-align: left; }
.join-info, .success-info { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 12px; text-align: left; }
.info-row { display: flex; justify-content: space-between; font-size: 0.9rem; gap: 1rem; }
.info-row .label { color: var(--text-secondary); }
.info-row .value { font-weight: 500; text-align: right; }
.info-row .value.warn { color: #4facfe; }
.info-row .value.highlight { color: var(--primary); }
.info-row.total { border-top: 1px solid var(--border); padding-top: 0.75rem; margin-top: 0.25rem; }
.info-row .value.price { font-family: 'Space Grotesk', sans-serif; font-size: 1.25rem; color: var(--primary); }
.form-group { display: flex; flex-direction: column; gap: 0.4rem; }
.form-group label { font-size: 0.85rem; color: var(--text-secondary); }
.form-group label i { color: #ff6b6b; font-style: normal; }
.form-group input, .form-group textarea { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem 1rem; color: var(--text-primary); font-size: 0.9rem; font-family: inherit; resize: vertical; transition: all 0.3s; }
.form-group input:focus, .form-group textarea:focus { outline: none; border-color: var(--primary); background: rgba(0,217,165,0.05); }
.form-group input:disabled, .form-group textarea:disabled { opacity: 0.6; }
.form-error { color: #ff6b6b; font-size: 0.85rem; }
.result-tip { font-size: 0.8rem; color: var(--text-muted); text-align: center; padding-top: 0.25rem; }

/* 候补名次视图 */
.waitlist-view { text-align: left; display: flex; flex-direction: column; gap: 1rem; }
.my-status { border-radius: 14px; padding: 1.1rem 1.25rem; display: flex; flex-direction: column; gap: 0.35rem; }
.my-status.waitlisted { background: rgba(79, 172, 254, 0.12); border: 1px solid rgba(79, 172, 254, 0.35); }
.my-status.confirmed { background: rgba(0, 217, 165, 0.12); border: 1px solid rgba(0, 217, 165, 0.35); }
.my-status-main { display: flex; align-items: center; justify-content: space-between; }
.my-status-label { font-weight: 600; font-size: 0.95rem; }
.my-status.waitlisted .my-status-label { color: #4facfe; }
.my-status.confirmed .my-status-label { color: var(--primary); }
.my-status-rank { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 1.15rem; }
.my-status.waitlisted .my-status-rank { color: #4facfe; }
.my-status.confirmed .my-status-rank { color: var(--primary); }
.my-status-sub { font-size: 0.8rem; color: var(--text-secondary); }
.waitlist-section-title { font-size: 0.85rem; color: var(--text-muted); font-weight: 600; margin-top: 0.25rem; }
.waitlist-queue { display: flex; flex-direction: column; gap: 0.5rem; max-height: 260px; overflow-y: auto; }
.waitlist-item { display: flex; align-items: center; gap: 0.9rem; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 12px; }
.waitlist-item.mine { border-color: rgba(0, 217, 165, 0.5); background: rgba(0, 217, 165, 0.07); }
.wl-rank { width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.9rem; flex-shrink: 0; }
.wl-rank.top { background: linear-gradient(135deg, #4facfe 0%, #00b4d8 100%); color: var(--bg-dark); }
.wl-info { flex: 1; }
.wl-name { font-weight: 600; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem; }
.wl-tag { font-size: 0.7rem; padding: 0.1rem 0.45rem; border-radius: 6px; background: var(--primary); color: var(--bg-dark); font-weight: 700; }
.wl-tag.next { background: rgba(79, 172, 254, 0.2); color: #4facfe; }
.wl-meta { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.15rem; }
.waitlist-empty { padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.88rem; background: rgba(255,255,255,0.02); border: 1px dashed var(--border); border-radius: 12px; }
.promoted-list { display: flex; flex-direction: column; gap: 0.5rem; }
.promoted-item { display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 1rem; background: rgba(0, 217, 165, 0.06); border: 1px solid rgba(0, 217, 165, 0.2); border-radius: 12px; font-size: 0.88rem; }
.promoted-item.mine { border-color: rgba(0, 217, 165, 0.5); }
.pm-name { font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
.pm-result { color: var(--text-secondary); }
.pm-result b { color: var(--primary); }
.waitlist-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--border); }
.wl-btn { padding: 0.65rem 1.1rem; border-radius: 10px; font-size: 0.85rem; font-weight: 600; cursor: pointer; border: 1px solid var(--border); background: transparent; color: var(--text-primary); transition: all 0.3s; }
.wl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.wl-btn.ghost { margin-right: auto; color: var(--text-secondary); }
.wl-btn.ghost:hover:not(:disabled) { border-color: #4facfe; color: #4facfe; }
.wl-btn.danger { background: rgba(255, 107, 107, 0.1); border-color: rgba(255, 107, 107, 0.3); color: #ff6b6b; }
.wl-btn.danger:hover { background: rgba(255, 107, 107, 0.2); }
.cancel-info { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem 1rem; background: rgba(255,255,255,0.03); border-radius: 12px; font-size: 0.9rem; text-align: left; }
.cancel-info p { color: var(--text-secondary); }
/* Modal footer 插槽按钮（Modal 内 scoped 样式不会作用于插槽内容） */
.btn-cancel, .btn-confirm { flex: 1; padding: 14px 24px; font-size: 0.95rem; font-weight: 600; border-radius: 12px; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; justify-content: center; gap: 8px; }
.btn-cancel { background: transparent; border: 1px solid var(--border); color: var(--text-primary); }
.btn-cancel:hover { background: rgba(255, 255, 255, 0.05); border-color: var(--text-muted); }
.btn-confirm.primary { border: none; background: var(--gradient-1); color: var(--bg-dark); }
.btn-confirm.primary:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(0, 217, 165, 0.3); }

.live-content { margin: -20px -24px; }
.live-player { background: #000; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; }
.live-placeholder { text-align: center; color: var(--text-muted); }
.live-icon { font-size: 4rem; margin-bottom: 1rem; }
.live-info { padding: 1.5rem; }
.live-info h3 { font-size: 1.25rem; margin-bottom: 1rem; }
.live-stats { display: flex; gap: 2rem; }
.live-stats .stat { text-align: center; }
.live-stats .value { display: block; font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; font-weight: 700; color: var(--primary); }
.live-stats .label { font-size: 0.8rem; color: var(--text-secondary); }
.result-content { margin: -20px -24px; padding: 1.5rem; }
.result-header { text-align: center; margin-bottom: 2rem; }
.result-header h3 { font-size: 1.25rem; margin-bottom: 0.5rem; }
.result-header p { color: var(--text-secondary); font-size: 0.9rem; }
.result-podium { display: flex; align-items: flex-end; justify-content: center; gap: 1rem; }
.podium-item { text-align: center; padding: 1.5rem; background: rgba(255, 255, 255, 0.03); border-radius: 16px; }
.podium-item.first { order: 2; padding: 2rem 1.5rem; background: rgba(0, 217, 165, 0.1); }
.podium-item.second { order: 1; }
.podium-item.third { order: 3; }
.podium-item .rank { font-size: 2.5rem; margin-bottom: 0.5rem; }
.podium-item.first .rank { font-size: 3rem; }
.podium-item .name { font-weight: 600; margin-bottom: 0.25rem; }
.podium-item .prize { color: var(--primary); font-family: 'Space Grotesk', sans-serif; font-weight: 700; }
@media (max-width: 900px) { .competition-card { flex-direction: column; } .card-left { border-right: none; border-bottom: 1px solid var(--border); padding: 1rem 1.5rem; } .date-block { flex-direction: row; gap: 0.5rem; } .date-block .day { font-size: 1.5rem; } .card-right { border-left: none; border-top: 1px solid var(--border); flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: space-between; } .prize-info, .fee-info { text-align: left; } }
@media (max-width: 600px) { .competitions-page { padding: 0 1.5rem 3rem; } .page-header h1 { font-size: 2rem; } .tabs { flex-direction: column; } .tabs button { justify-content: flex-start; } }
</style>
