/**
 * MoneyTrack Application Configuration
 * Centralized version, stage, and application metadata
 */
const APP_CONFIG = {
  name: "MoneyTrack",
  version: "0.8.6",
  stage: "Beta"
};

/**
 * MoneyTrack Application Singleton
 * 100% Offline Single Page Application Engine connected to local Flask & SQLite backend.
 */
const MoneyTrackApp = {
  config: APP_CONFIG,
  currentUserProfileId: parseInt(localStorage.getItem('moneytrack_active_user_id') || '0', 10),
  usersList: [],
  selectedAuthUser: null,
  deleteCountdownTimer: null,
  deleteTargetUserId: null,

  escapeHtml: function(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  getGreeting: function() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return "Good morning";
    } else if (hour >= 12 && hour < 17) {
      return "Good afternoon";
    } else if (hour >= 17 && hour < 22) {
      return "Good evening";
    } else {
      return "Good night";
    }
  },

  hideStartupLoader: function() {
    const loader = document.getElementById('startup-loader');
    if (loader && !loader.classList.contains('hidden')) {
      loader.classList.add('opacity-0', 'pointer-events-none');
      setTimeout(() => {
        loader.classList.add('hidden');
      }, 300);
    }
  },

  showInAppLoader: function() {
    const bar = document.getElementById('in-app-loader');
    if (bar) bar.classList.remove('hidden');
  },

  hideInAppLoader: function() {
    const bar = document.getElementById('in-app-loader');
    if (bar) {
      setTimeout(() => {
        bar.classList.add('hidden');
      }, 150);
    }
  },

  state: {
    theme: 'dark',
    user: { name: 'Alex Taylor', currency: '₹' },
    currentTab: 'dashboard',
    transactionsFilter: 'all',
    accounts: [],
    accountTypes: {},
    transactions: [],
    goals: [],
    calendarEvents: [],
    achievements: [],
    lessons: [],
    activeQuiz: null,
    quizState: { lessonId: null, currentQ: 0, score: 0, questions: [] },
    selectedDashboardAccountId: null,
    accountSummaries: [],
    activeDashboardData: null,
    diagnosticsData: null,
    alertsData: [],
    dismissedAlertIds: new Set(),
    activeNotifTab: 'alerts',
    calendarState: {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      selectedDate: null,
      accountId: 'ALL',
      txType: 'all',
      data: null
    },
    analyticsState: {
      accountId: 'ALL',
      monthYear: null,
      trendMode: 'income',
      data: null,
      lineChart: null,
      categoryChart: null
    },
    calcCharts: {
      emi: null,
      ci: null,
      sip: null
    },
    lastEmiData: null,
    lastCiData: null,
    lastSipData: null
  },

  renderAppVersionInfo: function() {
    const formattedVersion = APP_CONFIG.version.startsWith('v')
      ? APP_CONFIG.version
      : `v${APP_CONFIG.version}`;

    document.querySelectorAll('.app-name-display').forEach(el => {
      el.textContent = APP_CONFIG.name;
    });

    document.querySelectorAll('.app-version-display').forEach(el => {
      el.textContent = formattedVersion;
    });

    document.querySelectorAll('.app-stage-display').forEach(el => {
      el.textContent = APP_CONFIG.stage;
    });
  },

  init: function() {
    try {
      // Safety fallback: ensure startup loader is dismissed even under slow resource load
      setTimeout(() => {
        this.hideStartupLoader();
      }, 3000);

      // Intercept fetch to automatically append active profile ID
      const originalFetch = window.fetch;
      const appSelf = this;
      window.fetch = function(url, options = {}) {
        if (typeof url === 'string' && url.startsWith('/api/')) {
          options = options || {};
          options.headers = options.headers || {};
          if (options.headers instanceof Headers) {
            if (appSelf.currentUserProfileId) {
              options.headers.set('X-Profile-ID', String(appSelf.currentUserProfileId));
            }
          } else {
            if (appSelf.currentUserProfileId) {
              options.headers['X-Profile-ID'] = String(appSelf.currentUserProfileId);
            }
          }
        }
        return originalFetch(url, options);
      };

      this.renderAppVersionInfo();
      this.initTheme();
      this.initCalculators();
      this.initCalendar();
      this.initAnalytics();

      // Tab visibility handling for real-time background notifications
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          document.title = 'MoneyTrack - Smart Financial Literacy and Budget Planner for Public';
        }
      });

      this.checkAuthState();
    } catch (err) {
      console.error("Critical error during MoneyTrackApp.init:", err);
      this.hideStartupLoader();
    }
  },

  // --- Authentication & User Session Management ---
  checkAuthState: function() {
    fetch('/api/auth/users')
      .then(r => r.json())
      .then(data => {
        this.usersList = data.users || [];
        const savedUserId = parseInt(localStorage.getItem('moneytrack_active_user_id') || '0', 10);
        const activeUser = this.usersList.find(u => u.id === savedUserId);

        const authScreen = document.getElementById('auth-screen');
        const mainShell = document.getElementById('main-app-shell');

        if (activeUser) {
          this.currentUserProfileId = activeUser.id;
          if (authScreen) authScreen.classList.add('hidden');
          if (mainShell) mainShell.classList.remove('hidden');
          this.refreshAllData();
        } else {
          this.currentUserProfileId = 0;
          localStorage.removeItem('moneytrack_active_user_id');
          if (mainShell) mainShell.classList.add('hidden');
          if (authScreen) authScreen.classList.remove('hidden');

          if (this.usersList.length === 0) {
            this.showAuthRegisterView();
          } else {
            this.showAuthUsersView();
          }
        }
        this.hideStartupLoader();
      })
      .catch(err => {
        console.error("Auth initialization failed:", err);
        this.hideStartupLoader();
      });
  },

  showAuthUsersView: function() {
    const usersView = document.getElementById('auth-view-users');
    const passView = document.getElementById('auth-view-password');
    const regView = document.getElementById('auth-view-register');
    if (!usersView) return;

    if (this.usersList.length === 0) {
      this.showAuthRegisterView();
      return;
    }

    usersView.classList.remove('hidden');
    if (passView) passView.classList.add('hidden');
    if (regView) regView.classList.add('hidden');

    const listEl = document.getElementById('auth-users-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    this.usersList.forEach(u => {
      const initial = (u.name && u.name.length > 0) ? u.name[0].toUpperCase() : 'U';
      const card = document.createElement('div');
      card.className = 'p-3.5 rounded-2xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 hover:border-brand-500 dark:hover:border-brand-500 hover:bg-gray-100/80 dark:hover:bg-slate-800/60 transition cursor-pointer flex items-center justify-between group';
      card.onclick = () => this.selectUserForLogin(u.id);

      const safeName = this.escapeHtml(u.name);
      const safeJsName = safeName.replace(/'/g, "\\'");
      card.innerHTML = `
        <div class="flex items-center space-x-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-bold flex items-center justify-center shrink-0">
            ${initial}
          </div>
          <div class="truncate">
            <span class="block text-sm font-bold text-slate-900 dark:text-white truncate">${safeName}</span>
            <span class="block text-[11px] text-slate-400 font-medium">${this.escapeHtml(u.status || 'Pro Planner')} · ${u.currency || '₹'}</span>
          </div>
        </div>
        <div class="flex items-center space-x-1 shrink-0">
          <button type="button" title="Delete Account & Data" onclick="MoneyTrackApp.promptDeleteUserFromList(${u.id}, '${safeJsName}', event)" class="p-2 text-slate-400 hover:text-accent-rose opacity-60 group-hover:opacity-100 transition rounded-lg">
            <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
          <div class="p-2 text-slate-400 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition">
            <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      `;
      listEl.appendChild(card);
    });
  },

  selectUserForLogin: function(userId) {
    const user = this.usersList.find(u => u.id === userId);
    if (!user) return;
    this.selectedAuthUser = user;

    const avatarEl = document.getElementById('auth-selected-avatar');
    const nameEl = document.getElementById('auth-selected-name');
    const statusEl = document.getElementById('auth-selected-status');

    if (avatarEl) avatarEl.textContent = (user.name && user.name.length > 0) ? user.name[0].toUpperCase() : 'U';
    if (nameEl) nameEl.textContent = user.name;
    if (statusEl) statusEl.textContent = user.status || 'Pro Planner';

    const passInput = document.getElementById('auth-password-input');
    if (passInput) passInput.value = '';
    const errEl = document.getElementById('auth-login-error');
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }

    const hintEl = document.getElementById('auth-password-hint');
    if (hintEl) {
      if (user.id === 1 || user.name.toLowerCase() === 'alex taylor') {
        hintEl.classList.remove('hidden');
      } else {
        hintEl.classList.add('hidden');
      }
    }

    const usersView = document.getElementById('auth-view-users');
    const regView = document.getElementById('auth-view-register');
    const passView = document.getElementById('auth-view-password');

    if (usersView) usersView.classList.add('hidden');
    if (regView) regView.classList.add('hidden');
    if (passView) passView.classList.remove('hidden');

    if (passInput) passInput.focus();
  },

  submitLogin: function(e) {
    if (e) e.preventDefault();
    if (!this.selectedAuthUser) return;

    const passwordInput = document.getElementById('auth-password-input');
    const password = passwordInput ? passwordInput.value : '';
    const errEl = document.getElementById('auth-login-error');

    if (!password) {
      if (errEl) {
        errEl.textContent = 'Please enter your password.';
        errEl.classList.remove('hidden');
      }
      return;
    }

    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: this.selectedAuthUser.id,
        password: password
      })
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          this.currentUserProfileId = res.profile_id;
          localStorage.setItem('moneytrack_active_user_id', String(res.profile_id));
          const authScreen = document.getElementById('auth-screen');
          const mainShell = document.getElementById('main-app-shell');
          if (authScreen) authScreen.classList.add('hidden');
          if (mainShell) mainShell.classList.remove('hidden');
          this.refreshAllData();
        } else {
          if (errEl) {
            errEl.textContent = res.error || 'Incorrect password. Please try again.';
            errEl.classList.remove('hidden');
          }
          if (passwordInput) {
            passwordInput.focus();
            passwordInput.select();
          }
        }
      })
      .catch(err => {
        if (errEl) {
          errEl.textContent = 'Network or server error during sign in.';
          errEl.classList.remove('hidden');
        }
      });
  },

  showAuthRegisterView: function() {
    const usersView = document.getElementById('auth-view-users');
    const passView = document.getElementById('auth-view-password');
    const regView = document.getElementById('auth-view-register');
    const backBtn = document.getElementById('auth-reg-back-btn');

    if (usersView) usersView.classList.add('hidden');
    if (passView) passView.classList.add('hidden');
    if (regView) regView.classList.remove('hidden');

    if (backBtn) {
      if (this.usersList.length === 0) {
        backBtn.classList.add('hidden');
      } else {
        backBtn.classList.remove('hidden');
      }
    }

    const uInput = document.getElementById('reg-username-input');
    const pInput = document.getElementById('reg-password-input');
    const cpInput = document.getElementById('reg-confirm-password-input');
    const errEl = document.getElementById('auth-reg-error');
    if (uInput) uInput.value = '';
    if (pInput) pInput.value = '';
    if (cpInput) cpInput.value = '';
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }
    if (uInput) uInput.focus();
  },

  submitRegister: function(e) {
    if (e) e.preventDefault();
    const uInput = document.getElementById('reg-username-input');
    const pInput = document.getElementById('reg-password-input');
    const cpInput = document.getElementById('reg-confirm-password-input');
    const cInput = document.getElementById('reg-currency-input');
    const errEl = document.getElementById('auth-reg-error');

    const username = uInput ? uInput.value.trim() : '';
    const password = pInput ? pInput.value : '';
    const confirmPass = cpInput ? cpInput.value : '';
    const currency = cInput ? cInput.value : '₹';

    if (!username) {
      if (errEl) {
        errEl.textContent = 'Username is required.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (username.length < 3) {
      if (errEl) {
        errEl.textContent = 'Username must be at least 3 characters.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (!password || password.length < 4) {
      if (errEl) {
        errEl.textContent = 'Password must be at least 4 characters.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (password !== confirmPass) {
      if (errEl) {
        errEl.textContent = 'Passwords do not match.';
        errEl.classList.remove('hidden');
      }
      return;
    }

    fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username,
        password: password,
        currency: currency
      })
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          this.currentUserProfileId = res.profile_id;
          localStorage.setItem('moneytrack_active_user_id', String(res.profile_id));
          const authScreen = document.getElementById('auth-screen');
          const mainShell = document.getElementById('main-app-shell');
          if (authScreen) authScreen.classList.add('hidden');
          if (mainShell) mainShell.classList.remove('hidden');
          this.refreshAllData();
        } else {
          if (errEl) {
            errEl.textContent = res.error || 'Failed to create account.';
            errEl.classList.remove('hidden');
          }
        }
      })
      .catch(err => {
        if (errEl) {
          errEl.textContent = 'Server error during registration.';
          errEl.classList.remove('hidden');
        }
      });
  },

  logout: function() {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    this.currentUserProfileId = 0;
    localStorage.removeItem('moneytrack_active_user_id');
    const mainShell = document.getElementById('main-app-shell');
    const authScreen = document.getElementById('auth-screen');
    if (mainShell) mainShell.classList.add('hidden');
    if (authScreen) authScreen.classList.remove('hidden');

    fetch('/api/auth/users')
      .then(r => r.json())
      .then(data => {
        this.usersList = data.users || [];
        if (this.usersList.length === 0) {
          this.showAuthRegisterView();
        } else {
          this.showAuthUsersView();
        }
      });
  },

  // --- 10-Second Countdown Deletion System ---
  openDeleteUserModal: function(userId, username) {
    this.deleteTargetUserId = userId;
    const nameEl = document.getElementById('delete-modal-username');
    if (nameEl) nameEl.textContent = username;

    const modal = document.getElementById('delete-user-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    if (this.deleteCountdownTimer) {
      clearInterval(this.deleteCountdownTimer);
      this.deleteCountdownTimer = null;
    }

    let seconds = 10;
    const btn = document.getElementById('delete-user-confirm-btn');
    const label = document.getElementById('delete-btn-label');
    const timerText = document.getElementById('delete-countdown-timer-text');
    const bar = document.getElementById('delete-countdown-bar');
    const status = document.getElementById('delete-countdown-status');

    if (btn) {
      btn.disabled = true;
      btn.className = 'py-2.5 px-4 rounded-xl bg-gray-300 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed text-xs font-semibold transition flex items-center space-x-1.5';
    }
    if (label) label.textContent = 'Delete in 10s';
    if (timerText) timerText.textContent = '10s remaining';
    if (bar) bar.style.width = '100%';
    if (status) status.textContent = 'Please read the warning. Confirmation unlocks in 10 seconds.';

    this.deleteCountdownTimer = setInterval(() => {
      seconds--;
      if (seconds > 0) {
        if (timerText) timerText.textContent = seconds + 's remaining';
        if (label) label.textContent = 'Delete in ' + seconds + 's';
        if (bar) bar.style.width = (seconds * 10) + '%';
      } else {
        clearInterval(this.deleteCountdownTimer);
        this.deleteCountdownTimer = null;
        if (timerText) timerText.textContent = 'Safety hold complete';
        if (bar) bar.style.width = '0%';
        if (status) status.textContent = 'You may now permanently delete this username and all records.';
        if (label) label.textContent = 'Permanently Delete User & All Data';
        if (btn) {
          btn.disabled = false;
          btn.className = 'py-2.5 px-4 rounded-xl bg-accent-rose hover:bg-rose-700 text-white cursor-pointer shadow-sm active:scale-95 text-xs font-semibold transition flex items-center space-x-1.5';
        }
      }
    }, 1000);
  },

  closeDeleteUserModal: function() {
    if (this.deleteCountdownTimer) {
      clearInterval(this.deleteCountdownTimer);
      this.deleteCountdownTimer = null;
    }
    const modal = document.getElementById('delete-user-modal');
    if (modal) modal.classList.add('hidden');
    this.deleteTargetUserId = null;
  },

  confirmDeleteUserWithData: function() {
    if (!this.deleteTargetUserId) return;
    const targetId = this.deleteTargetUserId;

    fetch(`/api/auth/users/${targetId}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          this.closeDeleteUserModal();
          const wasActive = (targetId === this.currentUserProfileId);
          if (wasActive) {
            this.logout();
          } else {
            fetch('/api/auth/users')
              .then(r => r.json())
              .then(data => {
                this.usersList = data.users || [];
                if (this.usersList.length === 0) {
                  this.showAuthRegisterView();
                } else {
                  this.showAuthUsersView();
                }
              });
          }
        } else {
          alert(res.error || 'Failed to delete user.');
        }
      })
      .catch(err => {
        alert('Error connecting to backend: ' + err.message);
      });
  },

  promptDeleteCurrentAccount: function() {
    if (this.state.user && this.currentUserProfileId) {
      this.openDeleteUserModal(this.currentUserProfileId, this.state.user.name);
    }
  },

  promptDeleteCurrentSelectedUser: function() {
    if (this.selectedAuthUser) {
      this.openDeleteUserModal(this.selectedAuthUser.id, this.selectedAuthUser.name);
    }
  },

  promptDeleteUserFromList: function(userId, username, event) {
    if (event) event.stopPropagation();
    this.openDeleteUserModal(userId, username);
  },

  initTheme: function() {
    const savedTheme = localStorage.getItem('moneytrack_theme') || 'dark';
    this.state.theme = savedTheme;
    this.applyTheme();
  },

  toggleTheme: function() {
    this.state.theme = (this.state.theme === 'dark') ? 'light' : 'dark';
    localStorage.setItem('moneytrack_theme', this.state.theme);
    this.applyTheme();
  },

  applyTheme: function() {
    if (this.state.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    if (this.state.lastScenarioData) {
      this.renderScenarioChart(this.state.lastScenarioData);
    }
    if (this.state.lastAffordData) {
      this.renderAffordChart(this.state.lastAffordData);
    }
    if (this.state.currentTab === 'analytics' && this.state.analyticsState.data) {
      this.renderAnalyticsCharts(this.state.analyticsState.data);
    }
    if (this.state.currentTab === 'calendar' && this.state.calendarState.data) {
      this.renderCalendarGrid(this.state.calendarState.data);
      if (this.state.calendarState.selectedDate) {
        this.renderCalendarSelectedDate(this.state.calendarState.selectedDate);
      }
    }
    if (this.state.currentTab === 'tools') {
      if (this.state.lastEmiData) this.renderEmiChart(this.state.lastEmiData);
      if (this.state.lastCiData) this.renderCiChart(this.state.lastCiData);
      if (this.state.lastSipData) this.renderSavingsGrowthChart(this.state.lastSipData);
    }
  },

  // Navigation
  navigateTo: function(viewId) {
    this.showInAppLoader();
    this.state.currentTab = viewId;
    document.querySelectorAll('.view-panel').forEach(panel => {
      panel.classList.add('hidden');
      panel.classList.remove('animate-fade-in');
    });

    const target = document.getElementById('view-' + viewId);
    if (target) {
      target.classList.remove('hidden');
      target.classList.add('animate-fade-in');
    }

    // Update Nav UI Buttons (Desktop)
    document.querySelectorAll('.nav-btn').forEach(btn => {
      if (btn.getAttribute('data-nav') === viewId) {
        btn.classList.add('bg-gray-100', 'dark:bg-slate-800', 'text-brand-600', 'dark:text-brand-400');
      } else {
        btn.classList.remove('bg-gray-100', 'dark:bg-slate-800', 'text-brand-600', 'dark:text-brand-400');
      }
    });

    // Close mobile drawer if open
    const drawer = document.getElementById('mobile-drawer');
    if (drawer) drawer.classList.add('hidden');

    if (viewId === 'calendar') {
      this.loadCalendarView();
    }
    if (viewId === 'analytics') {
      this.loadAnalyticsView();
    }
    if (viewId === 'simulator') {
      this.initSimulatorView();
    }
    if (viewId === 'tools') {
      this.initCalculators();
    }

    this.renderAppVersionInfo();
    setTimeout(() => {
      this.hideInAppLoader();
    }, 120);
  },

  toggleMobileMenu: function() {
    const drawer = document.getElementById('mobile-drawer');
    const container = document.getElementById('mobile-nav-container');
    if (drawer.classList.contains('hidden')) {
      container.innerHTML = document.querySelector('#sidebar nav').innerHTML;
      drawer.classList.remove('hidden');
    } else {
      drawer.classList.add('hidden');
    }
  },

  // Refresh data from SQLite API
  refreshAllData: function() {
    this.showInAppLoader();
    const dashUrl = this.state.selectedDashboardAccountId
      ? `/api/dashboard?account_id=${this.state.selectedDashboardAccountId}`
      : '/api/dashboard';

    Promise.all([
      fetch(dashUrl).then(r => r.json()),
      fetch('/api/transactions').then(r => r.json()),
      fetch('/api/accounts').then(r => r.json()),
      fetch('/api/goals').then(r => r.json()),
      fetch('/api/calendar').then(r => r.json()),
      fetch('/api/learning/lessons').then(r => r.json()),
      fetch('/api/learning/achievements').then(r => r.json())
    ]).then(([dashData, txData, accData, goalData, calData, lessData, achData]) => {
      this.state.user = dashData.user;
      this.state.transactions = txData.transactions;
      this.state.accounts = accData.accounts || [];
      this.state.accountTypes = accData.account_types || {};
      this.state.goals = goalData.goals;
      this.state.calendarEvents = calData.events;
      this.state.lessons = lessData.lessons;
      this.state.achievements = achData.achievements;
      this.state.accountSummaries = dashData.account_summaries || [];
      this.state.activeDashboardData = dashData;
      this.state.diagnosticsData = dashData.diagnostics || null;
      this.state.alertsData = dashData.alerts || [];

      if (!this.state.selectedDashboardAccountId && dashData.selected_account_id) {
        this.state.selectedDashboardAccountId = String(dashData.selected_account_id);
      }

      this.renderHeaderAndUser();
      this.renderDashboard(dashData);
      this.renderAccounts();
      this.populateAccountSelects();
      this.renderTransactionsTable();
      this.renderGoals();
      this.renderCalendar();
      this.renderAchievements();
      this.renderAppVersionInfo();
      if (this.state.currentTab === 'simulator') {
        this.initSimulatorView();
      }
      if (this.state.currentTab === 'calendar') {
        this.loadCalendarView();
      }
      if (this.state.currentTab === 'analytics') {
        this.loadAnalyticsView();
      }
      this.hideInAppLoader();

      // Check for any unnotified critical alerts and trigger notifications
      this.checkAndTriggerAlertNotifications(dashData.alerts);
    }).catch(err => {
      console.error("Error refreshing data:", err);
      this.hideInAppLoader();
    });
  },

  selectDashboardAccount: function(accountId) {
    this.state.selectedDashboardAccountId = String(accountId);
    this.showInAppLoader();
    fetch(`/api/dashboard?account_id=${accountId}`)
      .then(r => r.json())
      .then(dashData => {
        this.state.activeDashboardData = dashData;
        this.renderDashboard(dashData);
        this.hideInAppLoader();
        const acc = (dashData.account_summaries || []).find(a => String(a.id) === String(accountId));
        if (acc) {
          this.showToast('Account View Switched', `Now viewing analytics for ${acc.name}.`, 'info', 2500);
        }
      })
      .catch(err => {
        console.error("Error switching account:", err);
        this.hideInAppLoader();
      });
  },

  renderHeaderAndUser: function() {
    document.querySelectorAll('.currency-symbol').forEach(el => el.textContent = this.state.user.currency);
    const fullNameEl = document.getElementById('header-user-fullname');
    if (fullNameEl) fullNameEl.textContent = this.state.user.name;

    const initialsEl = document.getElementById('user-avatar-initials');
    if (initialsEl) initialsEl.textContent = (this.state.user.name || 'U').charAt(0).toUpperCase();

    const greetingEl = document.getElementById('user-greeting-heading');
    if (greetingEl) {
      const firstName = (this.state.user.name || 'User').split(' ')[0];
      greetingEl.textContent = `${this.getGreeting()}, ${firstName}`;
    }

    const settingName = document.getElementById('setting-user-name');
    if (settingName) settingName.value = this.state.user.name;

    const settingCurr = document.getElementById('setting-currency-select');
    if (settingCurr) settingCurr.value = this.state.user.currency;
  },

  renderDashboard: function(data) {
    const selectedAid = String(data.selected_account_id || this.state.selectedDashboardAccountId || '');

    // 1. Render Account Switcher Pills
    const pillsContainer = document.getElementById('dash-account-selector-pills');
    if (pillsContainer) {
      pillsContainer.innerHTML = '';
      (data.account_summaries || []).forEach(acc => {
        const isSelected = String(acc.id) === selectedAid;
        const activeClass = isSelected
          ? 'bg-brand-600 text-white shadow-sm'
          : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-brand-500';
        const primaryTag = acc.is_primary ? `<span class="ml-1 px-1.5 py-0.5 text-[9px] rounded font-bold ${isSelected ? 'bg-white/20 text-white' : 'bg-brand-50 dark:bg-brand-900/40 text-brand-600'}">PRIMARY</span>` : '';
        pillsContainer.innerHTML += `
          <button onclick="MoneyTrackApp.selectDashboardAccount('${acc.id}')" class="px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center space-x-1.5 ${activeClass}">
            <span>${this.escapeHtml(acc.name)}</span>
            ${primaryTag}
          </button>
        `;
      });
    }

    // 2. Render All Accounts & Wallets Separate Financial Summaries Grid
    const summaryGrid = document.getElementById('dash-accounts-summary-grid');
    if (summaryGrid) {
      summaryGrid.innerHTML = '';
      const typeIcons = {
        'savings': '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 3l9 5H3l9-5z"/></svg>',
        'current': '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6z"/></svg>',
        'cash': '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>',
        'credit_card': '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
        'wallet': '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><path d="M20 7h-7m-4 0H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 13h.01"/></svg>',
        'investment': '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>'
      };

      (data.account_summaries || []).forEach(acc => {
        const isSelected = String(acc.id) === selectedAid;
        const icon = typeIcons[acc.account_type] || typeIcons['savings'];
        const isCredit = acc.account_type === 'credit_card';
        const balLabel = isCredit ? (acc.current_balance > 0 ? 'Outstanding Due' : 'Paid in Full') : (acc.current_balance < 0 ? 'Overdrawn' : 'Available Balance');
        const balColor = isCredit ? (acc.current_balance > 0 ? 'text-accent-rose' : 'text-brand-600') : (acc.current_balance < 0 ? 'text-accent-rose' : 'text-slate-900 dark:text-white');
        const borderClass = isSelected ? 'ring-2 ring-brand-500 border-brand-500 bg-brand-50/20 dark:bg-brand-950/20' : 'border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-gray-300 dark:hover:border-slate-700';

        const primaryBadge = acc.is_primary ? `
          <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 border border-brand-200 dark:border-brand-800">PRIMARY</span>
        ` : '';

        summaryGrid.innerHTML += `
          <div onclick="MoneyTrackApp.selectDashboardAccount('${acc.id}')" class="p-4 rounded-2xl border ${borderClass} transition cursor-pointer shadow-sm space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2">
                <span class="p-1.5 rounded-lg text-white" style="background-color: ${acc.color}">${icon}</span>
                <div>
                  <div class="text-xs font-bold text-slate-900 dark:text-white">${this.escapeHtml(acc.name)}</div>
                  <div class="text-[10px] text-slate-400 capitalize">${acc.type_label}</div>
                </div>
              </div>
              <div class="flex items-center space-x-1">
                ${primaryBadge}
                ${isSelected ? '<span class="w-2 h-2 rounded-full bg-brand-500 inline-block" title="Active"></span>' : ''}
              </div>
            </div>

            <div class="pt-1">
              <div class="text-lg font-black ${balColor}">${this.state.user.currency}${Math.abs(acc.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              <div class="text-[10px] font-medium text-slate-400">${balLabel}</div>
            </div>

            <div class="pt-2 border-t border-gray-100 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span class="text-slate-400">Total Inflow:</span>
                <span class="font-bold text-brand-600 block">${this.state.user.currency}${acc.income.toLocaleString()}</span>
              </div>
              <div>
                <span class="text-slate-400">Total Outflow:</span>
                <span class="font-bold text-accent-rose block">${this.state.user.currency}${acc.expenses.toLocaleString()}</span>
              </div>
            </div>

            <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1">
              <span>Health: <strong class="text-slate-800 dark:text-slate-200">${acc.health_score}/100</strong></span>
              <span class="text-brand-600 dark:text-brand-400 font-semibold">${isSelected ? 'Active View' : 'Select \u2192'}</span>
            </div>
          </div>
        `;
      });
    }

    // Active Account Context Header
    const activeAcc = (data.account_summaries || []).find(a => String(a.id) === selectedAid);
    const activeBadge = document.getElementById('dash-active-account-badge');
    const subtitleEl = document.getElementById('dash-account-subtitle');
    if (activeAcc && activeBadge) {
      activeBadge.textContent = `${activeAcc.name} ${activeAcc.is_primary ? '(Primary)' : ''}`;
    }
    if (activeAcc && subtitleEl) {
      subtitleEl.textContent = `Viewing separate financial data, health score (${activeAcc.health_score}/100), and budget limits for ${activeAcc.name}.`;
    }

    // 3. Render 4 Primary Metric Cards
    const totals = data.totals;
    document.getElementById('dash-income-val').textContent = totals.income.toLocaleString();
    document.getElementById('dash-expense-val').textContent = totals.expenses.toLocaleString();
    document.getElementById('dash-savings-val').textContent = totals.savings.toLocaleString();
    const netBalance = totals.total_balance !== undefined ? totals.total_balance : totals.balance;
    document.getElementById('dash-balance-val').textContent = netBalance.toLocaleString();

    const savRateEl = document.getElementById('dash-savings-rate');
    if (savRateEl && totals.savings_rate !== undefined) {
      savRateEl.textContent = totals.savings_rate;
    }

    // Contextual metric subtexts
    const isCredit = activeAcc && activeAcc.account_type === 'credit_card';
    const balLabel = document.getElementById('dash-balance-label');
    const balSubtext = document.getElementById('dash-balance-subtext');
    if (balLabel) balLabel.textContent = isCredit ? 'Outstanding Due' : 'Current Balance';
    if (balSubtext) balSubtext.textContent = isCredit ? (netBalance > 0 ? 'Card balance due' : 'Paid in full') : (netBalance < 0 ? 'Account overdrawn' : 'Available buffer');

    // 4. Render Financial Health
    const health = data.health;
    const scoreNum = document.getElementById('health-score-num');
    if (scoreNum) scoreNum.textContent = health.score;

    const scoreBar = document.getElementById('health-score-bar');
    if (scoreBar) {
      scoreBar.style.width = `${health.score}%`;
      scoreBar.className = `${health.bar_color} h-full rounded-full transition-all duration-700`;
    }

    const badge = document.getElementById('health-status-badge');
    if (badge) {
      badge.textContent = health.status;
      badge.className = `px-2.5 py-1 rounded-full text-xs font-bold ${health.badge_class}`;
    }

    document.getElementById('health-sav-rate').textContent = health.savings_rate;
    document.getElementById('health-sav-bar').style.width = `${health.savings_bar_pct}%`;
    document.getElementById('health-bud-ctrl').textContent = health.budget_control;
    document.getElementById('health-bud-bar').style.width = `${health.budget_bar_pct}%`;
    document.getElementById('health-emg-res').textContent = health.emergency_reserve;
    document.getElementById('health-emg-bar').style.width = `${health.emergency_bar_pct}%`;

    // 5. Render Category Spending Breakdown & Donut Chart
    const donutSvg = document.getElementById('dashboard-donut-svg');
    const legendContainer = document.getElementById('dashboard-spending-legend');
    const topCatLbl = document.getElementById('donut-top-category-lbl');
    const centerTotalEl = document.getElementById('donut-center-total');
    const catSpendings = data.category_spending || [];
    const totalSpent = catSpendings.reduce((sum, c) => sum + (c.spent || 0), 0);

    if (centerTotalEl) {
      centerTotalEl.innerHTML = `<span class="currency-symbol">${this.state.user.currency}</span>${totalSpent.toLocaleString()}`;
    }

    if (legendContainer) {
      legendContainer.innerHTML = '';

      if (catSpendings.length === 0) {
        legendContainer.innerHTML = '<div class="text-xs text-slate-400 py-2">No expenses recorded for this account yet.</div>';
        if (topCatLbl) topCatLbl.textContent = 'None (0%)';
        if (donutSvg) {
          donutSvg.innerHTML = '<path class="text-gray-100 dark:text-slate-800" stroke-width="3.8" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />';
        }
      } else {
        const topCat = catSpendings[0];
        if (topCatLbl) {
          topCatLbl.textContent = `${topCat.name} (${Math.round(topCat.percentage)}%)`;
        }

        // SVG Donut Path generation
        if (donutSvg) {
          let svgHtml = '<path class="text-gray-100 dark:text-slate-800" stroke-width="3.8" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />';
          let accumulatedOffset = 0;
          catSpendings.forEach(cat => {
            const pct = Math.max(0, Math.min(100, cat.percentage));
            svgHtml += `<path style="stroke: ${cat.color}" stroke-dasharray="${pct}, 100" stroke-dashoffset="-${accumulatedOffset}" stroke-width="3.8" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />`;
            accumulatedOffset += pct;
          });
          donutSvg.innerHTML = svgHtml;
        }

        // Legend Rendering with clean wrapping
        catSpendings.forEach(cat => {
          legendContainer.innerHTML += `
            <div class="flex items-center justify-between py-1">
              <div class="flex items-center space-x-2 min-w-0 flex-1 mr-2">
                <span class="w-3 h-3 rounded-full shrink-0 inline-block" style="background-color: ${cat.color}"></span>
                <span class="text-slate-700 dark:text-slate-200 font-medium break-words text-xs">${this.escapeHtml(cat.name)} <span class="text-slate-400 font-normal">(${Math.round(cat.percentage)}%)</span></span>
              </div>
              <span class="font-bold text-slate-900 dark:text-white shrink-0">${this.state.user.currency}${cat.spent.toLocaleString()}</span>
            </div>
          `;
        });
      }
    }

    // 6. Dynamic Spending Insights Box
    const insightEl = document.getElementById('dashboard-spending-insight-text');
    if (insightEl) {
      insightEl.textContent = data.spending_insight || "Analyzing actual monthly spending trends...";
    }

    // 7. Render Budgets Overview
    const budgetContainer = document.getElementById('budget-items-list');
    if (budgetContainer) {
      budgetContainer.innerHTML = '';
      if (!data.budgets || data.budgets.length === 0) {
        budgetContainer.innerHTML = `
          <div class="p-4 rounded-xl border border-dashed border-gray-200 dark:border-slate-800 text-center text-xs text-slate-400">
            No category budgets set for this month. Click "Manage" to configure budget limits.
          </div>
        `;
      } else {
        data.budgets.forEach(b => {
          const rem = b.remaining !== undefined ? b.remaining : Math.max(0, b.limit - b.spent);
          budgetContainer.innerHTML += `
            <div class="space-y-1.5 text-xs">
              <div class="flex justify-between items-center font-semibold">
                <span class="text-slate-800 dark:text-slate-200">${this.escapeHtml(b.name)}</span>
                <div class="flex items-center space-x-2">
                  <span class="text-slate-500">${this.state.user.currency}${b.spent.toLocaleString()} / ${this.state.user.currency}${b.limit.toLocaleString()}</span>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold ${b.badge_color}">${b.status}</span>
                </div>
              </div>
              <div class="w-full bg-gray-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div class="${b.bar_color} h-full transition-all duration-500" style="width: ${b.pct}%"></div>
              </div>
              <div class="flex justify-between text-[10px] text-slate-400">
                <span>Remaining: <strong class="${rem > 0 ? 'text-brand-600' : 'text-accent-rose'}">${this.state.user.currency}${rem.toLocaleString()}</strong></span>
                <span>${b.pct}% spent</span>
              </div>
            </div>
          `;
        });
      }
    }

    // 8. Render Financial Alerts & Warnings
    const alertsContainer = document.getElementById('dashboard-alerts-list');
    if (alertsContainer) {
      alertsContainer.innerHTML = '';
      const visibleAlerts = (data.alerts || []).filter(a => !this.state.dismissedAlertIds.has(a.id));
      if (visibleAlerts.length === 0) {
        alertsContainer.innerHTML = `
          <div class="p-3 rounded-xl border border-brand-200 dark:border-brand-900/40 bg-brand-50/50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 text-xs flex items-center space-x-3">
            <svg class="w-4 h-4 shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span class="font-medium text-slate-700 dark:text-slate-300">All accounts and budgets are currently in healthy standing. No live warnings detected.</span>
          </div>
        `;
      } else {
        visibleAlerts.forEach(a => {
          const isDanger = a.type === 'danger';
          const isWarning = a.type === 'warning';
          const bg = isDanger ? 'bg-accent-rose/10 border-accent-rose/20 text-accent-rose'
                     : (isWarning ? 'bg-accent-amber/10 border-accent-amber/20 text-accent-amber' : 'bg-brand-50 dark:bg-brand-900/30 border-brand-200 dark:border-brand-900/40 text-brand-600');
          alertsContainer.innerHTML += `
            <div class="p-3 rounded-xl border ${bg} text-xs flex items-start justify-between space-x-3">
              <div class="flex items-start space-x-2.5">
                <svg class="w-4 h-4 shrink-0 stroke-current fill-none stroke-2 mt-0.5" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <div>
                  <div class="font-bold text-slate-900 dark:text-white">${this.escapeHtml(a.title)}</div>
                  <div class="text-slate-700 dark:text-slate-300 mt-0.5">${this.escapeHtml(a.message)}</div>
                </div>
              </div>
              <button onclick="MoneyTrackApp.dismissAlert('${a.id}')" class="text-slate-400 hover:text-slate-600 p-0.5" title="Dismiss">&times;</button>
            </div>
          `;
        });
      }
    }

    // 9. Render Notifications Modal List
    const notifContainer = document.getElementById('notifications-modal-list');
    const notifCountBadge = document.getElementById('notif-tab-alerts-count');
    if (notifContainer) {
      notifContainer.innerHTML = '';
      const visibleAlerts = (data.alerts || []).filter(a => !this.state.dismissedAlertIds.has(a.id));
      if (notifCountBadge) notifCountBadge.textContent = visibleAlerts.filter(a => a.type !== 'success').length;

      if (visibleAlerts.length === 0) {
        notifContainer.innerHTML = `
          <div class="p-5 rounded-xl border border-gray-100 dark:border-slate-800 text-center space-y-1.5">
            <svg class="w-8 h-8 mx-auto stroke-current fill-none stroke-2 text-brand-500" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <p class="font-bold text-xs text-slate-800 dark:text-white">Zero Active Risk Alerts</p>
            <p class="text-[11px] text-slate-400">Your accounts, budgets, and bills are all on schedule.</p>
          </div>
        `;
      } else {
        visibleAlerts.forEach(a => {
          const isDanger = a.type === 'danger';
          const isWarning = a.type === 'warning';
          const cardBorder = isDanger ? 'border-accent-rose/30 bg-accent-rose/5' : (isWarning ? 'border-accent-amber/30 bg-accent-amber/5' : 'border-brand-500/20 bg-brand-50/5');
          const badgeClass = isDanger ? 'bg-accent-rose text-white' : (isWarning ? 'bg-accent-amber text-white' : 'bg-brand-600 text-white');
          notifContainer.innerHTML += `
            <div class="p-3.5 rounded-xl border ${cardBorder} space-y-1.5 flex items-start justify-between">
              <div class="space-y-1 flex-1 pr-2">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-xs text-slate-900 dark:text-white">${this.escapeHtml(a.title)}</span>
                  <span class="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${badgeClass}">${a.type}</span>
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${this.escapeHtml(a.message)}</p>
              </div>
              <button onclick="MoneyTrackApp.dismissAlert('${a.id}')" class="text-slate-400 hover:text-slate-600 text-sm font-bold p-1" title="Dismiss Alert">&times;</button>
            </div>
          `;
        });
      }
    }

    // 10. Update Notification Bell Count
    const bellBadge = document.getElementById('alert-badge-count');
    if (bellBadge) {
      const warningCount = (data.alerts || []).filter(a => a.type !== 'success' && !this.state.dismissedAlertIds.has(a.id)).length;
      bellBadge.textContent = warningCount;
      if (warningCount > 0) {
        bellBadge.classList.remove('hidden');
        bellBadge.style.display = 'flex';
      } else {
        bellBadge.classList.add('hidden');
        bellBadge.style.display = 'none';
      }
    }
  },

  dismissAlert: function(alertId) {
    this.state.dismissedAlertIds.add(alertId);
    if (this.state.activeDashboardData) {
      this.renderDashboard(this.state.activeDashboardData);
    }
    this.showToast('Alert Dismissed', 'Notification removed from your active dashboard view.', 'info', 2000);
  },

  checkAndTriggerAlertNotifications: function(alerts) {
    if (!alerts || !Array.isArray(alerts)) return;
    const critical = alerts.filter(a => a.type === 'danger' && !this.state.dismissedAlertIds.has(a.id));
    critical.forEach(a => {
      // Trigger notification toast
      this.showToast(a.title, a.message, 'danger', 6000);
    });
  },

  // ==========================================
  // Category Budget Limits Management
  // ==========================================
  openBudgetManagerModal: function() {
    this.openModal('budget-manager-modal');

    // Populate Category Dropdown
    const catSelect = document.getElementById('budget-form-category');
    if (catSelect) {
      catSelect.innerHTML = '';
      const existingCategories = new Set([
        'Food & Dining', 'Transport', 'Shopping', 'Bills & Utilities',
        'Entertainment', 'Healthcare', 'Education', 'Personal Care', 'Other'
      ]);
      (this.state.transactions || []).forEach(t => {
        if (t.category) existingCategories.add(t.category);
      });
      existingCategories.forEach(c => {
        catSelect.innerHTML += `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)}</option>`;
      });
    }

    // Default target month to current month
    const monthInput = document.getElementById('budget-form-month');
    if (monthInput && !monthInput.value) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      monthInput.value = `${yyyy}-${mm}`;
    }

    // Scope label
    const scopeLabel = document.getElementById('budget-modal-account-scope');
    if (scopeLabel) {
      const activeAcc = (this.state.accountSummaries || []).find(a => String(a.id) === String(this.state.selectedDashboardAccountId));
      scopeLabel.textContent = activeAcc ? `Expenses tracked from: ${activeAcc.name}` : 'Tracking all account expenses';
    }

    this.renderBudgetManagerTable();
  },

  renderBudgetManagerTable: function() {
    const tbody = document.getElementById('budget-manager-table-body');
    if (!tbody) return;

    const monthInput = document.getElementById('budget-form-month');
    const month = monthInput ? monthInput.value : '';
    const aid = this.state.selectedDashboardAccountId;

    const url = `/api/budgets?${month ? 'month=' + month : ''}${aid ? '&account_id=' + aid : ''}`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        tbody.innerHTML = '';
        const budgets = data.budgets || [];
        if (budgets.length === 0) {
          tbody.innerHTML = `
            <tr>
              <td colspan="6" class="py-6 text-center text-slate-400">
                No category budgets configured for this month. Use the form above to set one.
              </td>
            </tr>
          `;
          return;
        }

        budgets.forEach(b => {
          const rem = b.remaining !== undefined ? b.remaining : Math.max(0, b.limit - b.spent);
          tbody.innerHTML += `
            <tr class="hover:bg-gray-50 dark:hover:bg-slate-900/40 transition">
              <td class="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                <span class="inline-block w-2.5 h-2.5 rounded-full mr-1.5" style="background-color: ${b.color || '#3b82f6'}"></span>
                ${this.escapeHtml(b.name)}
              </td>
              <td class="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                ${this.state.user.currency}${b.limit.toLocaleString()}
              </td>
              <td class="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                ${this.state.user.currency}${b.spent.toLocaleString()}
              </td>
              <td class="py-2.5 px-3 font-bold ${rem > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-accent-rose'}">
                ${this.state.user.currency}${rem.toLocaleString()}
              </td>
              <td class="py-2.5 px-3">
                <div class="flex items-center space-x-2">
                  <div class="w-16 bg-gray-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div class="${b.bar_color} h-full" style="width: ${Math.min(100, b.pct)}%"></div>
                  </div>
                  <span class="text-[10px] font-bold ${b.pct > 100 ? 'text-accent-rose' : 'text-slate-500'}">${b.pct}%</span>
                </div>
              </td>
              <td class="py-2.5 px-3 text-center">
                <button onclick="MoneyTrackApp.deleteBudget(${b.category_id}, '${b.month_year}')" class="p-1 rounded text-slate-400 hover:text-accent-rose hover:bg-rose-50 dark:hover:bg-rose-950/30 transition" title="Delete Budget Limit">
                  <svg class="w-3.5 h-3.5 stroke-current fill-none stroke-2 inline" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </td>
            </tr>
          `;
        });
      });
  },

  handleSaveBudget: function(event) {
    if (event) event.preventDefault();
    const category = document.getElementById('budget-form-category').value;
    const limit = parseFloat(document.getElementById('budget-form-limit').value);
    const month = document.getElementById('budget-form-month').value;

    if (!category || isNaN(limit) || limit <= 0) {
      this.showToast('Validation Error', 'Please enter a valid category and positive limit.', 'danger');
      return;
    }

    fetch('/api/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, limit, month })
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          this.showToast('Budget Saved', `Monthly limit of ${this.state.user.currency}${limit.toLocaleString()} set for ${category}.`, 'success');
          document.getElementById('budget-form-limit').value = '';
          this.renderBudgetManagerTable();
          this.refreshAllData();
        } else {
          this.showToast('Error', res.error || 'Failed to save budget', 'danger');
        }
      });
  },

  deleteBudget: function(categoryId, monthYear) {
    if (!confirm('Remove this category budget limit?')) return;
    fetch(`/api/budgets/${categoryId}?month=${monthYear}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          this.showToast('Budget Removed', 'Category spending limit removed.', 'info');
          this.renderBudgetManagerTable();
          this.refreshAllData();
        }
      });
  },

  // ==========================================
  // Live Notifications & Diagnostics Controls
  // ==========================================
  openDiagnosticsModal: function() {
    this.openModal('notifications-modal');
    this.switchNotifTab('diagnostics');
  },

  switchNotifTab: function(tab) {
    this.state.activeNotifTab = tab;
    const btnAlerts = document.getElementById('notif-tab-btn-alerts');
    const btnDiag = document.getElementById('notif-tab-btn-diagnostics');
    const panelAlerts = document.getElementById('notif-panel-alerts');
    const panelDiag = document.getElementById('notif-panel-diagnostics');

    if (tab === 'alerts') {
      if (btnAlerts) btnAlerts.className = 'pb-2 text-brand-600 dark:text-brand-400 border-b-2 border-brand-600';
      if (btnDiag) btnDiag.className = 'pb-2 text-slate-400 border-b-2 border-transparent hover:text-slate-600';
      if (panelAlerts) panelAlerts.classList.remove('hidden');
      if (panelDiag) panelDiag.classList.add('hidden');
    } else {
      if (btnDiag) btnDiag.className = 'pb-2 text-brand-600 dark:text-brand-400 border-b-2 border-brand-600';
      if (btnAlerts) btnAlerts.className = 'pb-2 text-slate-400 border-b-2 border-transparent hover:text-slate-600';
      if (panelDiag) panelDiag.classList.remove('hidden');
      if (panelAlerts) panelAlerts.classList.add('hidden');
      this.renderDiagnostics();
    }
  },

  renderDiagnostics: function() {
    const list = document.getElementById('diagnostics-checks-list');
    const statusBadge = document.getElementById('diagnostic-overall-status');
    const progressBar = document.getElementById('diagnostic-progress-bar');
    const summaryText = document.getElementById('diagnostic-summary-text');
    if (!list) return;

    fetch('/api/diagnostics')
      .then(r => r.json())
      .then(data => {
        const diag = data.diagnostics || {};
        if (statusBadge) {
          statusBadge.textContent = diag.status ? diag.status.toUpperCase() : 'HEALTHY';
          statusBadge.className = diag.status === 'healthy'
            ? 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 text-brand-700'
            : (diag.status === 'warning' ? 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-amber/20 text-accent-amber' : 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent-rose/20 text-accent-rose');
        }
        if (progressBar) {
          progressBar.style.width = `${diag.score || 100}%`;
          progressBar.className = diag.score >= 80 ? 'bg-brand-500 h-full rounded-full' : (diag.score >= 50 ? 'bg-accent-amber h-full rounded-full' : 'bg-accent-rose h-full rounded-full');
        }
        if (summaryText) {
          summaryText.textContent = `${diag.passed_checks || 0} of ${diag.total_checks || 0} checks passed (${diag.score || 100}% integrity score). Last verified at ${diag.timestamp || 'now'}.`;
        }

        list.innerHTML = '';
        (diag.checks || []).forEach(chk => {
          const isPass = chk.status === 'pass';
          const isWarn = chk.status === 'warning';
          const badgeClass = isPass ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300' : (isWarn ? 'bg-accent-amber/20 text-accent-amber' : 'bg-accent-rose/20 text-accent-rose');
          const icon = isPass
            ? '<svg class="w-4 h-4 text-brand-600 shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
            : '<svg class="w-4 h-4 text-accent-amber shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

          list.innerHTML += `
            <div class="p-3 rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-950 flex items-start justify-between space-x-2">
              <div class="flex items-start space-x-2.5">
                ${icon}
                <div>
                  <div class="font-bold text-slate-900 dark:text-white">${this.escapeHtml(chk.name)}</div>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">${this.escapeHtml(chk.detail)}</p>
                </div>
              </div>
              <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${badgeClass}">${chk.status}</span>
            </div>
          `;
        });
      });
  },

  openHealthAnalysisModal: function() {
    this.openModal('health-analysis-modal');
    const health = this.state.activeDashboardData ? this.state.activeDashboardData.health : null;
    const ratingEl = document.getElementById('health-modal-rating');
    const summaryEl = document.getElementById('health-modal-summary');
    const recsEl = document.getElementById('health-modal-recommendations');

    if (health) {
      if (ratingEl) {
        ratingEl.textContent = `Overall Diagnostic Rating: ${health.score} / 100 (${health.status})`;
      }
      if (summaryEl) {
        summaryEl.textContent = `Your savings rate is currently ${health.savings_rate}, with budget discipline scored at ${health.budget_control} and emergency reserve covering ${health.emergency_reserve} of living costs.`;
      }
      if (recsEl) {
        recsEl.innerHTML = '';
        if (health.score >= 75) {
          recsEl.innerHTML += '<li>Your finances are in an exceptional state! Continue your disciplined monthly savings allocations.</li>';
          recsEl.innerHTML += '<li>Ensure your emergency liquid buffer reaches 6 full months of living costs.</li>';
          recsEl.innerHTML += '<li>Consider deploying excess liquid balances into structured compounding instruments.</li>';
        } else if (health.score >= 50) {
          recsEl.innerHTML += '<li>Maintain closer oversight of discretionary spending categories to prevent budget warnings.</li>';
          recsEl.innerHTML += '<li>Boost your savings rate toward the standard 20% benchmark.</li>';
          recsEl.innerHTML += '<li>Review upcoming recurring calendar bills and ensure accounts maintain a positive liquidity buffer.</li>';
        } else {
          recsEl.innerHTML += '<li>Urgent: Reduce non-essential discretionary expenses to balance cashflow.</li>';
          recsEl.innerHTML += '<li>Address any overdrawn or low-balance accounts to avoid debt accumulation.</li>';
          recsEl.innerHTML += '<li>Prioritize building a minimum 1-month liquid emergency safety net immediately.</li>';
        }
      }
    }
  },

  requestNotificationPermission: function() {
    if (!('Notification' in window)) {
      this.showToast('Browser Unsupported', 'Web Notification API is not supported in this browser.', 'warning');
      return;
    }
    Notification.requestPermission().then(perm => {
      const label = document.getElementById('tab-notifs-btn-label');
      if (perm === 'granted') {
        if (label) label.textContent = 'Tab Alerts Enabled (\u2713)';
        this.showToast('Notifications Active', 'Live desktop notifications will now alert you even when switching browser tabs.', 'success');
      } else {
        if (label) label.textContent = 'Tab Alerts Blocked';
        this.showToast('Notifications Blocked', 'Permission denied by browser settings.', 'warning');
      }
    });
  },

  showToast: function(title, message, type = 'info', duration = 5000) {
    const container = document.getElementById('notification-toast-container');
    if (!container) return;

    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    const toast = document.createElement('div');
    toast.id = id;
    toast.className = 'pointer-events-auto p-4 rounded-2xl shadow-xl border backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0 flex items-start justify-between space-x-3 ';

    let colorStyles = '';
    let iconSvg = '';
    if (type === 'success') {
      colorStyles = 'bg-white dark:bg-slate-900 border-brand-500/40 text-brand-600 dark:text-brand-400';
      iconSvg = '<svg class="w-5 h-5 text-brand-600 shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    } else if (type === 'danger' || type === 'error') {
      colorStyles = 'bg-white dark:bg-slate-900 border-accent-rose/50 text-accent-rose';
      iconSvg = '<svg class="w-5 h-5 text-accent-rose shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else if (type === 'warning') {
      colorStyles = 'bg-white dark:bg-slate-900 border-accent-amber/50 text-accent-amber';
      iconSvg = '<svg class="w-5 h-5 text-accent-amber shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    } else {
      colorStyles = 'bg-white dark:bg-slate-900 border-accent-blue/40 text-accent-blue';
      iconSvg = '<svg class="w-5 h-5 text-accent-blue shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.className += colorStyles;
    toast.innerHTML = `
      <div class="flex items-start space-x-3">
        ${iconSvg}
        <div class="text-xs">
          <div class="font-bold text-slate-900 dark:text-white">${this.escapeHtml(title)}</div>
          <div class="text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">${this.escapeHtml(message)}</div>
        </div>
      </div>
      <button onclick="document.getElementById('${id}')?.remove()" class="text-slate-400 hover:text-slate-600 p-1">&times;</button>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    if (duration > 0) {
      setTimeout(() => {
        if (toast.parentNode) {
          toast.classList.add('opacity-0', 'scale-95');
          setTimeout(() => toast.remove(), 300);
        }
      }, duration);
    }

    // Tab Background handling
    if (document.hidden) {
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(title, { body: message });
        } catch (e) {
          // Fallback handled
        }
      }
      document.title = `(\uD83D\uDD14) ${title} - MoneyTrack`;
    }
  },

  // ==========================================
  // Accounts & Multi-Account Management
  // ==========================================
  renderAccounts: function() {
    const grid = document.getElementById('accounts-grid');
    const badgeCount = document.getElementById('accounts-count-badge');
    if (badgeCount) badgeCount.textContent = this.state.accounts.length;
    if (!grid) return;

    grid.innerHTML = '';
    if (this.state.accounts.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full p-6 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 text-center text-xs text-slate-400 space-y-3">
          <div class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <svg class="w-5 h-5 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>
          </div>
          <p class="font-semibold text-slate-700 dark:text-slate-300">No accounts configured yet.</p>
          <p class="max-w-xs mx-auto text-[11px]">You must create at least one account or wallet before you can add income, expenses, or transfers.</p>
          <button onclick="MoneyTrackApp.openAddAccountModal()" class="py-2 px-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold inline-flex items-center space-x-1.5 transition shadow-sm">
            <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Create First Account</span>
          </button>
        </div>
      `;
      return;
    }

    const typeIcons = {
      'savings': '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 3l9 5H3l9-5z"/></svg>',
      'current': '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6z"/></svg>',
      'cash': '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>',
      'credit_card': '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
      'wallet': '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><path d="M20 7h-7m-4 0H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 13h.01"/></svg>',
      'investment': '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>'
    };

    const typeBadgeStyles = {
      'savings': 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
      'current': 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
      'cash': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      'credit_card': 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800',
      'wallet': 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
      'investment': 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800'
    };

    this.state.accounts.forEach(acc => {
      const isCredit = acc.account_type === 'credit_card';
      const isNegative = acc.current_balance < 0;
      const isSavingsWallet = Boolean(acc.is_savings_wallet || acc.savings_goal_id);

      const icon = isSavingsWallet ?
        '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>' :
        (typeIcons[acc.account_type] || '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>');
      
      const badgeStyle = isSavingsWallet ?
        'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' :
        (typeBadgeStyles[acc.account_type] || 'bg-gray-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-gray-200');

      let balDisplay = `${this.state.user.currency}${Math.abs(acc.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      let balColor = 'text-slate-900 dark:text-white';
      let balSubtext = isSavingsWallet ? 'Dedicated Goal Savings' : 'Available Balance';

      if (isCredit) {
        balSubtext = acc.current_balance > 0 ? 'Outstanding Due' : 'Paid in Full';
        balColor = acc.current_balance > 0 ? 'text-accent-rose' : 'text-brand-600 dark:text-brand-400';
      } else if (isNegative) {
        balColor = 'text-accent-rose';
        balSubtext = 'Overdrawn';
      }

      const isDefaultBadge = acc.is_default ? `
        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
          PRIMARY
        </span>
      ` : '';

      const badgeLabel = isSavingsWallet ?
        `🎯 Goal: ${this.escapeHtml(acc.savings_goal_name || acc.name.replace('Savings Wallet – ', ''))}` :
        acc.type_label;

      const actionButtons = isSavingsWallet ? `
        <button onclick="MoneyTrackApp.openAddGoalMoneyModal(${acc.savings_goal_id})" title="Deposit money to this savings goal" class="p-1 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition">
          <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button onclick="MoneyTrackApp.openWithdrawGoalMoneyModal(${acc.savings_goal_id})" title="Withdraw money from this savings goal" class="p-1 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition">
          <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button onclick="MoneyTrackApp.filterByAccount(${acc.id})" title="Filter transactions for this wallet" class="p-1 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition">
          <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        </button>
        <button onclick="MoneyTrackApp.openDeleteGoalModal(${acc.savings_goal_id})" title="Delete savings goal & return money" class="p-1 rounded-lg text-slate-400 hover:text-accent-rose hover:bg-gray-100 dark:hover:bg-slate-800 transition">
          <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      ` : `
        <button onclick="MoneyTrackApp.openTransferModal(${acc.id})" title="Transfer money from this account" class="p-1 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition">
          <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"/></svg>
        </button>
        <button onclick="MoneyTrackApp.filterByAccount(${acc.id})" title="Filter transactions for this account" class="p-1 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition">
          <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
        </button>
        <button onclick="MoneyTrackApp.deleteAccount(${acc.id}, '${acc.name.replace(/'/g, "\\'")}')" title="Delete account" class="p-1 rounded-lg text-slate-400 hover:text-accent-rose hover:bg-gray-100 dark:hover:bg-slate-800 transition">
          <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      `;

      grid.innerHTML += `
        <div class="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 shadow-sm hover:border-brand-500/50 transition relative group flex flex-col justify-between">
          <div>
            <div class="flex items-start justify-between mb-2.5">
              <div class="flex items-center space-x-2.5">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style="background-color: ${acc.color}20; color: ${acc.color};">
                  ${icon}
                </div>
                <div>
                  <div class="font-bold text-xs text-slate-900 dark:text-white flex items-center space-x-1.5">
                    <span>${this.escapeHtml(acc.name)}</span>
                    ${isDefaultBadge}
                  </div>
                  <span class="inline-block mt-0.5 px-2 py-0.5 rounded border text-[10px] font-semibold ${badgeStyle}">
                    ${badgeLabel}
                  </span>
                </div>
              </div>
              <div class="flex items-center space-x-1">
                ${actionButtons}
              </div>
            </div>

            <div class="mt-2">
              <div class="text-[11px] text-slate-400 font-medium">${balSubtext}</div>
              <div class="text-xl font-black ${balColor} tracking-tight">
                ${isNegative ? '-' : ''}${balDisplay}
              </div>
            </div>
          </div>

          <div class="mt-3 pt-2.5 border-t border-gray-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
            <div>In: <span class="text-brand-600 dark:text-brand-400 font-semibold">+₹${acc.total_inflow.toLocaleString()}</span></div>
            <div>Out: <span class="text-slate-800 dark:text-slate-200 font-semibold">-₹${acc.total_outflow.toLocaleString()}</span></div>
          </div>
        </div>
      `;
    });
  },

  populateAccountSelects: function() {
    const filterSelect = document.getElementById('tx-account-filter');
    const formSelect = document.getElementById('tx-form-account');
    const editAccSelect = document.getElementById('edit-tx-account');
    const editDestSelect = document.getElementById('edit-tx-dest-account');
    const xferFrom = document.getElementById('transfer-form-from');
    const xferTo = document.getElementById('transfer-form-to');
    const goalAccount = document.getElementById('goal-form-account');
    const goalActionAcc = document.getElementById('goal-action-account');
    const addMoneySource = document.getElementById('add-goal-money-source');
    const withdrawDest = document.getElementById('withdraw-goal-money-dest');
    const deleteDest = document.getElementById('delete-goal-dest-account');

    if (filterSelect) {
      const curFilterVal = filterSelect.value || 'ALL';
      filterSelect.innerHTML = '<option value="ALL">All Accounts</option>';
      this.state.accounts.forEach(acc => {
        filterSelect.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (${acc.type_label})</option>`;
      });
      filterSelect.value = curFilterVal;
    }

    const calAccFilter = document.getElementById('calendar-account-filter');
    if (calAccFilter) {
      const curCalVal = calAccFilter.value || 'ALL';
      calAccFilter.innerHTML = '<option value="ALL">All Accounts & Wallets</option>';
      this.state.accounts.forEach(acc => {
        calAccFilter.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (${acc.type_label})</option>`;
      });
      calAccFilter.value = curCalVal;
    }

    const anaAccFilter = document.getElementById('analytics-account-filter');
    if (anaAccFilter) {
      const curAnaVal = anaAccFilter.value || 'ALL';
      anaAccFilter.innerHTML = '<option value="ALL">All Accounts & Wallets</option>';
      this.state.accounts.forEach(acc => {
        anaAccFilter.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (${acc.type_label})</option>`;
      });
      anaAccFilter.value = curAnaVal;
    }

    if (formSelect) {
      const curFormVal = formSelect.value;
      formSelect.innerHTML = '';
      if (this.state.accounts.length === 0) {
        formSelect.innerHTML = '<option value="">No account available - Create one first</option>';
      } else {
        this.state.accounts.forEach(acc => {
          formSelect.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (${acc.type_label})</option>`;
        });
        const defAcc = this.state.accounts.find(a => a.is_default) || this.state.accounts[0];
        if (curFormVal && this.state.accounts.some(a => String(a.id) === String(curFormVal))) {
          formSelect.value = curFormVal;
        } else if (defAcc) {
          formSelect.value = defAcc.id;
        }
      }
    }

    if (editAccSelect) {
      const curEditAcc = editAccSelect.value;
      editAccSelect.innerHTML = '';
      this.state.accounts.forEach(acc => {
        editAccSelect.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (${acc.type_label})</option>`;
      });
      if (curEditAcc && this.state.accounts.some(a => String(a.id) === String(curEditAcc))) {
        editAccSelect.value = curEditAcc;
      }
    }

    if (editDestSelect) {
      const curEditDest = editDestSelect.value;
      editDestSelect.innerHTML = '';
      this.state.accounts.forEach(acc => {
        editDestSelect.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (${acc.type_label})</option>`;
      });
      if (curEditDest && this.state.accounts.some(a => String(a.id) === String(curEditDest))) {
        editDestSelect.value = curEditDest;
      }
    }

    if (xferFrom && xferTo) {
      const curFrom = xferFrom.value;
      const curTo = xferTo.value;
      xferFrom.innerHTML = '';
      xferTo.innerHTML = '';
      this.state.accounts.forEach(acc => {
        xferFrom.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (${acc.type_label})</option>`;
        xferTo.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (${acc.type_label})</option>`;
      });
      if (curFrom && this.state.accounts.some(a => String(a.id) === String(curFrom))) {
        xferFrom.value = curFrom;
      }
      if (curTo && this.state.accounts.some(a => String(a.id) === String(curTo))) {
        xferTo.value = curTo;
      } else if (this.state.accounts.length > 1) {
        xferTo.selectedIndex = 1;
      }
    }

    // Funding source for goal creation (exclude other savings wallets and credit cards)
    if (goalAccount) {
      const curVal = goalAccount.value;
      goalAccount.innerHTML = '<option value="">Do not deduct from an account</option>';
      const fundAccounts = this.state.accounts.filter(a => !a.is_savings_wallet && a.account_type !== 'credit_card');
      fundAccounts.forEach(acc => {
        goalAccount.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (${this.state.user.currency}${acc.current_balance.toLocaleString('en-IN', {minimumFractionDigits: 2})})</option>`;
      });
      if (curVal && fundAccounts.some(a => String(a.id) === String(curVal))) {
        goalAccount.value = curVal;
      }
    }

    // Add Money source account
    if (addMoneySource) {
      const curVal = addMoneySource.value;
      addMoneySource.innerHTML = '';
      const fundAccounts = this.state.accounts.filter(a => !a.is_savings_wallet && a.account_type !== 'credit_card');
      if (fundAccounts.length === 0) {
        addMoneySource.innerHTML = '<option value="">No funding account available</option>';
      } else {
        fundAccounts.forEach(acc => {
          addMoneySource.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (Available: ${this.state.user.currency}${acc.current_balance.toLocaleString('en-IN', {minimumFractionDigits: 2})})</option>`;
        });
        if (curVal && fundAccounts.some(a => String(a.id) === String(curVal))) {
          addMoneySource.value = curVal;
        }
      }
    }

    // Withdraw destination account
    if (withdrawDest) {
      const curVal = withdrawDest.value;
      withdrawDest.innerHTML = '';
      const destAccounts = this.state.accounts.filter(a => !a.is_savings_wallet && a.account_type !== 'credit_card');
      if (destAccounts.length === 0) {
        withdrawDest.innerHTML = '<option value="">No destination account available</option>';
      } else {
        destAccounts.forEach(acc => {
          withdrawDest.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (${this.state.user.currency}${acc.current_balance.toLocaleString('en-IN', {minimumFractionDigits: 2})})</option>`;
        });
        if (curVal && destAccounts.some(a => String(a.id) === String(curVal))) {
          withdrawDest.value = curVal;
        }
      }
    }

    // Delete goal return destination account
    if (deleteDest) {
      const curVal = deleteDest.value;
      deleteDest.innerHTML = '';
      const returnAccounts = this.state.accounts.filter(a => !a.is_savings_wallet && a.account_type !== 'credit_card');
      if (returnAccounts.length === 0) {
        deleteDest.innerHTML = '<option value="">No return account available</option>';
      } else {
        returnAccounts.forEach(acc => {
          deleteDest.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (${acc.type_label} - ${this.state.user.currency}${acc.current_balance.toLocaleString('en-IN', {minimumFractionDigits: 2})})</option>`;
        });
        if (curVal && returnAccounts.some(a => String(a.id) === String(curVal))) {
          deleteDest.value = curVal;
        }
      }
    }

    if (goalActionAcc) {
      const curVal = goalActionAcc.value;
      goalActionAcc.innerHTML = '<option value="">Select Account / Wallet (Optional)</option>';
      this.state.accounts.forEach(acc => {
        goalActionAcc.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)} (${acc.type_label})</option>`;
      });
      if (curVal) goalActionAcc.value = curVal;
    }

    this.populateSimulatorAccounts();
  },

  openAddAccountModal: function() {
    document.getElementById('acc-form-name').value = '';
    document.getElementById('acc-form-type').value = 'savings';
    document.getElementById('acc-form-balance').value = '0.00';
    document.getElementById('acc-form-color').value = '#3B82F6';
    document.getElementById('acc-form-default').checked = false;
    this.openModal('add-account-modal');
  },

  submitAccountForm: function(e) {
    e.preventDefault();
    const name = document.getElementById('acc-form-name').value.trim();
    const account_type = document.getElementById('acc-form-type').value;
    const initial_balance = parseFloat(document.getElementById('acc-form-balance').value) || 0;
    const color = document.getElementById('acc-form-color').value;
    const is_default = document.getElementById('acc-form-default').checked;

    if (!name) {
      this.showToast('Validation Error', 'Please enter an account name.', 'warning');
      return;
    }

    fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        account_type,
        initial_balance,
        color,
        is_default
      })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.closeModal('add-account-modal');
        this.showToast('Account Created', `Account "${name}" created successfully with initial balance ₹${initial_balance.toLocaleString()}.`, 'success');
        this.refreshAllData();
      } else {
        this.showToast('Error', res.error || 'Failed to create account.', 'danger');
      }
    }).catch(err => {
      this.showToast('Error', 'Failed to save account.', 'danger');
    });
  },

  deleteAccount: function(accId, accName) {
    if (confirm(`Delete account "${accName}"? Any transactions assigned to this account will remain in your records.`)) {
      fetch('/api/accounts/' + accId, { method: 'DELETE' })
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            this.refreshAllData();
          } else {
            alert(res.error || 'Failed to delete account.');
          }
        });
    }
  },

  filterByAccount: function(accId) {
    const filterSelect = document.getElementById('tx-account-filter');
    if (filterSelect) {
      filterSelect.value = accId;
      this.renderTransactionsTable();
      const table = document.getElementById('transactions-table-body');
      if (table) table.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  },

  openTransferModal: function(preselectedFromId = null) {
    if (this.state.accounts.length < 2) {
      this.showToast('Transfer Requires 2 Accounts', 'Please create at least 2 accounts or wallets before making a transfer.', 'warning');
      return;
    }
    this.populateAccountSelects();
    if (preselectedFromId) {
      const fromEl = document.getElementById('transfer-form-from');
      if (fromEl) fromEl.value = String(preselectedFromId);
    }
    document.getElementById('transfer-form-amount').value = '';
    document.getElementById('transfer-form-desc').value = '';
    document.getElementById('transfer-form-date').value = new Date().toISOString().split('T')[0];
    const errEl = document.getElementById('transfer-form-error');
    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }
    this.openModal('transfer-modal');
  },

  submitTransferForm: function(e) {
    e.preventDefault();
    const fromId = parseInt(document.getElementById('transfer-form-from').value);
    const toId = parseInt(document.getElementById('transfer-form-to').value);
    const amount = parseFloat(document.getElementById('transfer-form-amount').value);
    const date = document.getElementById('transfer-form-date').value;
    const note = document.getElementById('transfer-form-desc').value.trim();
    const errEl = document.getElementById('transfer-form-error');

    if (!fromId || !toId || fromId === toId) {
      if (errEl) {
        errEl.textContent = 'Source and destination accounts must be different.';
        errEl.classList.remove('hidden');
      }
      this.showToast('Validation Error', 'Source and destination accounts must be different.', 'warning');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      if (errEl) {
        errEl.textContent = 'Please enter a valid transfer amount greater than 0.';
        errEl.classList.remove('hidden');
      }
      this.showToast('Validation Error', 'Please enter a valid transfer amount greater than 0.', 'warning');
      return;
    }

    fetch('/api/accounts/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_account_id: fromId,
        to_account_id: toId,
        amount: amount,
        date: date,
        note: note
      })
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          this.closeModal('transfer-modal');
          this.showToast('Transfer Completed', `Transferred ${this.state.user.currency}${amount.toLocaleString()} between accounts successfully.`, 'success');
          this.refreshAllData();
        } else {
          const errMsg = res.error || 'Failed to complete transfer.';
          if (errEl) {
            errEl.textContent = errMsg;
            errEl.classList.remove('hidden');
          }
          this.showToast('Transfer Error', errMsg, 'danger');
        }
      })
      .catch(err => {
        console.error('Transfer error:', err);
        const errMsg = 'An unexpected error occurred while executing the transfer.';
        if (errEl) {
          errEl.textContent = errMsg;
          errEl.classList.remove('hidden');
        }
        this.showToast('Transfer Failed', errMsg, 'danger');
      });
  },

  // ==========================================
  // Transactions Management
  // ==========================================
  filterTransactionsTab: function(tab) {
    this.state.transactionsFilter = tab;
    document.querySelectorAll('.money-tab-btn').forEach(btn => {
      btn.classList.remove('bg-brand-600', 'text-white');
      btn.classList.add('bg-gray-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-400');
    });
    const activeBtn = document.getElementById('tab-btn-' + tab);
    if (activeBtn) {
      activeBtn.classList.remove('bg-gray-100', 'dark:bg-slate-800', 'text-slate-600', 'dark:text-slate-400');
      activeBtn.classList.add('bg-brand-600', 'text-white');
    }
    this.renderTransactionsTable();
  },

  renderTransactionsTable: function() {
    const tbody = document.getElementById('transactions-table-body');
    const emptyState = document.getElementById('tx-empty-state');
    const search = (document.getElementById('tx-search-input').value || '').toLowerCase();
    const catFilter = document.getElementById('tx-category-filter').value;
    const accFilter = document.getElementById('tx-account-filter') ? document.getElementById('tx-account-filter').value : 'ALL';

    tbody.innerHTML = '';

    const typeIcons = {
      'savings': '<svg class="w-3.5 h-3.5 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 3l9 5H3l9-5z"/></svg>',
      'current': '<svg class="w-3.5 h-3.5 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6z"/></svg>',
      'cash': '<svg class="w-3.5 h-3.5 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg>',
      'credit_card': '<svg class="w-3.5 h-3.5 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
      'wallet': '<svg class="w-3.5 h-3.5 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><path d="M20 7h-7m-4 0H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 13h.01"/></svg>',
      'investment': '<svg class="w-3.5 h-3.5 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>'
    };

    let filtered = this.state.transactions.filter(tx => {
      if (this.state.transactionsFilter === 'income' && tx.type !== 'income') return false;
      if (this.state.transactionsFilter === 'expense' && tx.type !== 'expense') return false;
      if (this.state.transactionsFilter === 'transfer' && tx.type !== 'transfer') return false;
      if (this.state.transactionsFilter === 'subscriptions' && !(tx.category === 'Bills & Utilities' || tx.description.toLowerCase().includes('pass') || tx.description.toLowerCase().includes('sub'))) return false;
      if (catFilter !== 'ALL' && tx.category !== catFilter) return false;
      if (accFilter !== 'ALL' && String(tx.account_id) !== String(accFilter) && String(tx.destination_account_id) !== String(accFilter)) return false;
      if (search && !tx.description.toLowerCase().includes(search) && !tx.category.toLowerCase().includes(search) && !(tx.account_name && tx.account_name.toLowerCase().includes(search))) return false;
      return true;
    });

    if (filtered.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    } else {
      emptyState.classList.add('hidden');
    }

    filtered.forEach(tx => {
      const isIncome = tx.type === 'income';
      const isTransfer = tx.type === 'transfer';
      const sourceName = tx.source_account_name || tx.account_name || 'Account';
      const destName = tx.dest_account_name || tx.dest_name || 'Destination';
      const sourceIcon = typeIcons[tx.account_type] || '<svg class="w-3.5 h-3.5 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
      const destIcon = typeIcons[tx.dest_type] || '<svg class="w-3.5 h-3.5 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';

      let amtDisplay = '';
      let amtColor = '';
      let tagHtml = '';
      let accountHtml = '';

      if (isTransfer) {
        if (accFilter !== 'ALL') {
          if (String(tx.account_id) === String(accFilter)) {
            // Outgoing transfer from active filtered account
            amtDisplay = `-${this.state.user.currency}${parseFloat(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            amtColor = 'text-slate-900 dark:text-white font-bold';
            tagHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">Transfer Out</span>`;
            accountHtml = `
              <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
                <span class="text-slate-400 font-medium">To:</span>
                <span>${destIcon}</span>
                <span>${this.escapeHtml(destName)}</span>
              </span>
            `;
          } else {
            // Incoming transfer to active filtered account
            amtDisplay = `+${this.state.user.currency}${parseFloat(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            amtColor = 'text-brand-600 dark:text-brand-400 font-bold';
            tagHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-800">Transfer In</span>`;
            accountHtml = `
              <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                <span class="text-slate-400 font-medium">From:</span>
                <span>${sourceIcon}</span>
                <span>${this.escapeHtml(sourceName)}</span>
              </span>
            `;
          }
        } else {
          // All accounts transfer display
          amtDisplay = `↔ ${this.state.user.currency}${parseFloat(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          amtColor = 'text-blue-600 dark:text-blue-400 font-bold';
          tagHtml = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">Transfer</span>`;
          accountHtml = `
            <div class="flex items-center space-x-1 text-[10px]">
              <span class="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded font-medium bg-gray-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
                <span>${sourceIcon}</span>
                <span>${this.escapeHtml(sourceName)}</span>
              </span>
              <span class="text-slate-400 font-bold">→</span>
              <span class="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <span>${destIcon}</span>
                <span>${this.escapeHtml(destName)}</span>
              </span>
            </div>
          `;
        }
      } else if (isIncome) {
        amtDisplay = `+${this.state.user.currency}${parseFloat(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        amtColor = 'text-brand-600 dark:text-brand-400 font-bold';
        tagHtml = `<span class="capitalize text-slate-500">Income</span>`;
        accountHtml = `
          <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
            <span>${sourceIcon}</span>
            <span>${this.escapeHtml(sourceName)}</span>
          </span>
        `;
      } else {
        // Regular expense
        amtDisplay = `-${this.state.user.currency}${parseFloat(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        amtColor = 'text-slate-900 dark:text-white font-bold';
        tagHtml = `<span class="capitalize text-slate-500">${this.escapeHtml(tx.typeTag || 'expense')}</span>`;
        accountHtml = `
          <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
            <span>${sourceIcon}</span>
            <span>${this.escapeHtml(sourceName)}</span>
          </span>
        `;
      }

      tbody.innerHTML += `
        <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-900/40 transition">
          <td class="py-3 px-4 font-medium text-slate-500">${this.escapeHtml(tx.date)}</td>
          <td class="py-3 px-4 font-semibold text-slate-900 dark:text-white">${this.escapeHtml(tx.description)}</td>
          <td class="py-3 px-4"><span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${this.escapeHtml(tx.category)}</span></td>
          <td class="py-3 px-4">${accountHtml}</td>
          <td class="py-3 px-4">${tagHtml}</td>
          <td class="py-3 px-4 text-right ${amtColor}">${amtDisplay}</td>
          <td class="py-3 px-4 text-center">
            <button onclick="MoneyTrackApp.openEditTransactionModal('${tx.id}')" class="p-1 rounded text-slate-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition mr-1" title="Edit Transaction">
              <svg class="w-4 h-4 stroke-current fill-none stroke-2 inline" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button onclick="MoneyTrackApp.deleteTransaction('${tx.id}')" class="p-1 rounded text-slate-400 hover:text-accent-rose hover:bg-gray-100 dark:hover:bg-slate-800 transition" title="Delete Transaction">
              <svg class="w-4 h-4 stroke-current fill-none stroke-2 inline" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    });
  },

  openAddTransactionModal: function(type) {
    // Check if user has accounts created
    if (this.state.accounts.length === 0) {
      this.openModal('account-required-modal');
      return;
    }

    document.getElementById('tx-form-type').value = type;
    document.getElementById('tx-modal-title').textContent = type === 'income' ? 'Add Income' : 'Add Expense';
    document.getElementById('tx-form-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('tx-form-amount').value = '';
    document.getElementById('tx-form-desc').value = '';

    const descInput = document.getElementById('tx-form-desc');
    const amountInput = document.getElementById('tx-form-amount');
    const necContainer = document.getElementById('tx-form-necessity-container');
    const warningEl = document.getElementById('tx-no-account-warning');
    const submitBtn = document.getElementById('tx-form-submit-btn');

    if (warningEl) warningEl.classList.add('hidden');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    }

    // Set context-specific placeholders and necessity classification
    if (type === 'income') {
      if (descInput) descInput.placeholder = 'e.g. Monthly Salary, Freelance Payment, Rental Income, Investment Dividend';
      if (amountInput) amountInput.placeholder = '50000.00';
      if (necContainer) necContainer.classList.add('hidden');
    } else {
      if (descInput) descInput.placeholder = 'e.g. Grocery Shopping, Electric Bill, Restaurant Dinner, Fuel';
      if (amountInput) amountInput.placeholder = '1500.00';
      if (necContainer) necContainer.classList.remove('hidden');
    }

    // Populate category dropdown based on type
    const catSelect = document.getElementById('tx-form-category');
    if (catSelect) {
      catSelect.innerHTML = '';
      if (type === 'income') {
        const incomeCats = ['Salary', 'Freelance', 'Investments', 'Rental', 'Bonus', 'Gifts', 'Other Income'];
        incomeCats.forEach(c => {
          catSelect.innerHTML += `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)}</option>`;
        });
      } else {
        const expenseCats = ['Housing', 'Food & Dining', 'Transportation', 'Bills & Utilities', 'Healthcare', 'Entertainment', 'Shopping', 'Personal', 'Education', 'Debt & Loans', 'Savings & Investments', 'Other'];
        expenseCats.forEach(c => {
          catSelect.innerHTML += `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)}</option>`;
        });
      }
    }

    this.populateAccountSelects();
    this.openModal('add-tx-modal');
  },

  submitTransactionForm: function(e) {
    e.preventDefault();
    if (this.state.accounts.length === 0) {
      this.closeModal('add-tx-modal');
      this.openModal('account-required-modal');
      return;
    }

    const type = document.getElementById('tx-form-type').value;
    const amount = parseFloat(document.getElementById('tx-form-amount').value);
    const desc = document.getElementById('tx-form-desc').value.trim();
    const category = document.getElementById('tx-form-category').value;
    const date = document.getElementById('tx-form-date').value;
    const typeTagInput = document.querySelector('input[name="tx_type_tag"]:checked');
    const typeTag = type === 'income' ? 'necessary' : (typeTagInput ? typeTagInput.value : 'necessary');
    const accountEl = document.getElementById('tx-form-account');
    const account_id = accountEl && accountEl.value ? parseInt(accountEl.value) : null;

    if (!account_id) {
      this.showToast('Account Required', 'Please select or create an account or wallet first.', 'warning');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      this.showToast('Validation Error', 'Please enter a valid amount greater than 0.', 'warning');
      return;
    }
    if (!desc) {
      this.showToast('Validation Error', 'Please enter a transaction description.', 'warning');
      return;
    }

    fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount, description: desc, category, date, typeTag, account_id })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.closeModal('add-tx-modal');
        this.showToast('Transaction Saved', `${type === 'income' ? 'Income' : 'Expense'} of ${this.state.user.currency}${amount.toLocaleString()} saved.`, 'success');
        this.refreshAllData();
      } else {
        this.showToast('Error', res.error || 'Failed to save transaction.', 'danger');
      }
    }).catch(err => {
      this.showToast('Error', 'Failed to save transaction.', 'danger');
    });
  },

  // ==========================================
  // Complete Transaction Editing Custom GUI
  // ==========================================
  openEditTransactionModal: function(id) {
    const tx = this.state.transactions.find(t => String(t.id) === String(id));
    if (!tx) {
      this.showToast('Error', 'Transaction not found.', 'danger');
      return;
    }

    this.populateAccountSelects();

    document.getElementById('edit-tx-id').value = tx.id;
    document.getElementById('edit-tx-type').value = tx.type;
    document.getElementById('edit-tx-amount').value = tx.amount;
    document.getElementById('edit-tx-desc').value = tx.description;
    document.getElementById('edit-tx-date').value = tx.date;

    const titleEl = document.getElementById('edit-tx-modal-title');
    const catGroup = document.getElementById('edit-tx-category-group');
    const catSelect = document.getElementById('edit-tx-category');
    const accLabel = document.getElementById('edit-tx-account-label');
    const accSelect = document.getElementById('edit-tx-account');
    const destContainer = document.getElementById('edit-tx-dest-account-container');
    const destSelect = document.getElementById('edit-tx-dest-account');
    const necContainer = document.getElementById('edit-tx-necessity-container');
    const errEl = document.getElementById('edit-tx-error');

    if (errEl) {
      errEl.textContent = '';
      errEl.classList.add('hidden');
    }

    // Set accounts
    if (accSelect && tx.account_id) {
      accSelect.value = String(tx.account_id);
    }

    if (tx.type === 'transfer') {
      if (titleEl) titleEl.textContent = 'Edit Transfer';
      if (accLabel) accLabel.textContent = 'Source Account / Wallet (From)';
      if (destContainer) destContainer.classList.remove('hidden');
      if (destSelect && tx.destination_account_id) {
        destSelect.value = String(tx.destination_account_id);
      }
      if (necContainer) necContainer.classList.add('hidden');
      if (catGroup) catGroup.classList.add('hidden');
    } else {
      if (destContainer) destContainer.classList.add('hidden');
      if (catGroup) catGroup.classList.remove('hidden');

      if (tx.type === 'income') {
        if (titleEl) titleEl.textContent = 'Edit Income';
        if (accLabel) accLabel.textContent = 'Account / Wallet';
        if (necContainer) necContainer.classList.add('hidden');
        if (catSelect) {
          catSelect.innerHTML = '';
          const incomeCats = ['Salary', 'Freelance', 'Investments', 'Rental', 'Bonus', 'Gifts', 'Other Income'];
          incomeCats.forEach(c => {
            catSelect.innerHTML += `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)}</option>`;
          });
          catSelect.value = tx.category || 'Salary';
        }
      } else {
        if (titleEl) titleEl.textContent = 'Edit Expense';
        if (accLabel) accLabel.textContent = 'Account / Wallet';
        if (necContainer) {
          necContainer.classList.remove('hidden');
          const radios = document.querySelectorAll('input[name="edit_tx_type_tag"]');
          radios.forEach(r => {
            r.checked = (r.value === (tx.typeTag || 'necessary'));
          });
        }
        if (catSelect) {
          catSelect.innerHTML = '';
          const expenseCats = ['Housing', 'Food & Dining', 'Transportation', 'Bills & Utilities', 'Healthcare', 'Entertainment', 'Shopping', 'Personal', 'Education', 'Debt & Loans', 'Savings & Investments', 'Other'];
          expenseCats.forEach(c => {
            catSelect.innerHTML += `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)}</option>`;
          });
          catSelect.value = tx.category || 'Food & Dining';
        }
      }
    }

    this.openModal('edit-tx-modal');
  },

  submitEditTransactionForm: function(e) {
    e.preventDefault();
    const id = document.getElementById('edit-tx-id').value;
    const type = document.getElementById('edit-tx-type').value;
    const amount = parseFloat(document.getElementById('edit-tx-amount').value);
    const description = document.getElementById('edit-tx-desc').value.trim();
    const date = document.getElementById('edit-tx-date').value;
    const account_id = parseInt(document.getElementById('edit-tx-account').value);
    const destSelect = document.getElementById('edit-tx-dest-account');
    const destination_account_id = (type === 'transfer' && destSelect) ? parseInt(destSelect.value) : null;
    const catSelect = document.getElementById('edit-tx-category');
    const category = type === 'transfer' ? 'Transfer' : (catSelect ? catSelect.value : 'Other');
    const tagRadio = document.querySelector('input[name="edit_tx_type_tag"]:checked');
    const typeTag = type === 'income' ? 'necessary' : (tagRadio ? tagRadio.value : 'necessary');
    const errEl = document.getElementById('edit-tx-error');

    if (isNaN(amount) || amount <= 0) {
      if (errEl) {
        errEl.textContent = 'Please enter a valid amount greater than 0.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (!description) {
      if (errEl) {
        errEl.textContent = 'Please enter a description.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (!account_id) {
      if (errEl) {
        errEl.textContent = 'Please select an account or wallet.';
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (type === 'transfer' && (!destination_account_id || account_id === destination_account_id)) {
      if (errEl) {
        errEl.textContent = 'Source and destination accounts must be different.';
        errEl.classList.remove('hidden');
      }
      return;
    }

    fetch('/api/transactions/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        amount,
        date,
        category,
        type,
        typeTag,
        account_id,
        destination_account_id
      })
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          this.closeModal('edit-tx-modal');
          this.showToast('Transaction Updated', 'Transaction record and balances updated successfully.', 'success');
          this.refreshAllData();
        } else {
          const errMsg = res.error || 'Failed to update transaction.';
          if (errEl) {
            errEl.textContent = errMsg;
            errEl.classList.remove('hidden');
          }
          this.showToast('Error', errMsg, 'danger');
        }
      })
      .catch(err => {
        console.error('Update error:', err);
        const errMsg = 'An unexpected error occurred while updating the transaction.';
        if (errEl) {
          errEl.textContent = errMsg;
          errEl.classList.remove('hidden');
        }
        this.showToast('Error', errMsg, 'danger');
      });
  },

  promptEditTransaction: function(id) {
    this.openEditTransactionModal(id);
  },

  deleteTransaction: function(id) {
    if (confirm('Delete this transaction?')) {
      fetch('/api/transactions/' + id, { method: 'DELETE' })
        .then(r => r.json())
        .then(() => {
          this.showToast('Transaction Deleted', 'Transaction removed from ledger.', 'info');
          this.refreshAllData();
        });
    }
  },

  promptSetBudget: function(category, currentLimit) {
    this.openBudgetManagerModal();
    const catSelect = document.getElementById('budget-form-category');
    if (catSelect) catSelect.value = category;
    const limitInput = document.getElementById('budget-form-limit');
    if (limitInput) limitInput.value = currentLimit;
  },

  // Goals
  renderGoals: function() {
    const container = document.getElementById('goals-grid-container');
    if (!container) return;
    container.innerHTML = '';

    if (this.state.goals.length === 0) {
      container.innerHTML = `
        <div class="col-span-full p-8 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 text-center text-xs text-slate-400 space-y-3">
          <div class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
            <svg class="w-5 h-5 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
          </div>
          <p class="font-semibold text-slate-700 dark:text-slate-300">No savings goals set yet.</p>
          <p class="max-w-xs mx-auto text-[11px]">Set a target, create a dedicated savings wallet, and fund your financial goals systematically.</p>
          <button onclick="MoneyTrackApp.openModal('add-goal-modal')" class="py-2 px-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold inline-flex items-center space-x-1.5 transition shadow-sm">
            <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Create First Goal</span>
          </button>
        </div>
      `;
      return;
    }

    this.state.goals.forEach(goal => {
      const isCompleted = goal.status === 'completed' || goal.pct >= 100;
      const statusBadge = isCompleted ? `
        <span class="px-2 py-0.5 rounded border text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
          COMPLETED
        </span>
      ` : `
        <span class="text-xs font-bold text-brand-600 dark:text-brand-400">${goal.pct}%</span>
      `;

      container.innerHTML += `
        <div class="p-6 rounded-2xl bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 space-y-4 flex flex-col justify-between shadow-sm hover:border-brand-500/40 transition">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-bold text-slate-900 dark:text-white text-base">${this.escapeHtml(goal.name)}</h3>
                ${goal.description ? `<p class="text-[11px] text-slate-400 truncate max-w-[220px] mt-0.5">${this.escapeHtml(goal.description)}</p>` : ''}
              </div>
              ${statusBadge}
            </div>

            <div class="text-xl font-bold text-slate-900 dark:text-white">
              ${this.state.user.currency}${goal.currentAmount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
              <span class="text-xs text-slate-400 font-normal">/ ${this.state.user.currency}${goal.targetAmount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
            </div>

            <div class="w-full bg-gray-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div class="${isCompleted ? 'bg-emerald-500' : 'bg-brand-500'} h-full transition-all duration-500" style="width: ${goal.pct}%"></div>
            </div>

            <div class="flex justify-between text-xs text-slate-400 pt-1">
              <span>${this.state.user.currency}${goal.remaining.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})} remaining</span>
              <span>Target: ${goal.date}</span>
            </div>
          </div>

          <div class="flex items-center space-x-2 pt-2 border-t border-gray-100 dark:border-slate-800">
            <button onclick="MoneyTrackApp.openAddGoalMoneyModal('${goal.id}')" class="flex-1 py-2 px-2.5 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 text-xs font-semibold hover:bg-brand-100 dark:hover:bg-brand-900/50 transition flex items-center justify-center space-x-1">
              <svg class="w-3.5 h-3.5 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Add Money</span>
            </button>
            <button onclick="MoneyTrackApp.openWithdrawGoalMoneyModal('${goal.id}')" class="flex-1 py-2 px-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition flex items-center justify-center space-x-1" title="Withdraw Funds">
              <svg class="w-3.5 h-3.5 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Withdraw</span>
            </button>
            <button onclick="MoneyTrackApp.openEditGoalModal('${goal.id}')" class="p-2 rounded-xl text-slate-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition" title="Edit Goal">
              <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button onclick="MoneyTrackApp.openDeleteGoalModal('${goal.id}')" class="p-2 rounded-xl text-slate-400 hover:text-accent-rose hover:bg-gray-100 dark:hover:bg-slate-800 transition" title="Delete Goal & Return Funds">
              <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    });
  },

  submitGoalForm: function(e) {
    e.preventDefault();
    const name = document.getElementById('goal-form-name').value.trim();
    const targetAmount = parseFloat(document.getElementById('goal-form-target').value);
    const currentAmount = parseFloat(document.getElementById('goal-form-current').value || 0);
    const date = document.getElementById('goal-form-date').value;
    const descEl = document.getElementById('goal-form-desc');
    const description = descEl ? descEl.value.trim() : '';
    const accEl = document.getElementById('goal-form-account');
    const account_id = accEl && accEl.value ? parseInt(accEl.value) : null;

    if (!name) {
      this.showToast('Please enter a goal name.', 'warning');
      return;
    }
    if (isNaN(targetAmount) || targetAmount <= 0) {
      this.showToast('Please enter a valid target amount greater than zero.', 'warning');
      return;
    }
    if (currentAmount > 0 && !account_id) {
      if (this.state.accounts.length === 0) {
        this.showToast('You must create an Account or Wallet first to fund a savings goal.', 'warning');
        return;
      }
    }

    fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, targetAmount, currentAmount, date, account_id, description })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.closeModal('add-goal-modal');
        this.showToast(`Savings Goal "${name}" created with dedicated savings wallet!`, 'success');
        this.refreshAllData();
      } else {
        this.showToast(res.error || 'Failed to create goal', 'danger');
      }
    }).catch(err => {
      console.error('Goal creation error:', err);
      this.showToast('An unexpected network error occurred.', 'danger');
    });
  },

  openAddGoalMoneyModal: function(goalId) {
    const goal = this.state.goals.find(g => String(g.id) === String(goalId));
    if (!goal) return;

    this.populateAccountSelects();
    document.getElementById('add-goal-money-id').value = goalId;
    document.getElementById('add-goal-money-subtitle').textContent = `Deposit savings into ${goal.name}`;
    document.getElementById('add-goal-money-current').textContent = `${this.state.user.currency}${goal.currentAmount.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    document.getElementById('add-goal-money-target').textContent = `${this.state.user.currency}${goal.targetAmount.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    document.getElementById('add-goal-money-amount').value = '';
    const descEl = document.getElementById('add-goal-money-desc');
    if (descEl) descEl.value = '';

    // If goal had a funding account, preselect it if available
    if (goal.funding_account_id) {
      const srcEl = document.getElementById('add-goal-money-source');
      if (srcEl && Array.from(srcEl.options).some(o => String(o.value) === String(goal.funding_account_id))) {
        srcEl.value = String(goal.funding_account_id);
      }
    }

    this.openModal('add-goal-money-modal');
  },

  submitAddGoalMoney: function(e) {
    e.preventDefault();
    const goalId = document.getElementById('add-goal-money-id').value;
    const amount = parseFloat(document.getElementById('add-goal-money-amount').value);
    const sourceEl = document.getElementById('add-goal-money-source');
    const account_id = sourceEl && sourceEl.value ? parseInt(sourceEl.value) : null;
    const descEl = document.getElementById('add-goal-money-desc');
    const note = descEl ? descEl.value.trim() : '';

    if (isNaN(amount) || amount <= 0) {
      this.showToast('Please enter a valid deposit amount greater than zero.', 'warning');
      return;
    }
    if (!account_id) {
      this.showToast('Please select a source account or wallet to fund the deposit.', 'warning');
      return;
    }

    const sourceAcc = this.state.accounts.find(a => String(a.id) === String(account_id));
    if (sourceAcc && amount > sourceAcc.current_balance) {
      this.showToast(`Insufficient balance in ${sourceAcc.name}. Available: ${this.state.user.currency}${sourceAcc.current_balance.toLocaleString('en-IN', {minimumFractionDigits: 2})}`, 'danger');
      return;
    }

    fetch(`/api/goals/${goalId}/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, account_id, note })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.closeModal('add-goal-money-modal');
        this.showToast(`Successfully deposited ${this.state.user.currency}${amount.toLocaleString()} into savings!`, 'success');
        this.refreshAllData();
      } else {
        this.showToast(res.error || 'Failed to deposit funds.', 'danger');
      }
    }).catch(err => {
      console.error('Goal deposit error:', err);
      this.showToast('An unexpected network error occurred.', 'danger');
    });
  },

  openWithdrawGoalMoneyModal: function(goalId) {
    const goal = this.state.goals.find(g => String(g.id) === String(goalId));
    if (!goal) return;

    this.populateAccountSelects();
    document.getElementById('withdraw-goal-money-id').value = goalId;
    document.getElementById('withdraw-goal-money-subtitle').textContent = `Withdraw funds from ${goal.name}`;
    document.getElementById('withdraw-goal-money-available').textContent = `${this.state.user.currency}${goal.currentAmount.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
    document.getElementById('withdraw-goal-money-amount').value = '';
    const descEl = document.getElementById('withdraw-goal-money-desc');
    if (descEl) descEl.value = '';

    // If goal had a funding account, preselect as destination
    if (goal.funding_account_id) {
      const destEl = document.getElementById('withdraw-goal-money-dest');
      if (destEl && Array.from(destEl.options).some(o => String(o.value) === String(goal.funding_account_id))) {
        destEl.value = String(goal.funding_account_id);
      }
    }

    this.openModal('withdraw-goal-money-modal');
  },

  submitWithdrawGoalMoney: function(e) {
    e.preventDefault();
    const goalId = document.getElementById('withdraw-goal-money-id').value;
    const amount = parseFloat(document.getElementById('withdraw-goal-money-amount').value);
    const destEl = document.getElementById('withdraw-goal-money-dest');
    const account_id = destEl && destEl.value ? parseInt(destEl.value) : null;
    const descEl = document.getElementById('withdraw-goal-money-desc');
    const note = descEl ? descEl.value.trim() : '';

    const goal = this.state.goals.find(g => String(g.id) === String(goalId));
    if (!goal) return;

    if (isNaN(amount) || amount <= 0) {
      this.showToast('Please enter a valid withdrawal amount greater than zero.', 'warning');
      return;
    }
    if (amount > goal.currentAmount) {
      this.showToast(`Cannot withdraw ${this.state.user.currency}${amount.toLocaleString()}: exceeds available savings of ${this.state.user.currency}${goal.currentAmount.toLocaleString()}.`, 'danger');
      return;
    }
    if (!account_id) {
      this.showToast('Please select a destination account or wallet.', 'warning');
      return;
    }

    fetch(`/api/goals/${goalId}/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, account_id, note })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.closeModal('withdraw-goal-money-modal');
        this.showToast(`Successfully withdrew ${this.state.user.currency}${amount.toLocaleString()} from savings!`, 'success');
        this.refreshAllData();
      } else {
        this.showToast(res.error || 'Failed to withdraw funds.', 'danger');
      }
    }).catch(err => {
      console.error('Goal withdraw error:', err);
      this.showToast('An unexpected network error occurred.', 'danger');
    });
  },

  openEditGoalModal: function(goalId) {
    const goal = this.state.goals.find(g => String(g.id) === String(goalId));
    if (!goal) return;

    document.getElementById('edit-goal-id').value = goalId;
    document.getElementById('edit-goal-name').value = goal.name || '';
    document.getElementById('edit-goal-target').value = goal.targetAmount || '';
    document.getElementById('edit-goal-date').value = goal.date || '';
    const descEl = document.getElementById('edit-goal-desc');
    if (descEl) descEl.value = goal.description || '';

    this.openModal('edit-goal-modal');
  },

  submitEditGoal: function(e) {
    e.preventDefault();
    const goalId = document.getElementById('edit-goal-id').value;
    const name = document.getElementById('edit-goal-name').value.trim();
    const targetAmount = parseFloat(document.getElementById('edit-goal-target').value);
    const date = document.getElementById('edit-goal-date').value;
    const descEl = document.getElementById('edit-goal-desc');
    const description = descEl ? descEl.value.trim() : '';

    if (!name) {
      this.showToast('Please enter a goal title.', 'warning');
      return;
    }
    if (isNaN(targetAmount) || targetAmount <= 0) {
      this.showToast('Please enter a valid positive target amount.', 'warning');
      return;
    }

    fetch(`/api/goals/${goalId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, targetAmount, date, description })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.closeModal('edit-goal-modal');
        this.showToast('Savings goal updated successfully!', 'success');
        this.refreshAllData();
      } else {
        this.showToast(res.error || 'Failed to update goal.', 'danger');
      }
    }).catch(err => {
      console.error('Goal update error:', err);
      this.showToast('An unexpected network error occurred.', 'danger');
    });
  },

  openDeleteGoalModal: function(goalId) {
    const goal = this.state.goals.find(g => String(g.id) === String(goalId));
    if (!goal) return;

    this.populateAccountSelects();
    document.getElementById('delete-goal-id').value = goalId;
    document.getElementById('delete-goal-subtitle').textContent = `Delete goal "${goal.name}"`;

    const banner = document.getElementById('delete-goal-balance-banner');
    const destContainer = document.getElementById('delete-goal-dest-container');
    const confirmBtn = document.getElementById('delete-goal-confirm-btn');
    const balDisplay = document.getElementById('delete-goal-balance-display');

    if (goal.currentAmount > 0) {
      if (banner) banner.classList.remove('hidden');
      if (destContainer) destContainer.classList.remove('hidden');
      if (balDisplay) balDisplay.textContent = `${this.state.user.currency}${goal.currentAmount.toLocaleString('en-IN', {minimumFractionDigits: 2})}`;
      if (confirmBtn) confirmBtn.textContent = 'Return Funds & Delete Goal';

      // Pre-select funding account if available
      if (goal.funding_account_id) {
        const sel = document.getElementById('delete-goal-dest-account');
        if (sel && Array.from(sel.options).some(o => String(o.value) === String(goal.funding_account_id))) {
          sel.value = String(goal.funding_account_id);
        }
      }
    } else {
      if (banner) banner.classList.add('hidden');
      if (destContainer) destContainer.classList.add('hidden');
      if (confirmBtn) confirmBtn.textContent = 'Delete Goal';
    }

    this.openModal('delete-goal-modal');
  },

  submitDeleteGoal: function(e) {
    e.preventDefault();
    const goalId = document.getElementById('delete-goal-id').value;
    const destEl = document.getElementById('delete-goal-dest-account');
    const destination_account_id = destEl && destEl.value ? parseInt(destEl.value) : null;

    fetch(`/api/goals/${goalId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ destination_account_id })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.closeModal('delete-goal-modal');
        this.showToast('Savings goal deleted and remaining funds safely returned.', 'success');
        this.refreshAllData();
      } else {
        this.showToast(res.error || 'Failed to delete goal.', 'danger');
      }
    }).catch(err => {
      console.error('Goal delete error:', err);
      this.showToast('An unexpected network error occurred.', 'danger');
    });
  },

  // Legacy & Backward Compatibility Wrappers
  openGoalActionModal: function(goalId, actionType) {
    if (actionType === 'deposit') {
      this.openAddGoalMoneyModal(goalId);
    } else {
      this.openWithdrawGoalMoneyModal(goalId);
    }
  },

  submitGoalAction: function(e) {
    e.preventDefault();
    const actionType = document.getElementById('goal-action-type')?.value;
    if (actionType === 'deposit') {
      this.submitAddGoalMoney(e);
    } else {
      this.submitWithdrawGoalMoney(e);
    }
  },

  promptEditGoal: function(id) {
    this.openEditGoalModal(id);
  },

  deleteGoal: function(id) {
    this.openDeleteGoalModal(id);
  },

  // ==========================================
  // MONEY CALENDAR (Redesigned & Real-Time)
  // ==========================================
  initCalendar: function() {
    const today = new Date();
    this.state.calendarState.year = today.getFullYear();
    this.state.calendarState.month = today.getMonth() + 1;
    this.state.calendarState.selectedDate = this.formatDateIso(today);
  },

  formatDateIso: function(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  loadCalendarView: function() {
    const s = this.state.calendarState;
    const url = `/api/calendar/month?year=${s.year}&month=${s.month}&account_id=${s.accountId || 'ALL'}&type=${s.txType || 'all'}`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        this.state.calendarState.data = data;
        const curMonthEl = document.getElementById('cal-current-month-display');
        if (curMonthEl) curMonthEl.textContent = `${data.month_name} ${data.year}`;

        // Monthly Summary Badges
        const incEl = document.getElementById('cal-month-income');
        const expEl = document.getElementById('cal-month-expenses');
        const netEl = document.getElementById('cal-month-net');
        const cntEl = document.getElementById('cal-month-tx-count');

        if (incEl) incEl.textContent = `+${data.currency}${Number(data.month_summary.income || 0).toLocaleString()}`;
        if (expEl) expEl.textContent = `-${data.currency}${Number(data.month_summary.expenses || 0).toLocaleString()}`;
        if (netEl) {
          const net = Number(data.month_summary.net_cashflow || 0);
          netEl.textContent = `${net >= 0 ? '+' : ''}${data.currency}${net.toLocaleString()}`;
        }
        if (cntEl) cntEl.textContent = String(data.month_summary.transaction_count || 0);

        this.renderCalendarGrid(data);

        // If no date selected or selected date is not in this month, select 1st or today
        const todayStr = this.formatDateIso(new Date());
        let dateToSelect = this.state.calendarState.selectedDate;
        if (!dateToSelect || !dateToSelect.startsWith(data.month_year)) {
          if (todayStr.startsWith(data.month_year)) {
            dateToSelect = todayStr;
          } else {
            dateToSelect = `${data.month_year}-01`;
          }
        }
        this.selectCalendarDate(dateToSelect);
      })
      .catch(err => {
        console.error("Error loading calendar data:", err);
      });
  },

  navigateCalendarMonth: function(delta) {
    let y = this.state.calendarState.year;
    let m = this.state.calendarState.month + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    this.state.calendarState.year = y;
    this.state.calendarState.month = m;
    this.loadCalendarView();
  },

  setCalendarToday: function() {
    const today = new Date();
    this.state.calendarState.year = today.getFullYear();
    this.state.calendarState.month = today.getMonth() + 1;
    this.state.calendarState.selectedDate = this.formatDateIso(today);
    this.loadCalendarView();
  },

  onCalendarAccountChange: function(val) {
    this.state.calendarState.accountId = val;
    this.loadCalendarView();
  },

  onCalendarTypeChange: function(val) {
    this.state.calendarState.txType = val;
    this.loadCalendarView();
  },

  selectCalendarDate: function(dateStr) {
    this.state.calendarState.selectedDate = dateStr;
    const cells = document.querySelectorAll('.calendar-day-cell');
    cells.forEach(c => {
      if (c.getAttribute('data-date') === dateStr) {
        c.classList.add('border-brand-500', 'bg-brand-50/50', 'dark:bg-brand-950/30', 'ring-1', 'ring-brand-500');
        c.classList.remove('border-gray-100', 'dark:border-slate-800');
      } else {
        c.classList.remove('border-brand-500', 'bg-brand-50/50', 'dark:bg-brand-950/30', 'ring-1', 'ring-brand-500');
        c.classList.add('border-gray-100', 'dark:border-slate-800');
      }
    });

    this.renderCalendarSelectedDate(dateStr);
  },

  renderCalendarGrid: function(data) {
    const container = document.getElementById('calendar-grid-cells');
    if (!container) return;
    container.innerHTML = '';

    const todayStr = this.formatDateIso(new Date());

    // 1. Padding days for Sunday-first calendar
    for (let i = 0; i < data.first_weekday; i++) {
      container.innerHTML += `<div class="h-16 sm:h-20 p-1 rounded-xl bg-gray-50/30 dark:bg-slate-900/20 border border-transparent opacity-30"></div>`;
    }

    // 2. Days in month
    for (let day = 1; day <= data.total_days; day++) {
      const dateKey = `${data.month_year}-${String(day).padStart(2, '0')}`;
      const dayData = data.days[dateKey] || { income: 0, expenses: 0, incoming_transfers: 0, outgoing_transfers: 0, transaction_count: 0, transactions: [], events: [] };
      const isToday = dateKey === todayStr;
      const isSelected = dateKey === this.state.calendarState.selectedDate;

      const inc = dayData.income || 0;
      const exp = dayData.expenses || 0;
      const xfer = (dayData.incoming_transfers || 0) + (dayData.outgoing_transfers || 0);
      const evCount = (dayData.events || []).length;
      const txCount = dayData.transaction_count || 0;

      let actHtml = '';
      if (inc > 0) {
        const fmtInc = inc >= 1000 ? `+₹${(inc / 1000).toFixed(1)}k` : `+₹${inc}`;
        actHtml += `<div class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 truncate flex items-center space-x-0.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span><span class="truncate">${fmtInc}</span></div>`;
      }
      if (exp > 0) {
        const fmtExp = exp >= 1000 ? `-₹${(exp / 1000).toFixed(1)}k` : `-₹${exp}`;
        actHtml += `<div class="text-[9px] font-bold text-rose-600 dark:text-rose-400 truncate flex items-center space-x-0.5"><span class="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span><span class="truncate">${fmtExp}</span></div>`;
      }
      if (xfer > 0) {
        actHtml += `<div class="text-[9px] font-semibold text-indigo-600 dark:text-indigo-400 truncate flex items-center space-x-0.5"><span class="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"></span><span>↔ Transfer</span></div>`;
      }
      if (evCount > 0 && inc === 0 && exp === 0) {
        actHtml += `<div class="text-[9px] font-semibold text-amber-600 dark:text-amber-400 truncate flex items-center space-x-0.5"><span class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span><span>Planned</span></div>`;
      }

      const todayBorder = isToday ? 'ring-2 ring-brand-500/80 font-black' : '';
      const selectedClass = isSelected ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 ring-1 ring-brand-500' : 'border-gray-100 dark:border-slate-800';

      container.innerHTML += `
        <div onclick="MoneyTrackApp.selectCalendarDate('${dateKey}')" data-date="${dateKey}" class="calendar-day-cell h-16 sm:h-20 p-1.5 sm:p-2 rounded-xl bg-white dark:bg-slate-900/80 border ${selectedClass} ${todayBorder} hover:border-brand-300 dark:hover:border-brand-700 cursor-pointer flex flex-col justify-between transition-all">
          <div class="flex items-center justify-between">
            <span class="text-xs ${isToday ? 'font-black text-brand-600 dark:text-brand-400' : 'font-semibold text-slate-800 dark:text-slate-200'}">${day}</span>
            ${txCount > 1 ? `<span class="text-[8px] font-bold px-1 rounded-full bg-gray-100 dark:bg-slate-800 text-slate-500">${txCount}</span>` : ''}
          </div>
          <div class="space-y-0.5 overflow-hidden">
            ${actHtml}
          </div>
        </div>
      `;
    }
  },

  renderCalendarSelectedDate: function(dateStr) {
    const data = this.state.calendarState.data;
    if (!data) return;

    const dayObj = (data.days && data.days[dateStr]) || {
      date: dateStr,
      day_name: '',
      income: 0,
      expenses: 0,
      incoming_transfers: 0,
      outgoing_transfers: 0,
      transaction_count: 0,
      transactions: [],
      events: []
    };

    let formattedDate = dateStr;
    try {
      const dtParts = dateStr.split('-');
      const dt = new Date(parseInt(dtParts[0]), parseInt(dtParts[1]) - 1, parseInt(dtParts[2]));
      formattedDate = dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
      formattedDate = dateStr;
    }

    const titleEl = document.getElementById('cal-selected-date-title');
    const badgeEl = document.getElementById('cal-selected-count-badge');
    const incEl = document.getElementById('cal-selected-income');
    const expEl = document.getElementById('cal-selected-expenses');
    const inXferEl = document.getElementById('cal-selected-in-transfers');
    const outXferEl = document.getElementById('cal-selected-out-transfers');

    if (titleEl) titleEl.textContent = formattedDate;
    if (badgeEl) badgeEl.textContent = `${dayObj.transaction_count || 0} transactions`;
    if (incEl) incEl.textContent = `+${data.currency}${(dayObj.income || 0).toLocaleString()}`;
    if (expEl) expEl.textContent = `-${data.currency}${(dayObj.expenses || 0).toLocaleString()}`;
    if (inXferEl) inXferEl.textContent = `${data.currency}${(dayObj.incoming_transfers || 0).toLocaleString()}`;
    if (outXferEl) outXferEl.textContent = `${data.currency}${(dayObj.outgoing_transfers || 0).toLocaleString()}`;

    // Render Transaction List
    const txContainer = document.getElementById('cal-selected-tx-list');
    if (txContainer) {
      txContainer.innerHTML = '';
      if (!dayObj.transactions || dayObj.transactions.length === 0) {
        txContainer.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs">No transactions recorded for this date.</div>`;
      } else {
        dayObj.transactions.forEach(t => {
          const isInc = t.type === 'income';
          const isXfer = t.type === 'transfer';
          const amtClass = isInc ? 'text-emerald-600 dark:text-emerald-400' : (isXfer ? 'text-indigo-600 dark:text-indigo-400' : 'text-rose-600 dark:text-rose-400');
          const prefix = isInc ? '+' : (isXfer ? '↔ ' : '-');

          let routeText = this.escapeHtml(t.account_name);
          if (isXfer && t.destination_account_name) {
            routeText = `${this.escapeHtml(t.account_name)} → ${this.escapeHtml(t.destination_account_name)}`;
          }

          txContainer.innerHTML += `
            <div class="p-2.5 rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs">
              <div class="flex items-center space-x-2.5 min-w-0">
                <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${t.category_color || '#3b82f6'};"></span>
                <div class="min-w-0">
                  <span class="font-bold text-slate-900 dark:text-white block truncate">${this.escapeHtml(t.description)}</span>
                  <span class="text-[11px] text-slate-400 block truncate">${routeText} • <span class="capitalize">${t.category_name}</span></span>
                </div>
              </div>
              <div class="text-right shrink-0 ml-2">
                <span class="font-bold ${amtClass}">${prefix}${data.currency}${Number(t.amount).toLocaleString()}</span>
                <span class="block text-[9px] uppercase font-semibold text-slate-400">${t.type_tag || t.type}</span>
              </div>
            </div>
          `;
        });
      }
    }

    // Render Scheduled Events
    const evSection = document.getElementById('cal-selected-events-section');
    const evList = document.getElementById('cal-selected-events-list');
    if (evSection && evList) {
      if (dayObj.events && dayObj.events.length > 0) {
        evSection.classList.remove('hidden');
        evList.innerHTML = '';
        dayObj.events.forEach(ev => {
          evList.innerHTML += `
            <div class="p-2.5 rounded-xl border border-amber-200/60 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/20 flex items-center justify-between text-xs">
              <div>
                <span class="font-bold text-slate-900 dark:text-white block">${this.escapeHtml(ev.title)}</span>
                <span class="text-[10px] text-amber-600 dark:text-amber-400 capitalize">${ev.frequency} Scheduled ${ev.type}</span>
              </div>
              <span class="font-bold text-slate-900 dark:text-white">${data.currency}${Number(ev.amount).toLocaleString()}</span>
            </div>
          `;
        });
      } else {
        evSection.classList.add('hidden');
      }
    }
  },

  renderCalendar: function() {
    this.loadCalendarView();
  },

  submitCalendarForm: function(e) {
    e.preventDefault();
    const title = document.getElementById('cal-form-title').value;
    const amount = parseFloat(document.getElementById('cal-form-amount').value);
    const type = document.getElementById('cal-form-type').value;
    const date = document.getElementById('cal-form-date').value;

    fetch('/api/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, amount, type, date })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.closeModal('add-calendar-event-modal');
        this.refreshAllData();
      }
    });
  },

  deleteCalendarEvent: function(id) {
    if (confirm('Delete this scheduled cashflow?')) {
      fetch('/api/calendar/' + id, { method: 'DELETE' }).then(() => this.refreshAllData());
    }
  },

  // Financial Planner (Try a Scenario & Check Before You Buy)
  initSimulatorView: function() {
    this.populateSimulatorAccounts();
    fetch('/api/simulate/baseline')
      .then(r => r.json())
      .then(base => {
        this.state.simulatorBaseline = base;
        const incEl = document.getElementById('sim-curr-inc-lbl');
        const expEl = document.getElementById('sim-curr-exp-lbl');
        const liqEl = document.getElementById('sim-curr-liquid-lbl');
        if (incEl) incEl.textContent = Number(base.base_income || 0).toLocaleString();
        if (expEl) expEl.textContent = Number(base.base_expenses || 0).toLocaleString();
        if (liqEl) liqEl.textContent = Number(base.total_liquid_available || 0).toLocaleString();

        // Populate category dropdowns
        const affordCat = document.getElementById('afford-category-id');
        const simCat = document.getElementById('sim-category-id');
        if (affordCat) {
          const curVal = affordCat.value;
          affordCat.innerHTML = '<option value="">No Category Budget Constraint</option>';
          (base.budgets || []).forEach(b => {
            affordCat.innerHTML += `<option value="${b.category_id}">${this.escapeHtml(b.name)} (Limit: ₹${b.limit.toLocaleString()}, Left: ₹${b.remaining.toLocaleString()})</option>`;
          });
          if (curVal) affordCat.value = curVal;
        }
        if (simCat) {
          const curVal = simCat.value;
          simCat.innerHTML = '';
          if (base.budgets && base.budgets.length > 0) {
            base.budgets.forEach(b => {
              simCat.innerHTML += `<option value="${b.category_id}">${this.escapeHtml(b.name)} (Spent: ₹${b.spent.toLocaleString()})</option>`;
            });
          } else {
            const defaultCats = [
              { id: '1', name: 'Food & Dining' },
              { id: '2', name: 'Transport' },
              { id: '3', name: 'Shopping' },
              { id: '4', name: 'Bills & Utilities' },
              { id: '6', name: 'Other' }
            ];
            defaultCats.forEach(c => {
              simCat.innerHTML += `<option value="${c.id}">${c.name}</option>`;
            });
          }
          if (curVal) simCat.value = curVal;
        }

        // Run both
        this.runSimulation();
        this.evaluateAffordability();
      }).catch(err => {
        console.error("Error loading simulator baseline:", err);
        this.runSimulation();
        this.evaluateAffordability();
      });
  },

  populateSimulatorAccounts: function() {
    const affordAccount = document.getElementById('afford-account-id');
    if (!affordAccount) return;
    const curAffordVal = affordAccount.value;
    affordAccount.innerHTML = '';
    const accounts = this.state.accounts || [];
    if (accounts.length === 0) {
      affordAccount.innerHTML = '<option value="">No account available</option>';
      return;
    }
    accounts.forEach(acc => {
      let typeSuffix = '';
      if (acc.is_savings_wallet) {
        typeSuffix = ' [Goal Wallet - Locked]';
      } else if (acc.account_type === 'credit_card') {
        typeSuffix = ' [Credit Card - Liability]';
      } else {
        typeSuffix = ` [${acc.type_label}]`;
      }
      const sym = this.state.user?.currency || '₹';
      affordAccount.innerHTML += `<option value="${acc.id}">${this.escapeHtml(acc.name)}${typeSuffix} — ${sym}${Number(acc.current_balance || 0).toLocaleString()}</option>`;
    });

    const defAcc = accounts.find(a => a.is_default && a.account_type !== 'credit_card' && !a.is_savings_wallet)
      || accounts.find(a => a.account_type !== 'credit_card' && !a.is_savings_wallet)
      || accounts[0];

    if (curAffordVal && accounts.some(a => String(a.id) === String(curAffordVal))) {
      affordAccount.value = curAffordVal;
    } else if (defAcc) {
      affordAccount.value = defAcc.id;
    }
  },

  switchSimulatorTab: function(tab) {
    const scenarioPanel = document.getElementById('sim-panel-scenario');
    const affordPanel = document.getElementById('sim-panel-afford');
    const scenarioBtn = document.getElementById('sim-tab-btn-scenario');
    const affordBtn = document.getElementById('sim-tab-btn-afford');

    if (scenarioPanel) scenarioPanel.classList.add('hidden');
    if (affordPanel) affordPanel.classList.add('hidden');
    if (scenarioBtn) {
      scenarioBtn.classList.replace('text-brand-600', 'text-slate-400');
      scenarioBtn.classList.remove('border-brand-600');
      scenarioBtn.classList.add('border-transparent');
    }
    if (affordBtn) {
      affordBtn.classList.replace('text-brand-600', 'text-slate-400');
      affordBtn.classList.remove('border-brand-600');
      affordBtn.classList.add('border-transparent');
    }

    if (tab === 'scenario') {
      if (scenarioPanel) scenarioPanel.classList.remove('hidden');
      if (scenarioBtn) {
        scenarioBtn.classList.replace('text-slate-400', 'text-brand-600');
        scenarioBtn.classList.replace('border-transparent', 'border-brand-600');
      }
      this.runSimulation();
    } else {
      if (affordPanel) affordPanel.classList.remove('hidden');
      if (affordBtn) {
        affordBtn.classList.replace('text-slate-400', 'text-brand-600');
        affordBtn.classList.replace('border-transparent', 'border-brand-600');
      }
      this.evaluateAffordability();
    }
  },

  updateScenarioInputs: function() {
    const type = document.getElementById('sim-scenario-type')?.value;
    const catContainer = document.getElementById('sim-cat-select-container');
    const amtLabel = document.getElementById('sim-amt-label');
    const sym = this.state.user?.currency || '₹';

    if (type === 'category_reduction') {
      if (catContainer) catContainer.classList.remove('hidden');
      if (amtLabel) amtLabel.innerHTML = `Monthly Category Spend Reduction (${sym})`;
    } else {
      if (catContainer) catContainer.classList.add('hidden');
      if (type === 'one_time_purchase') {
        if (amtLabel) amtLabel.innerHTML = `Purchase Price of Item (${sym})`;
      } else if (type === 'expense_increase') {
        if (amtLabel) amtLabel.innerHTML = `Monthly Expense Increase (${sym})`;
      } else if (type === 'income_decrease') {
        if (amtLabel) amtLabel.innerHTML = `Monthly Income Reduction (${sym})`;
      } else if (type === 'salary') {
        if (amtLabel) amtLabel.innerHTML = `Monthly Income Increase (${sym})`;
      } else if (type === 'extra_savings') {
        if (amtLabel) amtLabel.innerHTML = `Extra Monthly Savings Target (${sym})`;
      } else {
        if (amtLabel) amtLabel.innerHTML = `Simulated Monthly Change (${sym})`;
      }
    }
    this.runSimulation();
  },

  setScenarioChartMode: function(mode) {
    this.state.scenarioChartMode = mode;
    const trendBtn = document.getElementById('sim-chart-mode-trend-btn');
    const cashflowBtn = document.getElementById('sim-chart-mode-cashflow-btn');
    if (mode === 'trend') {
      if (trendBtn) trendBtn.className = 'px-2.5 py-1 rounded-lg bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 transition';
      if (cashflowBtn) cashflowBtn.className = 'px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition';
    } else {
      if (cashflowBtn) cashflowBtn.className = 'px-2.5 py-1 rounded-lg bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 transition';
      if (trendBtn) trendBtn.className = 'px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition';
    }
    if (this.state.lastScenarioData) {
      this.renderScenarioChart(this.state.lastScenarioData);
    }
  },

  renderScenarioChart: function(res) {
    const ctx = document.getElementById('sim-scenario-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (this.simScenarioChart) {
      this.simScenarioChart.destroy();
      this.simScenarioChart = null;
    }

    const mode = this.state.scenarioChartMode || 'trend';
    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.6)';

    if (mode === 'trend') {
      const lineColor = res.impact === 'negative' ? '#f43f5e' : (res.impact === 'positive' ? '#16a34a' : '#3b82f6');
      const areaColor = res.impact === 'negative' ? 'rgba(244, 63, 94, 0.08)' : (res.impact === 'positive' ? 'rgba(22, 163, 74, 0.08)' : 'rgba(59, 130, 246, 0.08)');

      this.simScenarioChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: res.months_labels || ['Now', 'Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Month 6', 'Month 7', 'Month 8', 'Month 9', 'Month 10', 'Month 11', 'Month 12'],
          datasets: [
            {
              label: 'Baseline Trajectory',
              data: res.baseline_trend || [],
              borderColor: '#94a3b8',
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              borderWidth: 2,
              tension: 0.25,
              pointRadius: 2.5
            },
            {
              label: 'Simulated Scenario',
              data: res.simulated_trend || [],
              borderColor: lineColor,
              backgroundColor: areaColor,
              fill: true,
              borderWidth: 2.5,
              tension: 0.25,
              pointRadius: 3.5,
              pointHoverRadius: 5
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: textColor, boxWidth: 12, font: { size: 10, weight: 600 } }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `${context.dataset.label}: ₹${Number(context.raw).toLocaleString()}`;
                }
              }
            }
          },
          scales: {
            y: {
              grid: { color: gridColor },
              ticks: {
                color: textColor,
                font: { size: 10 },
                callback: function(v) { return '₹' + Number(v).toLocaleString(); }
              }
            },
            x: {
              grid: { display: false },
              ticks: { color: textColor, font: { size: 10 } }
            }
          }
        }
      });
    } else {
      // Cashflow mode
      this.simScenarioChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Monthly Income', 'Monthly Expenses', 'Monthly Savings'],
          datasets: [
            {
              label: 'Current Baseline',
              data: [res.base_income || 0, res.base_expenses || 0, res.curr_savings || 0],
              backgroundColor: '#94a3b8',
              borderRadius: 6
            },
            {
              label: 'Simulated Scenario',
              data: [res.sim_income || 0, res.sim_expenses || 0, res.sim_savings || 0],
              backgroundColor: ['#3b82f6', '#f43f5e', (res.sim_savings >= res.curr_savings ? '#16a34a' : '#f59e0b')],
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: textColor, boxWidth: 12, font: { size: 10, weight: 600 } }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `${context.dataset.label}: ₹${Number(context.raw).toLocaleString()}`;
                }
              }
            }
          },
          scales: {
            y: {
              grid: { color: gridColor },
              ticks: {
                color: textColor,
                font: { size: 10 },
                callback: function(v) { return '₹' + Number(v).toLocaleString(); }
              }
            },
            x: {
              grid: { display: false },
              ticks: { color: textColor, font: { size: 10 } }
            }
          }
        }
      });
    }
  },

  runSimulation: function() {
    const scenarioType = document.getElementById('sim-scenario-type')?.value || 'salary';
    const changeAmount = parseFloat(document.getElementById('sim-change-amt')?.value) || 0;
    const categoryId = document.getElementById('sim-category-id')?.value || null;

    fetch('/api/simulate/what-if', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_type: scenarioType, change_amount: changeAmount, category_id: categoryId })
    }).then(r => r.json()).then(res => {
      this.state.lastScenarioData = res;

      const currSavingsEl = document.getElementById('sim-curr-savings');
      const simSavingsEl = document.getElementById('sim-simulated-savings');
      const currAnnualEl = document.getElementById('sim-curr-annual');
      const simAnnualEl = document.getElementById('sim-simulated-annual');
      const currRateEl = document.getElementById('sim-curr-rate');
      const simRateEl = document.getElementById('sim-simulated-rate');
      const diffMonthlyEl = document.getElementById('sim-diff-monthly-lbl');
      const diffBalanceEl = document.getElementById('sim-diff-balance-lbl');
      const goalAccelEl = document.getElementById('sim-goal-accel');
      const goalAccelPill = document.getElementById('sim-goal-accel-pill');
      const card = document.getElementById('sim-simulated-savings-card');
      const label = document.getElementById('sim-simulated-savings-label');
      const num = document.getElementById('sim-simulated-savings-num');

      const sym = this.state.user?.currency || '₹';

      if (currSavingsEl) currSavingsEl.textContent = Number(res.curr_savings || 0).toLocaleString();
      if (simSavingsEl) simSavingsEl.textContent = Number(res.sim_savings || 0).toLocaleString();
      if (currAnnualEl) currAnnualEl.textContent = Number(res.curr_annual || 0).toLocaleString();
      if (simAnnualEl) simAnnualEl.textContent = Number(res.sim_annual || 0).toLocaleString();
      if (currRateEl) currRateEl.textContent = res.curr_rate || '0.0%';
      if (simRateEl) simRateEl.textContent = res.sim_rate || '0.0%';

      if (diffMonthlyEl) {
        if (res.diff_monthly > 0) {
          diffMonthlyEl.className = 'font-bold text-emerald-600 dark:text-emerald-400';
          diffMonthlyEl.innerHTML = `+${sym}${res.diff_monthly.toLocaleString()}/month`;
        } else if (res.diff_monthly < 0) {
          diffMonthlyEl.className = 'font-bold text-rose-600 dark:text-rose-400';
          diffMonthlyEl.innerHTML = `-${sym}${Math.abs(res.diff_monthly).toLocaleString()}/month`;
        } else {
          diffMonthlyEl.className = 'font-bold text-slate-900 dark:text-white';
          diffMonthlyEl.innerHTML = `${sym}0/month`;
        }
      }

      if (diffBalanceEl) {
        if (res.diff_balance_12m > 0) {
          diffBalanceEl.className = 'font-bold text-emerald-600 dark:text-emerald-400';
          diffBalanceEl.innerHTML = `+${sym}${res.diff_balance_12m.toLocaleString()}`;
        } else if (res.diff_balance_12m < 0) {
          diffBalanceEl.className = 'font-bold text-rose-600 dark:text-rose-400';
          diffBalanceEl.innerHTML = `-${sym}${Math.abs(res.diff_balance_12m).toLocaleString()}`;
        } else {
          diffBalanceEl.className = 'font-bold text-slate-900 dark:text-white';
          diffBalanceEl.innerHTML = `${sym}0`;
        }
      }

      if (goalAccelEl) goalAccelEl.textContent = res.goal_accel;

      // Card styling based on impact
      if (res.impact === 'negative') {
        if (card) card.className = 'p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-center transition-colors';
        if (label) label.className = 'text-xs text-rose-700 dark:text-rose-300 font-semibold uppercase';
        if (num) num.className = 'text-xl font-bold text-rose-700 dark:text-rose-300 mt-1';
        if (goalAccelPill) goalAccelPill.className = 'font-bold text-rose-600 dark:text-rose-400';
      } else if (res.impact === 'neutral') {
        if (card) card.className = 'p-4 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 text-center transition-colors';
        if (label) label.className = 'text-xs text-slate-500 font-semibold uppercase';
        if (num) num.className = 'text-xl font-bold text-slate-700 dark:text-slate-300 mt-1';
        if (goalAccelPill) goalAccelPill.className = 'font-bold text-slate-600 dark:text-slate-400';
      } else {
        if (card) card.className = 'p-4 rounded-xl bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-900/40 text-center transition-colors';
        if (label) label.className = 'text-xs text-brand-700 dark:text-brand-300 font-semibold uppercase';
        if (num) num.className = 'text-xl font-bold text-brand-700 dark:text-brand-300 mt-1';
        if (goalAccelPill) goalAccelPill.className = 'font-bold text-brand-600 dark:text-brand-400';
      }

      this.renderScenarioChart(res);
    }).catch(err => console.error("Error running simulation:", err));
  },

  renderAffordChart: function(res) {
    const ctx = document.getElementById('sim-afford-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (this.simAffordChart) {
      this.simAffordChart.destroy();
      this.simAffordChart = null;
    }

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.6)';

    const postAccColor = (res.status === 'critical') ? '#f43f5e' : ((res.status === 'warning') ? '#f59e0b' : '#16a34a');

    this.simAffordChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Account Before', 'Purchase Price', 'Account After', 'Committed Bills', 'Protected Goals'],
        datasets: [{
          label: 'Amount (₹)',
          data: [
            Math.max(0, res.account_balance || 0),
            res.price || 0,
            Math.max(0, res.account_post_balance || 0),
            res.committed_expenses || 0,
            res.savings_wallets_total || 0
          ],
          backgroundColor: [
            '#3b82f6',   // Blue: Account before
            '#f59e0b',   // Amber: Price
            postAccColor, // Status color: Account after
            '#8b5cf6',   // Purple: Committed bills
            '#10b981'    // Emerald: Protected goal funds
          ],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return `Amount: ₹${Number(context.raw).toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: 10 },
              callback: function(v) { return '₹' + Number(v).toLocaleString(); }
            }
          },
          x: {
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { size: 9 },
              maxRotation: 0,
              autoSkip: false
            }
          }
        }
      }
    });
  },

  evaluateAffordability: function() {
    const itemName = document.getElementById('afford-item-name')?.value || 'Purchase';
    const price = parseFloat(document.getElementById('afford-item-price')?.value) || 0;
    const accountId = document.getElementById('afford-account-id')?.value || null;
    const categoryId = document.getElementById('afford-category-id')?.value || null;

    fetch('/api/simulate/affordability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item_name: itemName,
        price: price,
        account_id: accountId,
        category_id: categoryId
      })
    }).then(r => r.json()).then(res => {
      this.state.lastAffordData = res;

      // Populate metrics
      const accBalEl = document.getElementById('afford-acc-balance');
      const accPostEl = document.getElementById('afford-acc-post-balance');
      const accPostContainer = document.getElementById('afford-acc-post-container');
      const totalLiqEl = document.getElementById('afford-total-liquid');
      const postLiqEl = document.getElementById('afford-total-post-liquid');
      const postLiqContainer = document.getElementById('afford-post-liquid-container');
      const committedEl = document.getElementById('afford-committed-expenses');
      const goalWalletsEl = document.getElementById('afford-goal-wallets-total');
      const monthsCovEl = document.getElementById('afford-months-cov');
      const covBadgeEl = document.getElementById('afford-cov-badge');
      const summaryTextEl = document.getElementById('afford-summary-text');
      const budgetContainer = document.getElementById('afford-budget-status-container');
      const budgetStatusText = document.getElementById('afford-budget-status-text');

      if (accBalEl) accBalEl.textContent = Number(res.account_balance || 0).toLocaleString();
      if (accPostEl) accPostEl.textContent = Number(res.account_post_balance || 0).toLocaleString();
      if (totalLiqEl) totalLiqEl.textContent = Number(res.total_liquid_available || 0).toLocaleString();
      if (postLiqEl) postLiqEl.textContent = Number(res.total_post_liquid || 0).toLocaleString();
      if (committedEl) committedEl.textContent = Number(res.committed_expenses || 0).toLocaleString();
      if (goalWalletsEl) goalWalletsEl.textContent = Number(res.savings_wallets_total || 0).toLocaleString();
      if (monthsCovEl) monthsCovEl.textContent = `${res.coverage_months || 0} Months`;
      if (summaryTextEl) summaryTextEl.textContent = res.summary_text;

      // Color coding for account post-balance
      if (accPostContainer) {
        if (!res.is_credit_card && res.account_post_balance < 0) {
          accPostContainer.className = 'text-sm font-bold text-rose-600 dark:text-rose-400 mt-1';
        } else {
          accPostContainer.className = 'text-sm font-bold text-slate-900 dark:text-white mt-1';
        }
      }

      // Color coding for total post liquid
      if (postLiqContainer) {
        if (res.total_post_liquid < 0) {
          postLiqContainer.className = 'text-sm font-bold text-rose-600 dark:text-rose-400 mt-1';
        } else {
          postLiqContainer.className = 'text-sm font-bold text-slate-900 dark:text-white mt-1';
        }
      }

      // Emergency buffer badge
      if (covBadgeEl) {
        if (res.coverage_months >= 3.0) {
          covBadgeEl.className = 'text-xs font-semibold text-emerald-600 dark:text-emerald-400';
          covBadgeEl.textContent = '(Healthy Emergency Cushion)';
        } else if (res.coverage_months > 0) {
          covBadgeEl.className = 'text-xs font-semibold text-amber-600 dark:text-amber-400';
          covBadgeEl.textContent = '(Tight - Under 3 Months)';
        } else {
          covBadgeEl.className = 'text-xs font-semibold text-rose-600 dark:text-rose-400';
          covBadgeEl.textContent = '(Insufficient / Depleted)';
        }
      }

      // Category budget check
      if (budgetContainer && budgetStatusText) {
        if (res.budget) {
          budgetContainer.classList.remove('hidden');
          const sym = this.state.user?.currency || '₹';
          if (res.budget.exceeded) {
            budgetStatusText.className = 'font-bold text-rose-600 dark:text-rose-400';
            budgetStatusText.textContent = `Exceeded by ${sym}${Math.abs(res.budget.post_remaining).toLocaleString()} (Limit: ${sym}${res.budget.limit.toLocaleString()})`;
          } else {
            budgetStatusText.className = 'font-bold text-emerald-600 dark:text-emerald-400';
            budgetStatusText.textContent = `${sym}${res.budget.post_remaining.toLocaleString()} left (Limit: ${sym}${res.budget.limit.toLocaleString()})`;
          }
        } else {
          budgetContainer.classList.add('hidden');
        }
      }

      // VERDICT BANNER - Fixed Green Highlight Bug
      const banner = document.getElementById('afford-verdict-banner');
      const icon = document.getElementById('afford-verdict-icon');
      const verdictText = document.getElementById('afford-verdict-text');

      if (res.status === 'safe') {
        if (banner) banner.className = 'p-4 rounded-xl border transition-all flex items-start space-x-3.5 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300';
        if (icon) icon.innerHTML = '<svg class="w-5 h-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
        if (verdictText) {
          verdictText.className = 'text-base font-bold text-emerald-700 dark:text-emerald-300';
          verdictText.textContent = 'You can afford this.';
        }
      } else if (res.status === 'warning') {
        if (banner) banner.className = 'p-4 rounded-xl border transition-all flex items-start space-x-3.5 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300';
        if (icon) icon.innerHTML = '<svg class="w-5 h-5 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
        if (verdictText) {
          verdictText.className = 'text-base font-bold text-amber-700 dark:text-amber-300';
          verdictText.textContent = 'This purchase may affect your savings.';
        }
      } else {
        if (banner) banner.className = 'p-4 rounded-xl border transition-all flex items-start space-x-3.5 bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300';
        if (icon) icon.innerHTML = '<svg class="w-5 h-5 text-rose-600 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        if (verdictText) {
          verdictText.className = 'text-base font-bold text-rose-700 dark:text-rose-300';
          verdictText.textContent = 'This purchase exceeds your available balance.';
        }
      }

      this.renderAffordChart(res);
    }).catch(err => console.error("Error evaluating affordability:", err));
  },

  // ==========================================
  // Financial Calculators & Wealth Planning
  // ==========================================
  initCalculators: function() {
    this.calculateEMI();
    this.calculateCI();
    this.calculateSavingsGrowth();
    this.calculateInflation();
  },

  filterCalculators: function(category) {
    const tabs = ['all', 'emi', 'ci', 'sip', 'inflation'];
    tabs.forEach(tab => {
      const btn = document.getElementById(`calc-tab-${tab}`);
      if (btn) {
        if (tab === category) {
          btn.className = 'calc-tab-btn px-3 py-1.5 rounded-lg font-semibold bg-white dark:bg-slate-800 text-brand-600 dark:text-brand-400 shadow-sm transition-all';
        } else {
          btn.className = 'calc-tab-btn px-3 py-1.5 rounded-lg font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all';
        }
      }
    });

    const cards = [
      { id: 'calc-card-emi', cat: 'emi' },
      { id: 'calc-card-ci', cat: 'ci' },
      { id: 'calc-card-sip', cat: 'sip' },
      { id: 'calc-card-inflation', cat: 'inflation' }
    ];

    cards.forEach(card => {
      const el = document.getElementById(card.id);
      if (!el) return;
      if (category === 'all' || category === card.cat) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });
  },

  setCalcPreset: function(type, val1, val2, val3, val4) {
    if (type === 'emi') {
      const pEl = document.getElementById('calc-emi-principal');
      const rEl = document.getElementById('calc-emi-rate');
      const mEl = document.getElementById('calc-emi-months');
      if (pEl) pEl.value = val1;
      if (rEl) rEl.value = val2;
      if (mEl) mEl.value = val3;
      this.calculateEMI();
    } else if (type === 'ci') {
      const pEl = document.getElementById('calc-ci-principal');
      const rEl = document.getElementById('calc-ci-rate');
      const yEl = document.getElementById('calc-ci-years');
      const fEl = document.getElementById('calc-ci-freq');
      if (pEl) pEl.value = val1;
      if (rEl) rEl.value = val2;
      if (yEl) yEl.value = val3;
      if (fEl && val4) fEl.value = val4;
      this.calculateCI();
    } else if (type === 'sip') {
      const dEl = document.getElementById('calc-sip-deposit');
      const rEl = document.getElementById('calc-sip-rate');
      const yEl = document.getElementById('calc-sip-years');
      if (dEl) dEl.value = val1;
      if (rEl) rEl.value = val2;
      if (yEl) yEl.value = val3;
      this.calculateSavingsGrowth();
    } else if (type === 'inflation') {
      const cEl = document.getElementById('calc-inf-cost');
      const rEl = document.getElementById('calc-inf-rate');
      const yEl = document.getElementById('calc-inf-years');
      if (cEl) cEl.value = val1;
      if (rEl) rEl.value = val2;
      if (yEl) yEl.value = val3;
      this.calculateInflation();
    }
  },

  // 1. EMI Calculator
  calculateEMI: function() {
    const pEl = document.getElementById('calc-emi-principal');
    const rEl = document.getElementById('calc-emi-rate');
    const mEl = document.getElementById('calc-emi-months');
    if (!pEl || !rEl || !mEl) return;
    const principal = Math.max(0, parseFloat(pEl.value) || 0);
    const rate = Math.max(0, parseFloat(rEl.value) || 0);
    const months = Math.max(1, parseInt(mEl.value) || 1);

    fetch('/api/calculators/emi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principal, rate, months })
    }).then(r => r.json()).then(res => {
      this.state.lastEmiData = res;
      const mRes = document.getElementById('res-emi-monthly');
      const iRes = document.getElementById('res-emi-interest');
      const tRes = document.getElementById('res-emi-total');
      const pDisp = document.getElementById('res-emi-principal-display');
      const pPct = document.getElementById('res-emi-principal-pct');
      const iPct = document.getElementById('res-emi-interest-pct');
      const desc = document.getElementById('res-emi-desc');

      if (mRes) mRes.textContent = (res.monthly_emi || 0).toLocaleString();
      if (iRes) iRes.textContent = (res.total_interest || 0).toLocaleString();
      if (tRes) tRes.textContent = (res.total_payable || 0).toLocaleString();
      if (pDisp) pDisp.textContent = (res.principal || 0).toLocaleString();
      if (pPct) pPct.textContent = `(${res.principal_pct || 0}%)`;
      if (iPct) iPct.textContent = `(${res.interest_pct || 0}%)`;
      if (desc) {
        desc.textContent = `For a ₹${(res.principal || 0).toLocaleString()} loan at ${rate}% over ${months} months, your fixed monthly payment is ₹${(res.monthly_emi || 0).toLocaleString()} (Total interest: ₹${(res.total_interest || 0).toLocaleString()}).`;
      }

      this.renderEmiChart(res);
    }).catch(e => console.warn('EMI calculation error:', e));
  },

  resetEMI: function() {
    const pEl = document.getElementById('calc-emi-principal');
    const rEl = document.getElementById('calc-emi-rate');
    const mEl = document.getElementById('calc-emi-months');
    if (pEl) pEl.value = 500000;
    if (rEl) rEl.value = 10.5;
    if (mEl) mEl.value = 36;
    this.calculateEMI();
  },

  renderEmiChart: function(res) {
    const ctx = document.getElementById('calc-emi-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (this.state.calcCharts && this.state.calcCharts.emi) {
      this.state.calcCharts.emi.destroy();
      this.state.calcCharts.emi = null;
    }

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#64748b';

    const p = res.principal || 0;
    const i = res.total_interest || 0;

    this.state.calcCharts.emi = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Principal Loan', 'Total Interest'],
        datasets: [{
          data: [p, i],
          backgroundColor: ['#16a34a', '#f59e0b'],
          borderColor: isDark ? '#020617' : '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 12,
              color: textColor,
              font: { size: 11, weight: '500' }
            }
          },
          tooltip: {
            callbacks: {
              label: function(item) {
                const total = p + i;
                const pct = total > 0 ? ((item.parsed / total) * 100).toFixed(1) : 0;
                return ` ${item.label}: ₹${item.parsed.toLocaleString()} (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },

  // 2. Compound Interest Calculator
  calculateCI: function() {
    const pEl = document.getElementById('calc-ci-principal');
    const rEl = document.getElementById('calc-ci-rate');
    const yEl = document.getElementById('calc-ci-years');
    const fEl = document.getElementById('calc-ci-freq');
    if (!pEl || !rEl || !yEl) return;
    const principal = Math.max(0, parseFloat(pEl.value) || 0);
    const rate = Math.max(0, parseFloat(rEl.value) || 0);
    const years = Math.max(0, parseFloat(yEl.value) || 0);
    const freq = fEl ? (parseInt(fEl.value) || 1) : 1;

    fetch('/api/calculators/ci', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principal, rate, years, compound_freq: freq })
    }).then(r => r.json()).then(res => {
      this.state.lastCiData = res;
      const tRes = document.getElementById('res-ci-total');
      const iRes = document.getElementById('res-ci-interest');
      const pDisp = document.getElementById('res-ci-principal-display');
      const mult = document.getElementById('res-ci-multiplier');
      const desc = document.getElementById('res-ci-desc');

      if (tRes) tRes.textContent = (res.future_value || 0).toLocaleString();
      if (iRes) iRes.textContent = (res.interest_earned || 0).toLocaleString();
      if (pDisp) pDisp.textContent = (res.initial_principal || 0).toLocaleString();
      if (mult) mult.textContent = `${res.growth_multiplier || 1}x`;
      if (desc) {
        desc.textContent = `Your ₹${(res.initial_principal || 0).toLocaleString()} initial deposit multiplies to ₹${(res.future_value || 0).toLocaleString()} in ${years} years, gaining ₹${(res.interest_earned || 0).toLocaleString()} in compound interest.`;
      }

      this.renderCiChart(res);
    }).catch(e => console.warn('CI calculation error:', e));
  },

  resetCI: function() {
    const pEl = document.getElementById('calc-ci-principal');
    const rEl = document.getElementById('calc-ci-rate');
    const yEl = document.getElementById('calc-ci-years');
    const fEl = document.getElementById('calc-ci-freq');
    if (pEl) pEl.value = 100000;
    if (rEl) rEl.value = 12;
    if (yEl) yEl.value = 10;
    if (fEl) fEl.value = 1;
    this.calculateCI();
  },

  renderCiChart: function(res) {
    const ctx = document.getElementById('calc-ci-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (this.state.calcCharts && this.state.calcCharts.ci) {
      this.state.calcCharts.ci.destroy();
      this.state.calcCharts.ci = null;
    }

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.6)';

    const schedule = res.yearly_schedule || [];
    const labels = schedule.map(s => `Yr ${s.year}`);
    const principals = schedule.map(s => s.principal);
    const values = schedule.map(s => s.value);

    this.state.calcCharts.ci = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['Yr 0'],
        datasets: [
          {
            label: 'Initial Principal',
            data: principals.length ? principals : [res.initial_principal || 0],
            borderColor: '#94a3b8',
            borderDash: [4, 4],
            pointRadius: 2,
            borderWidth: 2,
            fill: false
          },
          {
            label: 'Total Future Value',
            data: values.length ? values : [res.future_value || 0],
            borderColor: '#3b82f6',
            backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.08)',
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2.5,
            fill: true,
            tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 10,
              color: textColor,
              font: { size: 10, weight: '500' }
            }
          },
          tooltip: {
            callbacks: {
              label: item => ` ${item.dataset.label}: ₹${item.parsed.y.toLocaleString()}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: textColor, font: { size: 10 } },
            grid: { color: gridColor }
          },
          y: {
            ticks: {
              color: textColor,
              font: { size: 10 },
              callback: v => '₹' + (v >= 100000 ? (v / 100000).toFixed(1) + 'L' : v.toLocaleString())
            },
            grid: { color: gridColor }
          }
        }
      }
    });
  },

  // 3. Monthly Savings Growth (SIP) Calculator
  calculateSavingsGrowth: function() {
    const dEl = document.getElementById('calc-sip-deposit');
    const rEl = document.getElementById('calc-sip-rate');
    const yEl = document.getElementById('calc-sip-years');
    if (!dEl || !rEl || !yEl) return;
    const deposit = Math.max(0, parseFloat(dEl.value) || 0);
    const rate = Math.max(0, parseFloat(rEl.value) || 0);
    const years = Math.max(0, parseFloat(yEl.value) || 0);

    fetch('/api/calculators/savings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deposit, rate, years })
    }).then(r => r.json()).then(res => {
      this.state.lastSipData = res;
      const tRes = document.getElementById('res-sip-total');
      const dRes = document.getElementById('res-sip-deposited');
      const gRes = document.getElementById('res-sip-gain');
      const pRes = document.getElementById('res-sip-pct');
      const desc = document.getElementById('res-sip-desc');

      if (tRes) tRes.textContent = (res.future_value || 0).toLocaleString();
      if (dRes) dRes.textContent = (res.total_deposited || 0).toLocaleString();
      if (gRes) gRes.textContent = (res.interest_earned || 0).toLocaleString();
      if (pRes) pRes.textContent = `+${res.growth_pct || 0}%`;
      if (desc) {
        desc.textContent = `Depositing ₹${(res.monthly_deposit || 0).toLocaleString()} every month for ${years} years (total deposited ₹${(res.total_deposited || 0).toLocaleString()}) generates ₹${(res.interest_earned || 0).toLocaleString()} in returns at ${rate}% p.a.`;
      }

      this.renderSavingsGrowthChart(res);
    }).catch(e => console.warn('Savings growth calculation error:', e));
  },

  resetSavingsGrowth: function() {
    const dEl = document.getElementById('calc-sip-deposit');
    const rEl = document.getElementById('calc-sip-rate');
    const yEl = document.getElementById('calc-sip-years');
    if (dEl) dEl.value = 5000;
    if (rEl) rEl.value = 12;
    if (yEl) yEl.value = 10;
    this.calculateSavingsGrowth();
  },

  renderSavingsGrowthChart: function(res) {
    const ctx = document.getElementById('calc-sip-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (this.state.calcCharts && this.state.calcCharts.sip) {
      this.state.calcCharts.sip.destroy();
      this.state.calcCharts.sip = null;
    }

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.4)' : 'rgba(226, 232, 240, 0.6)';

    const schedule = res.yearly_schedule || [];
    const labels = schedule.map(s => `Yr ${s.year}`);
    const deposits = schedule.map(s => s.deposited);
    const values = schedule.map(s => s.future_value);

    this.state.calcCharts.sip = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels.length ? labels : ['Yr 1'],
        datasets: [
          {
            label: 'Total Deposited',
            data: deposits.length ? deposits : [res.total_deposited || 0],
            borderColor: '#64748b',
            borderDash: [3, 3],
            pointRadius: 2,
            borderWidth: 2,
            fill: false
          },
          {
            label: 'Projected Wealth',
            data: values.length ? values : [res.future_value || 0],
            borderColor: '#10b981',
            backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.08)',
            pointRadius: 3,
            pointHoverRadius: 5,
            borderWidth: 2.5,
            fill: true,
            tension: 0.25
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              padding: 10,
              color: textColor,
              font: { size: 10, weight: '500' }
            }
          },
          tooltip: {
            callbacks: {
              label: item => ` ${item.dataset.label}: ₹${item.parsed.y.toLocaleString()}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: textColor, font: { size: 10 } },
            grid: { color: gridColor }
          },
          y: {
            ticks: {
              color: textColor,
              font: { size: 10 },
              callback: v => '₹' + (v >= 100000 ? (v / 100000).toFixed(1) + 'L' : v.toLocaleString())
            },
            grid: { color: gridColor }
          }
        }
      }
    });
  },

  // 4. Inflation & Future Cost Calculator
  calculateInflation: function() {
    const cEl = document.getElementById('calc-inf-cost');
    const rEl = document.getElementById('calc-inf-rate');
    const yEl = document.getElementById('calc-inf-years');
    if (!cEl || !rEl || !yEl) return;
    const cost = Math.max(0, parseFloat(cEl.value) || 0);
    const rate = Math.max(0, parseFloat(rEl.value) || 0);
    const years = Math.max(0, parseFloat(yEl.value) || 0);

    fetch('/api/calculators/inflation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cost, rate, years })
    }).then(r => r.json()).then(res => {
      const fRes = document.getElementById('res-inf-future');
      const cDisp = document.getElementById('res-inf-current-display');
      const iRes = document.getElementById('res-inf-increase');
      const iPct = document.getElementById('res-inf-increase-pct');
      const lBadge = document.getElementById('res-inf-loss-badge');
      const retText = document.getElementById('res-inf-retention-text');
      const retBar = document.getElementById('res-inf-retained-bar');
      const lostBar = document.getElementById('res-inf-lost-bar');
      const retVal = document.getElementById('res-inf-retained-val');
      const lostVal = document.getElementById('res-inf-lost-val');
      const desc = document.getElementById('res-inf-desc');

      const futureCost = res.future_cost || 0;
      const currentCost = res.current_cost || cost;
      const priceInc = res.price_increase || Math.max(0, futureCost - currentCost);
      const lossPct = res.purchasing_power_loss_pct || 0;
      const retainedPct = Math.max(0, (100 - lossPct)).toFixed(1);
      const incPct = currentCost > 0 ? ((priceInc / currentCost) * 100).toFixed(1) : '0.0';

      if (fRes) fRes.textContent = futureCost.toLocaleString();
      if (cDisp) cDisp.textContent = currentCost.toLocaleString();
      if (iRes) iRes.textContent = priceInc.toLocaleString();
      if (iPct) iPct.textContent = `(+${incPct}%)`;
      if (lBadge) lBadge.textContent = `-${lossPct}%`;
      if (retText) retText.textContent = `${retainedPct}% retained`;
      if (retBar) retBar.style.width = `${retainedPct}%`;
      if (lostBar) lostBar.style.width = `${lossPct}%`;
      if (retVal) retVal.textContent = `${retainedPct}%`;
      if (lostVal) lostVal.textContent = `${lossPct}%`;
      if (desc) {
        desc.textContent = `An item costing ₹${currentCost.toLocaleString()} today will require ₹${futureCost.toLocaleString()} in ${years} years at ${rate}% annual inflation (a +${incPct}% price increase).`;
      }
    }).catch(e => console.warn('Inflation calculation error:', e));
  },

  resetInflation: function() {
    const cEl = document.getElementById('calc-inf-cost');
    const rEl = document.getElementById('calc-inf-rate');
    const yEl = document.getElementById('calc-inf-years');
    if (cEl) cEl.value = 50000;
    if (rEl) rEl.value = 6.0;
    if (yEl) yEl.value = 10;
    this.calculateInflation();
  },

  // Quizzes & Learning
  startQuiz: function(lessonIdx) {
    const lessonId = lessonIdx + 1;
    fetch(`/api/learning/quizzes/${lessonId}`)
      .then(r => r.json())
      .then(res => {
        this.state.quizState = {
          lessonId: lessonId,
          currentQ: 0,
          score: 0,
          questions: res.quizzes || []
        };
        const container = document.getElementById('quiz-active-container');
        container.classList.remove('hidden');
        this.renderCurrentQuestion();
        container.scrollIntoView({ behavior: 'smooth' });
      });
  },

  renderCurrentQuestion: function() {
    const state = this.state.quizState;
    const q = state.questions[state.currentQ];
    if (!q) return;

    document.getElementById('quiz-progress-text').textContent = `Question ${state.currentQ + 1} of ${state.questions.length}`;
    document.getElementById('quiz-score-live').textContent = `Score: ${state.score}`;
    document.getElementById('quiz-question-title').textContent = q.question;

    const optList = document.getElementById('quiz-options-list');
    optList.innerHTML = '';
    document.getElementById('quiz-feedback-box').classList.add('hidden');
    document.getElementById('quiz-next-btn').classList.add('hidden');

    q.options.forEach((opt, idx) => {
      optList.innerHTML += `
        <button onclick="MoneyTrackApp.selectQuizOption(${idx})" class="quiz-opt-btn w-full p-3 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 text-left text-xs font-semibold text-slate-800 dark:text-slate-200 hover:border-brand-500 transition">
          ${opt}
        </button>
      `;
    });
  },

  selectQuizOption: function(selectedIdx) {
    const state = this.state.quizState;
    const q = state.questions[state.currentQ];
    const isCorrect = (selectedIdx === q.correct_index);

    if (isCorrect) state.score++;
    document.getElementById('quiz-score-live').textContent = `Score: ${state.score}`;

    const buttons = document.querySelectorAll('.quiz-opt-btn');
    buttons.forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === q.correct_index) {
        btn.classList.add('bg-brand-50', 'dark:bg-brand-900/40', 'border-brand-500', 'text-brand-700', 'dark:text-brand-300');
      } else if (idx === selectedIdx && !isCorrect) {
        btn.classList.add('bg-accent-rose/10', 'border-accent-rose', 'text-accent-rose');
      }
    });

    const feedback = document.getElementById('quiz-feedback-box');
    feedback.textContent = q.explanation;
    feedback.classList.remove('hidden');

    const nextBtn = document.getElementById('quiz-next-btn');
    nextBtn.textContent = (state.currentQ + 1 < state.questions.length) ? 'Next Question' : 'Finish Quiz';
    nextBtn.classList.remove('hidden');
  },

  nextQuestion: function() {
    const state = this.state.quizState;
    if (state.currentQ + 1 < state.questions.length) {
      state.currentQ++;
      this.renderCurrentQuestion();
    } else {
      // Completed!
      fetch('/api/learning/quizzes/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson_id: state.lessonId, score: state.score, total: state.questions.length })
      }).then(() => {
        alert(`Quiz Complete! Final Score: ${state.score} / ${state.questions.length}`);
        document.getElementById('quiz-active-container').classList.add('hidden');
        this.refreshAllData();
      });
    }
  },

  renderAchievements: function() {
    const grid = document.getElementById('achievements-badges-grid');
    if (!grid) return;
    grid.innerHTML = '';

    this.state.achievements.forEach(ach => {
      const stateStyle = ach.unlocked
        ? 'border-brand-500/40 bg-brand-50/40 dark:bg-brand-950/20 text-slate-900 dark:text-white'
        : 'border-gray-200 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/30 opacity-50';

      grid.innerHTML += `
        <div class="p-4 rounded-xl border ${stateStyle} space-y-2 text-center">
          <div class="w-8 h-8 rounded-full bg-brand-600 text-white mx-auto flex items-center justify-center">
            <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          </div>
          <div class="font-bold text-xs">${ach.title}</div>
          <p class="text-[10px] text-slate-400 leading-tight">${ach.desc}</p>
        </div>
      `;
    });
  },

  // Settings
  saveProfileSettings: function() {
    const name = document.getElementById('setting-user-name').value;
    const currency = document.getElementById('setting-currency-select').value;

    fetch('/api/settings/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, currency })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        alert('Profile preferences updated.');
        this.refreshAllData();
      }
    });
  },

  changeCurrency: function() {
    this.saveProfileSettings();
  },

  exportDataJSON: function() {
    this.showInAppLoader();
    const pid = this.currentUserProfileId || '';
    const exportUrl = `/api/settings/export/json?profile_id=${pid}`;
    const link = document.createElement('a');
    link.href = exportUrl;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      link.remove();
      this.hideInAppLoader();
    }, 400);
  },

  exportDataCSV: function() {
    this.showInAppLoader();
    const pid = this.currentUserProfileId || '';
    const exportUrl = `/api/settings/export/csv?profile_id=${pid}`;
    const link = document.createElement('a');
    link.href = exportUrl;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      link.remove();
      this.hideInAppLoader();
    }, 400);
  },

  openPrintReport: function() {
    const pid = this.currentUserProfileId || '';
    const month = new Date().toISOString().slice(0, 7);
    const reportUrl = `/report/monthly?profile_id=${pid}&month=${month}&autoprint=1`;
    const win = window.open(reportUrl, '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      window.location.href = reportUrl;
    }
  },

  importDataJSON: function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    this.showInAppLoader();
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonContent = JSON.parse(e.target.result);
        const pid = this.currentUserProfileId || '';
        fetch(`/api/settings/import/json?profile_id=${pid}`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Profile-ID': String(pid)
          },
          body: JSON.stringify(jsonContent)
        })
          .then(r => r.json())
          .then(res => {
            this.hideInAppLoader();
            event.target.value = '';
            if (res.success) {
              alert('Data snapshot successfully restored.');
              this.refreshAllData();
            } else {
              alert(res.error || 'Failed to import backup.');
            }
          })
          .catch(err => {
            this.hideInAppLoader();
            event.target.value = '';
            console.error('Import error:', err);
            alert('Failed to send backup data to server: ' + (err.message || 'Network error'));
          });
      } catch (err) {
        this.hideInAppLoader();
        event.target.value = '';
        alert('Invalid JSON file format. Please upload a valid MoneyTrack backup file.');
      }
    };
    reader.onerror = () => {
      this.hideInAppLoader();
      event.target.value = '';
      alert('Error reading backup file.');
    };
    reader.readAsText(file);
  },

  // ==========================================
  // REAL-TIME ANALYTICS & FINANCIAL TRENDS
  // ==========================================
  initAnalytics: function() {
    // Populate month filter dropdown with past 12 months
    const monthSelect = document.getElementById('analytics-month-filter');
    if (monthSelect) {
      monthSelect.innerHTML = '';
      const today = new Date();
      let cur = new Date(today.getFullYear(), today.getMonth(), 1);
      for (let i = 0; i < 12; i++) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const mKey = `${y}-${m}`;
        const lbl = cur.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        monthSelect.innerHTML += `<option value="${mKey}">${lbl}${i === 0 ? ' (Current)' : ''}</option>`;
        cur.setMonth(cur.getMonth() - 1);
      }
    }
  },

  onAnalyticsFilterChange: function() {
    const accEl = document.getElementById('analytics-account-filter');
    const monthEl = document.getElementById('analytics-month-filter');
    if (accEl) this.state.analyticsState.accountId = accEl.value;
    if (monthEl) this.state.analyticsState.monthYear = monthEl.value;
    this.loadAnalyticsView();
  },

  setAnalyticsTrendMode: function(mode) {
    this.state.analyticsState.trendMode = mode;
    document.querySelectorAll('.trend-mode-btn').forEach(btn => {
      btn.classList.remove('bg-white', 'dark:bg-slate-800', 'text-brand-600', 'dark:text-brand-400', 'shadow-sm');
      btn.classList.add('text-slate-600', 'dark:text-slate-400');
    });

    const activeBtn = document.getElementById(`btn-trend-${mode}`);
    if (activeBtn) {
      activeBtn.classList.remove('text-slate-600', 'dark:text-slate-400');
      activeBtn.classList.add('bg-white', 'dark:bg-slate-800', 'text-brand-600', 'dark:text-brand-400', 'shadow-sm');
    }

    if (this.state.analyticsState.data) {
      this.renderAnalyticsTrendLineChart(this.state.analyticsState.data);
    }
  },

  loadAnalyticsView: function() {
    const s = this.state.analyticsState;
    const url = `/api/analytics/summary?account_id=${s.accountId || 'ALL'}&month_year=${s.monthYear || ''}`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        this.state.analyticsState.data = data;
        const cur = data.currency || '₹';

        // 1. KPI Cards
        const incEl = document.getElementById('analytics-kpi-income');
        const incDeltaEl = document.getElementById('analytics-kpi-income-delta');
        const expEl = document.getElementById('analytics-kpi-expenses');
        const expDeltaEl = document.getElementById('analytics-kpi-expense-delta');
        const netEl = document.getElementById('analytics-kpi-net');
        const netDeltaEl = document.getElementById('analytics-kpi-net-delta');
        const savRateEl = document.getElementById('analytics-kpi-savings-rate');
        const savEl = document.getElementById('analytics-kpi-savings');

        if (incEl) incEl.textContent = Number(data.current.income || 0).toLocaleString();
        if (incDeltaEl) {
          const d = data.delta.income || 0;
          const pct = data.delta.income_pct || 0;
          incDeltaEl.textContent = `vs last month: ${d >= 0 ? '+' : ''}${cur}${d.toLocaleString()} (${pct >= 0 ? '+' : ''}${pct}%)`;
          incDeltaEl.className = d >= 0 ? 'text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block' : 'text-[11px] font-semibold text-slate-500 block';
        }

        if (expEl) expEl.textContent = Number(data.current.expenses || 0).toLocaleString();
        if (expDeltaEl) {
          const d = data.delta.expenses || 0;
          const pct = data.delta.expenses_pct || 0;
          expDeltaEl.textContent = `vs last month: ${d >= 0 ? '+' : ''}${cur}${d.toLocaleString()} (${pct >= 0 ? '+' : ''}${pct}%)`;
          expDeltaEl.className = d <= 0 ? 'text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block' : 'text-[11px] font-semibold text-rose-600 dark:text-rose-400 block';
        }

        if (netEl) netEl.textContent = Number(data.current.net_cashflow || 0).toLocaleString();
        if (netDeltaEl) {
          const net = data.current.net_cashflow || 0;
          netDeltaEl.textContent = net >= 0 ? 'Positive Net Cashflow' : 'Negative Net Cashflow (Deficit)';
          netDeltaEl.className = net >= 0 ? 'text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block' : 'text-[11px] font-semibold text-rose-600 dark:text-rose-400 block';
        }

        if (savRateEl) savRateEl.textContent = `${data.current.savings_rate || 0}%`;
        if (savEl) {
          const s = data.current.savings || 0;
          const spct = data.delta.savings_pct || 0;
          savEl.textContent = `Savings: ${cur}${s.toLocaleString()} (${spct >= 0 ? '+' : ''}${spct}%)`;
        }

        // 2. 50/30/20 Necessary vs Optional
        const r = data.ratio_50_30_20;
        const necEl = document.getElementById('analytics-needs-text');
        const optEl = document.getElementById('analytics-wants-text');
        const necBar = document.getElementById('analytics-needs-bar');
        const optBar = document.getElementById('analytics-wants-bar');
        const periodEl = document.getElementById('analytics-50-30-20-period');

        if (periodEl) periodEl.textContent = `${data.current_month_label}`;
        if (necEl) necEl.textContent = `Necessary Needs: ${r.necessary_pct}% (${cur}${Number(r.necessary_rupees || 0).toLocaleString()})`;
        if (optEl) optEl.textContent = `Optional Wants: ${r.optional_pct}% (${cur}${Number(r.optional_rupees || 0).toLocaleString()})`;
        if (necBar) necBar.style.width = `${r.necessary_pct}%`;
        if (optBar) optBar.style.width = `${r.optional_pct}%`;

        // 3. "What Changed?" English Summary Banner & Pills
        const bannerEl = document.getElementById('analytics-mom-summary-banner');
        const momSubEl = document.getElementById('analytics-mom-subtitle');
        if (momSubEl) momSubEl.textContent = `Comparing ${data.current_month_label} vs ${data.previous_month_label}`;

        if (bannerEl) {
          const incDelta = data.delta.income;
          const expDelta = data.delta.expenses;
          const incText = incDelta > 0 ? `Income increased by ${cur}${incDelta.toLocaleString()} (${data.delta.income_pct}%)` : (incDelta < 0 ? `Income decreased by ${cur}${Math.abs(incDelta).toLocaleString()} (${Math.abs(data.delta.income_pct)}%)` : `Income remained unchanged`);
          const expText = expDelta > 0 ? `Expenses increased by ${cur}${expDelta.toLocaleString()} (${data.delta.expenses_pct}%)` : (expDelta < 0 ? `Expenses decreased by ${cur}${Math.abs(expDelta).toLocaleString()} (${Math.abs(data.delta.expenses_pct)}%)` : `Expenses remained unchanged`);
          bannerEl.textContent = `${incText}. ${expText}.`;
        }

        const momIncPill = document.getElementById('mom-income-pill');
        const momExpPill = document.getElementById('mom-expense-pill');
        const momSavPill = document.getElementById('mom-savings-pill');
        const momNetPill = document.getElementById('mom-net-pill');

        if (momIncPill) momIncPill.textContent = `${data.delta.income >= 0 ? '+' : ''}${cur}${Number(data.delta.income).toLocaleString()} (${data.delta.income_pct >= 0 ? '+' : ''}${data.delta.income_pct}%)`;
        if (momExpPill) momExpPill.textContent = `${data.delta.expenses >= 0 ? '+' : ''}${cur}${Number(data.delta.expenses).toLocaleString()} (${data.delta.expenses_pct >= 0 ? '+' : ''}${data.delta.expenses_pct}%)`;
        if (momSavPill) momSavPill.textContent = `${data.delta.savings >= 0 ? '+' : ''}${cur}${Number(data.delta.savings).toLocaleString()} (${data.delta.savings_pct >= 0 ? '+' : ''}${data.delta.savings_pct}%)`;
        if (momNetPill) momNetPill.textContent = `${data.delta.net_cashflow >= 0 ? '+' : ''}${cur}${Number(data.delta.net_cashflow).toLocaleString()}`;

        // 4. MoM Category Spending Table
        const momTable = document.getElementById('analytics-mom-table-body');
        if (momTable) {
          momTable.innerHTML = '';
          const cats = data.category_deltas || [];
          if (cats.length === 0) {
            momTable.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-slate-400">No category spending records found for this period.</td></tr>`;
          } else {
            cats.forEach(c => {
              const dAmt = c.delta;
              const dPct = c.delta_pct;
              const isUp = dAmt > 0;
              const isDown = dAmt < 0;
              const deltaColor = isDown ? 'text-emerald-600 dark:text-emerald-400' : (isUp ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500');
              const trendBadge = isDown
                ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Decreased</span>`
                : (isUp
                  ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">Increased</span>`
                  : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">Unchanged</span>`);

              momTable.innerHTML += `
                <tr>
                  <td class="py-2.5 flex items-center space-x-2">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${c.color};"></span>
                    <span class="font-bold text-slate-900 dark:text-white">${this.escapeHtml(c.name)}</span>
                  </td>
                  <td class="py-2.5 text-slate-500">${cur}${Number(c.last_month).toLocaleString()}</td>
                  <td class="py-2.5 text-slate-900 dark:text-white font-semibold">${cur}${Number(c.this_month).toLocaleString()}</td>
                  <td class="py-2.5 font-bold ${deltaColor}">${dAmt >= 0 ? '+' : ''}${cur}${Number(dAmt).toLocaleString()} (${dPct >= 0 ? '+' : ''}${dPct}%)</td>
                  <td class="py-2.5 text-right">${trendBadge}</td>
                </tr>
              `;
            });
          }
        }

        // 5. Render Charts
        this.renderAnalyticsCharts(data);
      })
      .catch(err => {
        console.error("Error loading analytics summary:", err);
      });
  },

  renderAnalyticsCharts: function(data) {
    this.renderCategoryExpenseChart(data);
    this.renderAnalyticsTrendLineChart(data);
  },

  renderCategoryExpenseChart: function(data) {
    const ctx = document.getElementById('analytics-chart-canvas');
    if (!ctx || typeof Chart === 'undefined') return;

    if (this.state.analyticsState.categoryChart) {
      this.state.analyticsState.categoryChart.destroy();
      this.state.analyticsState.categoryChart = null;
    }

    const categories = data.category_spending || [];
    const breakdownEl = document.getElementById('analytics-category-breakdown');
    if (breakdownEl) {
      breakdownEl.innerHTML = '';
      if (categories.length === 0) {
        breakdownEl.innerHTML = `<div class="p-4 text-center text-slate-400 text-xs">No category expenses recorded for ${data.current_month_label}.</div>`;
      } else {
        categories.forEach(c => {
          breakdownEl.innerHTML += `
            <div class="p-2.5 rounded-xl border border-gray-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <div class="flex items-center space-x-2">
                <span class="w-3 h-3 rounded-full shrink-0" style="background-color: ${c.color};"></span>
                <span class="font-semibold text-slate-800 dark:text-slate-200">${this.escapeHtml(c.name)}</span>
              </div>
              <div class="text-right">
                <span class="font-bold text-slate-900 dark:text-white">${data.currency}${Number(c.spent).toLocaleString()}</span>
                <span class="text-[10px] text-slate-400 block">${c.percentage}%</span>
              </div>
            </div>
          `;
        });
      }
    }

    const labels = categories.length > 0 ? categories.map(c => c.name) : ['No Expenses'];
    const values = categories.length > 0 ? categories.map(c => c.spent) : [1];
    const colors = categories.length > 0 ? categories.map(c => c.color || '#3b82f6') : ['#94a3b8'];

    this.state.analyticsState.categoryChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: this.state.theme === 'dark' ? '#090d16' : '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(item) {
                if (categories.length === 0) return 'No Expenses Logged';
                return ` ${item.label}: ${data.currency}${item.raw.toLocaleString()}`;
              }
            }
          }
        },
        cutout: '68%'
      }
    });
  },

  renderAnalyticsTrendLineChart: function(data) {
    const ctx = document.getElementById('analytics-trend-line-chart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (this.state.analyticsState.lineChart) {
      this.state.analyticsState.lineChart.destroy();
      this.state.analyticsState.lineChart = null;
    }

    const mode = this.state.analyticsState.trendMode || 'income';
    const isDark = this.state.theme === 'dark';
    const gridColor = isDark ? 'rgba(51, 65, 85, 0.25)' : 'rgba(226, 232, 240, 0.8)';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    let chartData = {};
    if (mode === 'comparison') {
      const daily = data.daily_comparison || [];
      chartData = {
        labels: daily.map(d => `Day ${d.day}`),
        datasets: [
          {
            label: `${data.current_month_label} Cumulative (₹)`,
            data: daily.map(d => d.cum_curr_expense),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.3,
            borderWidth: 2.5,
            pointRadius: 2
          },
          {
            label: `${data.previous_month_label} Cumulative (₹)`,
            data: daily.map(d => d.cum_prev_expense),
            borderColor: '#94a3b8',
            borderDash: [5, 5],
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 1
          }
        ]
      };
    } else {
      const history = data.trend_history || [];
      let label = 'Monthly Income (₹)';
      let color = '#10b981';
      let bg = 'rgba(16, 185, 129, 0.1)';
      let values = history.map(h => h.income);

      if (mode === 'expense') {
        label = 'Monthly Expenses (₹)';
        color = '#f43f5e';
        bg = 'rgba(244, 63, 94, 0.1)';
        values = history.map(h => h.expenses);
      } else if (mode === 'savings') {
        label = 'Monthly Savings (₹)';
        color = '#3b82f6';
        bg = 'rgba(59, 130, 246, 0.1)';
        values = history.map(h => h.savings);
      }

      chartData = {
        labels: history.map(h => h.label),
        datasets: [{
          label: label,
          data: values,
          borderColor: color,
          backgroundColor: bg,
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: color
        }]
      };
    }

    this.state.analyticsState.lineChart = new Chart(ctx, {
      type: 'line',
      data: chartData,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: textColor, boxWidth: 12, font: { size: 11, weight: 'bold' } }
          },
          tooltip: {
            callbacks: {
              label: function(item) {
                return ` ${item.dataset.label}: ${data.currency}${Number(item.raw).toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 10 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              font: { size: 10 },
              callback: function(v) {
                if (v >= 1000) return `${data.currency}${(v / 1000).toFixed(0)}k`;
                return `${data.currency}${v}`;
              }
            }
          }
        }
      }
    });
  },

  initChart: function() {
    this.initAnalytics();
  },

  updateAnalyticsChart: function() {
    this.loadAnalyticsView();
  },

  // Modals
  openModal: function(modalId) {
    const m = document.getElementById(modalId);
    if (m) {
      m.classList.remove('hidden');
      if (modalId === 'notifications-modal') {
        this.switchNotifTab(this.state.activeNotifTab || 'alerts');
      }
    }
  },

  closeModal: function(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.add('hidden');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    MoneyTrackApp.init();
  });
} else {
  MoneyTrackApp.init();
}
