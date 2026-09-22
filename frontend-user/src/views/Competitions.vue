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
          </div>
          <h3>{{ comp.name }}</h3>
          <div class="comp-details">
            <div class="detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span>{{ comp.location }}</span>
            </div>
            <div class="detail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <span>{{ statsOf(comp).participants }}/{{ comp.maxParticipants }}人</span>
            </div>
            <div v-if="statsOf(comp).waitlistCount > 0" class="detail waitlist-chip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.5 13.5 17 22l-5-3-5 3 1.5-8.5"/></svg>
              <span>候补 {{ statsOf(comp).waitlistCount }} 人</span>
            </div>
            <div v-if="statsOf(comp).registration?.status === 'waitlisted'" class="detail my-state">
              <span>● 您当前候补第 {{ statsOf(comp).registration.rank }} 位</span>
            </div>
            <div v-else-if="statsOf(comp).registration?.status === 'confirmed'" class="detail my-state confirmed">
              <span>✓ 您已报名 · 参赛号 #{{ statsOf(comp).registration.playerNo }}</span>
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
          <div class="progress" :style="{ width: Math.min(100, statsOf(comp).participants / comp.maxParticipants * 100) + '%' }"></div>
        </div>
      </div>
    </div>

    <div v-if="filteredCompetitions.length === 0" class="empty-state">
      <div class="empty-icon">🏆</div>
      <h3>暂无{{ tabs.find(t => t.id === activeTab)?.name }}赛事</h3>
      <p>请关注其他类型的赛事或稍后再来查看</p>
    </div>

    <!-- Join Modal -->
    <Modal v-model="showJoinModal" icon="🏆" icon-type="info" title="报名参赛" :subtitle="selectedComp?.name" size="small" :confirm-text="joinConfirmText" :confirm-disabled="joinLoading" :loading="joinLoading" @confirm="confirmJoin">
      <div v-if="selectedComp" class="join-info">
        <div class="info-row"><span class="label">比赛日期</span><span class="value">{{ selectedComp.date }}</span></div>
        <div class="info-row"><span class="label">比赛地点</span><span class="value">{{ selectedComp.location }}</span></div>
        <div class="info-row">
          <span class="label">报名情况</span>
          <span class="value" :class="{ full: statsOf(selectedComp).isFull }">
            {{ statsOf(selectedComp).participants }}/{{ selectedComp.maxParticipants }}人
            <template v-if="statsOf(selectedComp).waitlistCount > 0"> · 候补 {{ statsOf(selectedComp).waitlistCount }} 人</template>
          </span>
        </div>
        <div v-if="statsOf(selectedComp).isFull" class="capacity-tip">
          名额已满，提交后将进入候补队列；有名额释放时按候补名次自动递补。
        </div>
        <div class="info-row total"><span class="label">报名费</span><span class="value price">¥{{ selectedComp.fee }}</span></div>
      </div>
      <div class="join-form">
        <p class="form-section-title">补充参赛资料</p>
        <div class="form-field">
          <label>参赛姓名 <em>*</em></label>
          <input v-model="joinForm.name" type="text" maxlength="20" placeholder="请输入真实姓名" :disabled="joinLoading" />
        </div>
        <div class="form-field">
          <label>手机号 <em>*</em></label>
          <input v-model="joinForm.phone" type="tel" maxlength="11" placeholder="用于赛事通知" :disabled="joinLoading" />
        </div>
        <div class="form-field">
          <label>证件号 <em>*</em></label>
          <input v-model="joinForm.idCard" type="text" maxlength="18" placeholder="参赛身份核验" :disabled="joinLoading" />
        </div>
        <div v-if="formError" class="form-error">{{ formError }}</div>
      </div>
    </Modal>

    <!-- Success Modal -->
    <Modal v-model="showSuccessModal" icon="🎉" icon-type="success" title="报名成功" subtitle="祝您比赛取得好成绩" size="small" :show-cancel="false" confirm-text="查看详情" @confirm="viewJoinDetail">
      <div v-if="joinResult" class="success-info">
        <div class="info-row"><span class="label">报名编号</span><span class="value">{{ joinResult.regNo }}</span></div>
        <div class="info-row"><span class="label">比赛</span><span class="value">{{ selectedComp?.name }}</span></div>
        <div class="info-row"><span class="label">参赛号</span><span class="value highlight">#{{ joinResult.playerNo }}</span></div>
      </div>
    </Modal>

    <!-- Registration Detail Modal -->
    <Modal v-model="showDetailModal" icon="🎫" icon-type="success" title="报名详情" :subtitle="selectedComp?.name" size="small" :show-cancel="false" confirm-text="返回赛事页" @confirm="backToCompetitions">
      <div v-if="joinResult" class="success-info">
        <div class="info-row"><span class="label">报名状态</span><span class="value highlight">正式选手</span></div>
        <div class="info-row"><span class="label">报名编号</span><span class="value">{{ joinResult.regNo }}</span></div>
        <div class="info-row"><span class="label">参赛号</span><span class="value highlight">#{{ joinResult.playerNo }}</span></div>
        <div class="info-row"><span class="label">参赛姓名</span><span class="value">{{ joinResult.name }}</span></div>
        <div class="info-row"><span class="label">比赛日期</span><span class="value">{{ selectedComp?.date }}</span></div>
        <div class="info-row total"><span class="label">报名费</span><span class="value price">¥{{ selectedComp?.fee }}</span></div>
      </div>
    </Modal>

    <!-- Waitlist Rank View Modal -->
    <Modal v-model="showWaitlistModal" icon="⏳" icon-type="info" title="候补名次" :subtitle="selectedComp?.name" size="large" :show-footer="false">
      <div v-if="selectedComp" class="waitlist-view">
        <div class="waitlist-summary">
          <div class="summary-item">
            <span class="summary-value">{{ statsOf(selectedComp).participants }}/{{ selectedComp.maxParticipants }}</span>
            <span class="summary-label">已报名 / 名额</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">{{ statsOf(selectedComp).available }}</span>
            <span class="summary-label">剩余名额</span>
          </div>
          <div class="summary-item">
            <span class="summary-value">{{ statsOf(selectedComp).waitlistCount }}</span>
            <span class="summary-label">候补人数</span>
          </div>
        </div>

        <!-- 我的状态 -->
        <div v-if="myWaitlistReg" class="my-banner wait">
          <div class="banner-icon">⏳</div>
          <div class="banner-body">
            <p class="banner-title">您当前候补第 <strong>{{ myWaitlistReg.rank }}</strong> 位</p>
            <p class="banner-desc">名额释放时将按候补名次自动递补，递补成功后在此页面及任务中心通知您</p>
          </div>
        </div>
        <div v-else-if="myPromotedReg" class="my-banner promoted">
          <div class="banner-icon">🎉</div>
          <div class="banner-body">
            <p class="banner-title">恭喜，您已候补转正！参赛号 <strong>#{{ myPromotedReg.playerNo }}</strong></p>
            <p class="banner-desc">报名编号 {{ myPromotedReg.regNo }}，请按比赛日期准时到场</p>
          </div>
        </div>
        <div v-else-if="justCancelled" class="my-banner cancelled">
          <div class="banner-icon">🚪</div>
          <div class="banner-body">
            <p class="banner-title">您已取消候补</p>
            <p class="banner-desc">取消后不再占用候补名次，可重新报名</p>
          </div>
        </div>

        <!-- 候补队列 -->
        <div v-if="waitlistQueue.length > 0" class="queue-section">
          <p class="section-title">候补队列（按报名先后）</p>
          <div class="queue-list">
            <div v-for="item in waitlistQueue" :key="item.id" class="queue-item" :class="{ me: item.isMe }">
              <span class="queue-rank">{{ item.rank }}</span>
              <span class="queue-name">{{ maskName(item.name) }}<em v-if="item.isMe" class="me-tag">我</em></span>
              <span class="queue-phone">{{ maskPhone(item.phone) }}</span>
            </div>
          </div>
        </div>

        <!-- 已递补 -->
        <div v-if="promotedList.length > 0" class="queue-section promoted-section">
          <p class="section-title">已递补为正式选手</p>
          <div class="queue-list">
            <div v-for="item in promotedList" :key="item.id" class="queue-item promoted" :class="{ me: item.isMe }">
              <span class="queue-rank done">✓</span>
              <span class="queue-name">{{ maskName(item.name) }}<em v-if="item.isMe" class="me-tag">我</em></span>
              <span class="queue-phone">参赛号 #{{ item.playerNo }}</span>
            </div>
          </div>
        </div>

        <!-- 操作区 -->
        <div class="waitlist-actions">
          <template v-if="myWaitlistReg">
            <button class="wl-btn danger" :disabled="cancelWaitlistLoading" @click="showCancelWaitlistModal = true">
              <span v-if="cancelWaitlistLoading" class="btn-spinner"></span>取消候补
            </button>
            <button v-if="canSimulate" class="wl-btn default" :disabled="releaseLoading" @click="simulateRelease">
              <span v-if="releaseLoading" class="btn-spinner"></span>模拟名额释放
            </button>
            <button class="wl-btn primary" @click="backToCompetitions">返回赛事页</button>
          </template>
          <template v-else-if="myPromotedReg">
            <button class="wl-btn primary" @click="viewPromotedDetail">查看报名详情</button>
            <button class="wl-btn default" @click="backToCompetitions">返回赛事页</button>
          </template>
          <template v-else-if="justCancelled">
            <button class="wl-btn primary" :disabled="joinLoading" @click="rejoinAfterCancel">
              <span v-if="joinLoading" class="btn-spinner"></span>重新报名
            </button>
            <button class="wl-btn default" @click="backToCompetitions">返回赛事页</button>
          </template>
          <template v-else>
            <button class="wl-btn primary" @click="backToCompetitions">返回赛事页</button>
          </template>
        </div>
      </div>
    </Modal>

    <!-- Cancel Waitlist Confirm Modal -->
    <Modal v-model="showCancelWaitlistModal" icon="warning" icon-type="warning" title="确认取消候补" subtitle="取消后将失去当前候补名次，确定继续吗？" size="small" confirm-text="确认取消候补" confirm-type="danger" :loading="cancelWaitlistLoading" @confirm="confirmCancelWaitlist">
      <div v-if="myWaitlistReg" class="join-info">
        <div class="info-row"><span class="label">赛事</span><span class="value">{{ selectedComp?.name }}</span></div>
        <div class="info-row"><span class="label">当前候补名次</span><span class="value highlight">第 {{ myWaitlistReg.rank }} 位</span></div>
      </div>
    </Modal>

    <!-- Live Modal -->
    <Modal v-model="showLiveModal" title="比赛直播" size="large" :show-footer="false">
      <div v-if="selectedComp" class="live-content">
        <div class="live-player">
          <div class="live-placeholder">
            <div class="live-icon">📺</div>
            <p>直播信号加载中...</p>
          </div>
        </div>
        <div class="live-info">
          <h3>{{ selectedComp.name }}</h3>
          <div class="live-stats">
            <div class="stat"><span class="value">{{ statsOf(selectedComp).participants }}</span><span class="label">参赛选手</span></div>
            <div class="stat"><span class="value">¥{{ formatNumber(selectedComp.prize) }}</span><span class="label">奖金池</span></div>
          </div>
        </div>
      </div>
    </Modal>

    <!-- Result Modal -->
    <Modal v-model="showResultModal" title="比赛结果" size="medium" :show-footer="false">
      <div v-if="selectedComp" class="result-content">
        <div class="result-header">
          <h3>{{ selectedComp.name }}</h3>
          <p>{{ selectedComp.date }} · {{ selectedComp.location }}</p>
        </div>
        <div class="result-podium">
          <div class="podium-item second"><div class="rank">🥈</div><div class="name">李四</div><div class="prize">¥{{ Math.floor(selectedComp.prize * 0.3) }}</div></div>
          <div class="podium-item first"><div class="rank">🥇</div><div class="name">张三</div><div class="prize">¥{{ Math.floor(selectedComp.prize * 0.5) }}</div></div>
          <div class="podium-item third"><div class="rank">🥉</div><div class="name">王五</div><div class="prize">¥{{ Math.floor(selectedComp.prize * 0.2) }}</div></div>
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
import { competitionStore, maskName, maskPhone } from '../utils/competitionStore'

export default {
  name: 'Competitions',
  components: { Modal, Toast, LoginModal },
  data() {
    return {
      activeTab: 'upcoming',
      version: 0,
      showJoinModal: false,
      showSuccessModal: false,
      showDetailModal: false,
      showWaitlistModal: false,
      showCancelWaitlistModal: false,
      showLiveModal: false,
      showResultModal: false,
      joinLoading: false,
      cancelWaitlistLoading: false,
      releaseLoading: false,
      selectedComp: null,
      joinResult: null,
      justCancelled: false,
      joinForm: { name: '', phone: '', idCard: '' },
      lastJoinProfile: null,
      formError: '',
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
      statusText: { upcoming: '即将开始', ongoing: '进行中', finished: '已结束' },
      competitions: [
        { id: 1, name: '2026春季斯诺克公开赛', type: '斯诺克', date: '2026-03-15', location: '主馆A区', prize: 50000, fee: 200, baseParticipants: 28, maxParticipants: 32, status: 'upcoming' },
        { id: 2, name: '周末九球挑战赛', type: '美式九球', date: '2026-02-14', location: '主馆B区', prize: 10000, fee: 100, baseParticipants: 16, maxParticipants: 16, status: 'ongoing' },
        { id: 3, name: '新年中式八球锦标赛', type: '中式八球', date: '2026-01-20', location: '主馆A区', prize: 30000, fee: 150, baseParticipants: 64, maxParticipants: 64, status: 'finished' },
        { id: 4, name: '会员积分争霸赛', type: '综合', date: '2026-04-01', location: '主馆C区', prize: 20000, fee: 50, baseParticipants: 12, maxParticipants: 48, status: 'upcoming' },
        { id: 5, name: '女子台球精英赛', type: '美式九球', date: '2026-03-08', location: '主馆B区', prize: 15000, fee: 80, baseParticipants: 8, maxParticipants: 16, status: 'upcoming' }
      ]
    }
  },
  computed: {
    filteredCompetitions() { return this.competitions.filter(c => c.status === this.activeTab) },
    currentUserId() { return getCurrentUser()?.id || null },
    statsMap() {
      // 依赖 version 与登录用户，报名数据变化后调用 refreshRegistrations 重新计算
      this.version
      const map = {}
      const userId = this.currentUserId
      this.competitions.forEach(comp => {
        map[comp.id] = competitionStore.getStats(comp, userId)
      })
      return map
    },
    waitlistQueue() {
      this.version
      if (!this.selectedComp) return []
      return competitionStore.getWaitlistQueue(this.selectedComp, this.currentUserId)
    },
    promotedList() {
      this.version
      if (!this.selectedComp) return []
      return competitionStore.getPromotedList(this.selectedComp, this.currentUserId)
    },
    myWaitlistReg() {
      return this.waitlistQueue.find(r => r.isMe) || null
    },
    myPromotedReg() {
      return this.promotedList.find(r => r.isMe) || null
    },
    canSimulate() {
      this.version
      return this.selectedComp
        ? competitionStore.canSimulateRelease(this.selectedComp, this.currentUserId)
        : false
    },
    joinConfirmText() {
      if (!this.selectedComp) return '确认报名'
      const stats = this.statsOf(this.selectedComp)
      return stats.isFull ? `加入候补（当前候补 ${stats.waitlistCount} 人）` : '确认报名'
    }
  },
  mounted() {
    competitionStore.ensureSeeded()
    this.refreshRegistrations()
    this.handleEntryQuery()
    window.addEventListener('storage', this.onStorageChange)
  },
  beforeUnmount() {
    window.removeEventListener('storage', this.onStorageChange)
  },
  methods: {
    getCount(status) { return this.competitions.filter(c => c.status === status).length },
    getMonth(date) { return ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'][new Date(date).getMonth()] },
    getDay(date) { return new Date(date).getDate() },
    formatNumber(num) { return num.toLocaleString() },
    maskName,
    maskPhone,
    refreshRegistrations() { this.version++ },
    onStorageChange(e) {
      if (e.key === 'billiard_competition_registrations_v1' || e.key === 'billiard_user_tasks') {
        this.refreshRegistrations()
      }
    },
    statsOf(comp) {
      return this.statsMap[comp.id] || {
        participants: comp.baseParticipants,
        waitlistCount: 0,
        available: comp.maxParticipants - comp.baseParticipants,
        isFull: comp.baseParticipants >= comp.maxParticipants,
        registration: null
      }
    },
    getActionText(comp) {
      if (comp.status === 'ongoing') return '观看直播'
      if (comp.status === 'finished') return '查看结果'
      const reg = this.statsOf(comp).registration
      if (reg?.status === 'waitlisted') return '查看候补名次'
      if (reg?.status === 'confirmed') return '报名详情'
      return this.statsOf(comp).isFull ? '加入候补' : '立即报名'
    },
    getActionClass(comp) {
      if (comp.status !== 'upcoming') return comp.status
      const reg = this.statsOf(comp).registration
      if (reg) return reg.status === 'waitlisted' ? 'waitlist-joined' : 'joined'
      return this.statsOf(comp).isFull ? 'waitlist-btn' : 'upcoming'
    },
    handleEntryQuery() {
      const compId = Number(this.$route.query.competitionId)
      if (!compId) return
      const comp = this.competitions.find(c => c.id === compId)
      if (!comp || comp.status !== 'upcoming') return
      this.selectedComp = comp
      if (!isAuthenticated()) {
        this.pendingComp = comp
        this.showLoginModal = true
        return
      }
      this.openViewByRegistration(comp)
    },
    openViewByRegistration(comp) {
      const reg = competitionStore.getMyRegistration(comp, this.currentUserId)
      if (reg?.status === 'waitlisted') {
        this.justCancelled = false
        this.showWaitlistModal = true
      } else if (reg?.status === 'confirmed') {
        this.joinResult = reg
        this.showDetailModal = true
      } else {
        this.openJoinModal(comp)
      }
    },
    handleAction(comp) {
      this.selectedComp = comp
      if (comp.status === 'upcoming') {
        if (!isAuthenticated()) {
          this.pendingComp = comp
          this.showLoginModal = true
          return
        }
        this.openViewByRegistration(comp)
      }
      else if (comp.status === 'ongoing') this.showLiveModal = true
      else this.showResultModal = true
    },
    openJoinModal(comp) {
      const target = comp || this.selectedComp
      this.selectedComp = target
      const user = getCurrentUser()
      this.joinForm = {
        name: this.lastJoinProfile?.name || user?.name || '',
        phone: this.lastJoinProfile?.phone || (user?.phone && !String(user.phone).includes('*') ? user.phone : ''),
        idCard: this.lastJoinProfile?.idCard || ''
      }
      this.formError = ''
      this.showJoinModal = true
    },
    onLoginSuccess() {
      this.showLoginModal = false
      this.refreshRegistrations()
      if (this.pendingComp) {
        this.selectedComp = this.pendingComp
        this.pendingComp = null
        this.openViewByRegistration(this.selectedComp)
      }
    },
    validateForm() {
      if (!this.joinForm.name.trim()) return '请填写参赛姓名'
      if (!/^1[3-9]\d{9}$/.test(this.joinForm.phone.trim())) return '请输入正确的11位手机号'
      if (!this.joinForm.idCard.trim() || this.joinForm.idCard.trim().length < 6) return '请填写证件号（至少6位）'
      return ''
    },
    async submitRegistration() {
      const comp = this.selectedComp
      const profile = {
        name: this.joinForm.name.trim(),
        phone: this.joinForm.phone.trim(),
        idCard: this.joinForm.idCard.trim()
      }
      await new Promise(resolve => setTimeout(resolve, 900))

      // 异步等待后再次校验登录，防止登录失效后写入数据
      if (!isAuthenticated()) {
        this.handleSessionExpired()
        return
      }

      const result = competitionStore.register(comp, { userId: this.currentUserId, ...profile })

      if (!result.success) {
        if (result.code === 'NOT_AUTHENTICATED') {
          this.handleSessionExpired()
          return
        }
        if (result.code === 'DUPLICATE') {
          this.showJoinModal = false
          this.refreshRegistrations()
          this.showNotification('warning', '请勿重复报名', result.message)
          if (result.registration?.status === 'waitlisted') {
            this.justCancelled = false
            this.showWaitlistModal = true
          } else if (result.registration?.status === 'confirmed') {
            this.joinResult = result.registration
            this.showDetailModal = true
          }
          return
        }
        this.formError = result.message
        return
      }

      this.lastJoinProfile = profile
      this.formError = ''
      this.showJoinModal = false
      this.refreshRegistrations()

      if (result.isWaitlisted) {
        this.justCancelled = false
        this.showNotification('info', '已进入候补名单', `您的候补名次为第 ${result.rank} 位，名额释放后将自动递补`)
        this.showWaitlistModal = true
      } else {
        this.joinResult = result.registration
        this.showSuccessModal = true
        this.showNotification('success', '报名成功', `参赛号 #${result.registration.playerNo}`)
      }
    },
    async confirmJoin() {
      if (this.joinLoading || !this.selectedComp) return
      if (!isAuthenticated()) {
        this.handleSessionExpired()
        return
      }
      const error = this.validateForm()
      if (error) {
        this.formError = error
        return
      }
      this.joinLoading = true
      try {
        await this.submitRegistration()
      } finally {
        this.joinLoading = false
      }
    },
    viewJoinDetail() {
      this.showSuccessModal = false
      this.joinResult = competitionStore.getMyRegistration(this.selectedComp, this.currentUserId)
      this.showDetailModal = true
    },
    async confirmCancelWaitlist() {
      if (this.cancelWaitlistLoading) return
      if (!isAuthenticated()) {
        this.showCancelWaitlistModal = false
        this.handleSessionExpired()
        return
      }
      this.cancelWaitlistLoading = true
      await new Promise(resolve => setTimeout(resolve, 700))
      const result = competitionStore.cancelWaitlist(this.selectedComp, this.currentUserId)
      this.cancelWaitlistLoading = false
      if (!result.success) {
        if (result.code === 'NOT_AUTHENTICATED') {
          this.showCancelWaitlistModal = false
          this.handleSessionExpired()
          return
        }
        this.showNotification('error', '操作失败', result.message)
        return
      }
      this.showCancelWaitlistModal = false
      this.justCancelled = true
      this.refreshRegistrations()
      this.showNotification('success', '已取消候补', '您已退出该赛事候补队列，可随时重新报名')
    },
    async rejoinAfterCancel() {
      if (this.joinLoading) return
      if (!isAuthenticated()) {
        this.handleSessionExpired()
        return
      }
      const profile = this.lastJoinProfile || {
        name: this.joinForm.name?.trim() || getCurrentUser()?.name || '',
        phone: this.joinForm.phone?.trim() || '',
        idCard: this.joinForm.idCard?.trim() || ''
      }
      if (!profile.name || !/^1[3-9]\d{9}$/.test(profile.phone || '') || !profile.idCard) {
        this.justCancelled = false
        this.openJoinModal()
        return
      }
      this.joinLoading = true
      try {
        await new Promise(resolve => setTimeout(resolve, 700))
        if (!isAuthenticated()) {
          this.handleSessionExpired()
          return
        }
        this.joinForm = { name: profile.name, phone: profile.phone, idCard: profile.idCard }
        const result = competitionStore.register(this.selectedComp, { userId: this.currentUserId, ...profile })
        if (!result.success) {
          if (result.code === 'NOT_AUTHENTICATED') {
            this.handleSessionExpired()
            return
          }
          this.showNotification('error', '报名失败', result.message)
          return
        }
        this.lastJoinProfile = profile
        this.justCancelled = false
        this.refreshRegistrations()
        if (result.isWaitlisted) {
          this.showNotification('info', '已重新进入候补', `您的候补名次为第 ${result.rank} 位`)
        } else {
          this.joinResult = result.registration
          this.showDetailModal = true
          this.showNotification('success', '报名成功', `参赛号 #${result.registration.playerNo}`)
        }
      } finally {
        this.joinLoading = false
      }
    },
    async simulateRelease() {
      if (this.releaseLoading || !this.selectedComp) return
      if (!isAuthenticated()) {
        this.handleSessionExpired()
        return
      }
      this.releaseLoading = true
      await new Promise(resolve => setTimeout(resolve, 800))
      const result = competitionStore.simulateRelease(this.selectedComp, this.currentUserId)
      this.releaseLoading = false
      if (!result.success) {
        this.showNotification('warning', '暂时无法释放名额', result.message)
        return
      }
      this.justCancelled = false
      this.refreshRegistrations()
      if (result.myPromoted) {
        this.showNotification('success', '候补已转正', `恭喜！参赛号 #${result.myPromoted.playerNo}`)
      } else {
        this.showNotification('info', '名额已释放', '系统已按候补名次自动递补队首选手')
      }
    },
    viewPromotedDetail() {
      this.joinResult = this.myPromotedReg
      this.showDetailModal = true
    },
    async backToCompetitions() {
      // 先清理路由参数，避免组件重新挂载时再次打开原报名/候补视图
      if (this.$route.query.competitionId) {
        await this.$router.replace({ path: '/competitions' })
      }
      this.showWaitlistModal = false
      this.showDetailModal = false
      this.showSuccessModal = false
      this.showJoinModal = false
      this.justCancelled = false
      this.activeTab = 'upcoming'
      this.selectedComp = null
      this.joinResult = null
      window.scrollTo({ top: 0, behavior: 'smooth' })
      this.showNotification('info', '已返回赛事页', '可继续浏览其他赛事')
    },
    handleSessionExpired() {
      this.joinLoading = false
      this.cancelWaitlistLoading = false
      this.releaseLoading = false
      this.showJoinModal = false
      this.showCancelWaitlistModal = false
      this.pendingComp = this.selectedComp
      this.refreshRegistrations()
      this.showNotification('warning', '登录已失效', '请重新登录后再继续报名操作')
      this.showLoginModal = true
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
.card-main h3 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.75rem; }
.comp-details { display: flex; gap: 1.5rem; flex-wrap: wrap; }
.detail { display: flex; align-items: center; gap: 0.4rem; color: var(--text-secondary); font-size: 0.85rem; }
.detail svg { width: 16px; height: 16px; opacity: 0.7; }
.waitlist-chip { color: #ffc107; }
.detail.my-state { color: var(--primary); font-weight: 600; }
.detail.my-state.confirmed { color: var(--primary); }
.card-right { padding: 1.5rem; display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 0.5rem; min-width: 180px; border-left: 1px solid var(--border); }
.prize-info, .fee-info { text-align: right; }
.prize-label, .fee-label { display: block; font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
.prize-amount { font-family: 'Space Grotesk', sans-serif; font-size: 1.5rem; font-weight: 700; color: var(--primary); }
.fee-amount { font-size: 0.9rem; color: var(--text-secondary); }
.btn-action { display: flex; align-items: center; gap: 0.5rem; border: none; padding: 0.7rem 1.25rem; font-size: 0.85rem; font-weight: 600; border-radius: 10px; cursor: pointer; transition: all 0.3s; margin-top: 0.5rem; }
.btn-action.upcoming { background: var(--gradient-1); color: var(--bg-dark); }
.btn-action.waitlist-btn { background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%); color: var(--bg-dark); }
.btn-action.waitlist-joined { background: rgba(255, 193, 7, 0.15); color: #ffc107; border: 1px solid rgba(255, 193, 7, 0.4); }
.btn-action.joined { background: rgba(0, 217, 165, 0.12); color: var(--primary); border: 1px solid rgba(0, 217, 165, 0.35); }
.btn-action.ongoing { background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%); color: var(--bg-dark); }
.btn-action.finished { background: rgba(255, 255, 255, 0.1); color: var(--text-primary); }
.btn-action svg { width: 16px; height: 16px; transition: transform 0.3s; }
.btn-action:hover svg { transform: translateX(3px); }
.btn-action.upcoming:hover { box-shadow: 0 5px 20px var(--primary-glow); }
.progress-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; background: rgba(255, 255, 255, 0.05); }
.progress { height: 100%; background: var(--gradient-1); border-radius: 0 3px 3px 0; transition: width 0.5s ease; }
.empty-state { text-align: center; padding: 4rem 2rem; }
.empty-icon { font-size: 4rem; margin-bottom: 1rem; opacity: 0.5; }
.empty-state h3 { font-size: 1.25rem; margin-bottom: 0.5rem; color: var(--text-secondary); }
.empty-state p { color: var(--text-muted); font-size: 0.9rem; }
.join-info, .success-info { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; background: rgba(255, 255, 255, 0.03); border-radius: 12px; text-align: left; }
.info-row { display: flex; justify-content: space-between; font-size: 0.9rem; gap: 1rem; }
.info-row .label { color: var(--text-secondary); flex-shrink: 0; }
.info-row .value { font-weight: 500; text-align: right; }
.info-row .value.highlight { color: var(--primary); }
.info-row .value.full { color: #ffc107; }
.capacity-tip { background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.25); color: #ffc107; font-size: 0.8rem; padding: 0.6rem 0.75rem; border-radius: 8px; line-height: 1.5; }
.info-row.total { border-top: 1px solid var(--border); padding-top: 0.75rem; margin-top: 0.25rem; }
.info-row .value.price { font-family: 'Space Grotesk', sans-serif; font-size: 1.25rem; color: var(--primary); }
.join-form { margin-top: 1.25rem; text-align: left; display: flex; flex-direction: column; gap: 0.9rem; }
.form-section-title { font-size: 0.9rem; font-weight: 600; color: var(--text-primary); }
.form-field { display: flex; flex-direction: column; gap: 0.35rem; }
.form-field label { font-size: 0.8rem; color: var(--text-secondary); }
.form-field label em { color: #ff6b6b; font-style: normal; }
.form-field input { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem 0.9rem; color: var(--text-primary); font-size: 0.9rem; transition: all 0.3s; }
.form-field input:focus { outline: none; border-color: var(--primary); background: rgba(0,217,165,0.05); }
.form-field input:disabled { opacity: 0.6; }
.form-error { background: rgba(255,107,107,0.1); border: 1px solid rgba(255,107,107,0.25); color: #ff6b6b; font-size: 0.8rem; padding: 0.55rem 0.75rem; border-radius: 8px; }

/* Waitlist view */
.waitlist-view { display: flex; flex-direction: column; gap: 1.25rem; margin: -4px 0; text-align: left; }
.waitlist-summary { display: flex; gap: 0.75rem; }
.summary-item { flex: 1; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; text-align: center; display: flex; flex-direction: column; gap: 0.25rem; }
.summary-value { font-family: 'Space Grotesk', sans-serif; font-size: 1.4rem; font-weight: 700; color: var(--primary); }
.summary-label { font-size: 0.75rem; color: var(--text-secondary); }
.my-banner { display: flex; gap: 0.9rem; align-items: center; padding: 1rem 1.1rem; border-radius: 14px; }
.my-banner.wait { background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); }
.my-banner.promoted { background: rgba(0, 217, 165, 0.1); border: 1px solid rgba(0, 217, 165, 0.3); }
.my-banner.cancelled { background: rgba(108, 117, 125, 0.12); border: 1px solid rgba(108, 117, 125, 0.3); }
.banner-icon { font-size: 1.8rem; }
.banner-title { font-size: 0.95rem; font-weight: 600; }
.banner-title strong { color: var(--primary); }
.my-banner.wait .banner-title strong { color: #ffc107; }
.banner-desc { font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.2rem; }
.queue-section { display: flex; flex-direction: column; gap: 0.6rem; }
.section-title { font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); }
.queue-list { display: flex; flex-direction: column; gap: 0.5rem; max-height: 220px; overflow-y: auto; padding-right: 4px; }
.queue-item { display: flex; align-items: center; gap: 0.9rem; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 10px; padding: 0.7rem 1rem; font-size: 0.88rem; }
.queue-item.me { border-color: rgba(255, 193, 7, 0.5); background: rgba(255, 193, 7, 0.08); }
.queue-item.promoted { opacity: 0.85; }
.queue-rank { width: 26px; height: 26px; border-radius: 50%; background: rgba(255,193,7,0.15); color: #ffc107; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem; flex-shrink: 0; }
.queue-rank.done { background: rgba(0, 217, 165, 0.15); color: var(--primary); }
.queue-name { font-weight: 600; display: flex; align-items: center; gap: 0.4rem; min-width: 90px; }
.me-tag { font-style: normal; font-size: 0.68rem; background: var(--primary); color: var(--bg-dark); padding: 0.05rem 0.4rem; border-radius: 6px; font-weight: 700; }
.queue-phone { color: var(--text-secondary); font-size: 0.82rem; margin-left: auto; }
.promoted-section .queue-phone { color: var(--primary); }
.waitlist-actions { display: flex; gap: 0.75rem; justify-content: flex-end; flex-wrap: wrap; padding-top: 1rem; border-top: 1px solid var(--border); }
.wl-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; padding: 0.7rem 1.3rem; border-radius: 10px; font-size: 0.88rem; font-weight: 600; cursor: pointer; transition: all 0.3s; border: 1px solid transparent; }
.wl-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.wl-btn.primary { background: var(--gradient-1); color: var(--bg-dark); border: none; }
.wl-btn.primary:hover:not(:disabled) { box-shadow: 0 5px 20px var(--primary-glow); }
.wl-btn.default { background: rgba(255,255,255,0.05); border-color: var(--border); color: var(--text-primary); }
.wl-btn.default:hover:not(:disabled) { border-color: var(--text-muted); }
.wl-btn.danger { background: rgba(255,107,107,0.1); border-color: rgba(255,107,107,0.3); color: #ff6b6b; }
.wl-btn.danger:hover:not(:disabled) { background: rgba(255,107,107,0.2); }
.btn-spinner { width: 15px; height: 15px; border: 2px solid transparent; border-top-color: currentColor; border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

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
@media (max-width: 600px) { .competitions-page { padding: 0 1.5rem 3rem; } .page-header h1 { font-size: 2rem; } .tabs { flex-direction: column; } .tabs button { justify-content: flex-start; } .waitlist-summary { flex-direction: column; } }
</style>
