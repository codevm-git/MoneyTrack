/**
 * MoneyTrack Application Configuration
 * Centralized version, stage, and application metadata
 */
const APP_CONFIG = {
  name: "MoneyTrack",
  version: "0.1.9",
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
    quizState: { lessonId: null, currentQ: 0, score: 0, questions: [] }
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
    this.initChart();
    this.checkAuthState();
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

    if (viewId === 'analytics') {
      this.updateAnalyticsChart();
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
    Promise.all([
      fetch('/api/dashboard').then(r => r.json()),
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

      this.renderHeaderAndUser();
      this.renderDashboard(dashData);
      this.renderAccounts();
      this.populateAccountSelects();
      this.renderTransactionsTable();
      this.renderGoals();
      this.renderCalendar();
      this.renderAchievements();
      this.renderAppVersionInfo();
      this.hideInAppLoader();
    }).catch(err => {
      console.error("Error refreshing data:", err);
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

    // Render Financial Health
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

    // Render Category Spending Breakdown & Donut Chart
    const donutSvg = document.getElementById('dashboard-donut-svg');
    const legendContainer = document.getElementById('dashboard-spending-legend');
    const topCatLbl = document.getElementById('donut-top-category-lbl');

    if (legendContainer) {
      legendContainer.innerHTML = '';
      const catSpendings = data.category_spending || [];

      if (catSpendings.length === 0) {
        legendContainer.innerHTML = '<div class="text-xs text-slate-400 py-2">No expenses recorded yet.</div>';
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

        // Legend Rendering with Truncation (Safety against text overflow)
        catSpendings.forEach(cat => {
          legendContainer.innerHTML += `
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2 min-w-0">
                <span class="w-3 h-3 rounded-full shrink-0 inline-block" style="background-color: ${cat.color}"></span>
                <span class="text-slate-600 dark:text-slate-300 font-medium truncate max-w-[130px]">${cat.name}</span>
              </div>
              <span class="font-bold text-slate-900 dark:text-white shrink-0">${this.state.user.currency}${cat.spent.toLocaleString()}</span>
            </div>
          `;
        });
      }
    }

    // Render Budgets Overview
    const budgetContainer = document.getElementById('budget-items-list');
    budgetContainer.innerHTML = '';
    data.budgets.forEach(b => {
      budgetContainer.innerHTML += `
        <div class="space-y-1.5 text-xs">
          <div class="flex justify-between items-center font-semibold">
            <span class="text-slate-800 dark:text-slate-200">${b.name}</span>
            <div class="flex items-center space-x-2">
              <span class="text-slate-500">${this.state.user.currency}${b.spent.toLocaleString()} / ${this.state.user.currency}${b.limit.toLocaleString()}</span>
              <button onclick="MoneyTrackApp.promptSetBudget('${b.name}', ${b.limit})" class="text-[10px] text-slate-400 hover:text-brand-600 transition" title="Adjust Budget">
                <svg class="w-3.5 h-3.5 inline stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${b.badge_color}">${b.status}</span>
            </div>
          </div>
          <div class="w-full bg-gray-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div class="${b.bar_color} h-full transition-all duration-500" style="width: ${b.pct}%"></div>
          </div>
        </div>
      `;
    });

    // Render Alerts
    const alertsContainer = document.getElementById('dashboard-alerts-list');
    if (alertsContainer) {
      alertsContainer.innerHTML = '';
      if (!data.alerts || data.alerts.length === 0) {
        alertsContainer.innerHTML = `
          <div class="p-3 rounded-xl border border-brand-200 dark:border-brand-900/40 bg-brand-50/50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 text-xs flex items-center space-x-3">
            <svg class="w-4 h-4 shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span class="font-medium text-slate-700 dark:text-slate-300">All accounts and budgets are currently in healthy standing. No live warnings detected.</span>
          </div>
        `;
      } else {
        data.alerts.forEach(a => {
          const isDanger = a.type === 'danger';
          const isWarning = a.type === 'warning';
          const bg = isDanger ? 'bg-accent-rose/10 border-accent-rose/20 text-accent-rose'
                     : (isWarning ? 'bg-accent-amber/10 border-accent-amber/20 text-accent-amber' : 'bg-brand-50 dark:bg-brand-900/30 border-brand-200 dark:border-brand-900/40 text-brand-600');
          alertsContainer.innerHTML += `
            <div class="p-3 rounded-xl border ${bg} text-xs flex items-center space-x-3">
              <svg class="w-5 h-5 shrink-0 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span class="text-slate-800 dark:text-slate-200 font-medium">${a.message}</span>
            </div>
          `;
        });
      }
    }

    // Render Notifications Modal List
    const notifContainer = document.getElementById('notifications-modal-list');
    if (notifContainer) {
      notifContainer.innerHTML = '';
      if (!data.alerts || data.alerts.length === 0) {
        notifContainer.innerHTML = `
          <div class="p-5 rounded-xl border border-gray-100 dark:border-slate-800 text-center space-y-1.5">
            <svg class="w-8 h-8 mx-auto stroke-current fill-none stroke-2 text-brand-500" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <p class="font-bold text-xs text-slate-800 dark:text-white">Zero Active Risk Alerts</p>
            <p class="text-[11px] text-slate-400">Your accounts, budgets, and bills are all on schedule.</p>
          </div>
        `;
      } else {
        data.alerts.forEach(a => {
          const isDanger = a.type === 'danger';
          const isWarning = a.type === 'warning';
          const cardBorder = isDanger ? 'border-accent-rose/30 bg-accent-rose/5' : (isWarning ? 'border-accent-amber/30 bg-accent-amber/5' : 'border-brand-500/20 bg-brand-50/5');
          const badgeClass = isDanger ? 'bg-accent-rose text-white' : (isWarning ? 'bg-accent-amber text-white' : 'bg-brand-600 text-white');
          notifContainer.innerHTML += `
            <div class="p-3.5 rounded-xl border ${cardBorder} space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="font-bold text-xs text-slate-900 dark:text-white">${a.title || (isDanger ? 'Critical Financial Alert' : (isWarning ? 'Budget Warning' : 'Financial Notice'))}</span>
                <span class="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${badgeClass}">${a.type}</span>
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">${a.message}</p>
            </div>
          `;
        });
      }
    }

    // Update Notification Bell Count
    const bellBadge = document.getElementById('alert-badge-count');
    if (bellBadge) {
      const warningCount = (data.alerts || []).filter(a => a.type !== 'success').length;
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
        <div class="col-span-full p-6 rounded-2xl border border-dashed border-gray-200 dark:border-slate-800 text-center text-xs text-slate-400 space-y-2">
          <p class="font-semibold text-slate-700 dark:text-slate-300">No accounts configured yet.</p>
          <p>Click "+ New Account" to add your bank account, cash wallet, or credit card.</p>
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
      const icon = typeIcons[acc.account_type] || '<svg class="w-4 h-4 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
      const badgeStyle = typeBadgeStyles[acc.account_type] || 'bg-gray-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-gray-200';
      const isCredit = acc.account_type === 'credit_card';
      const isNegative = acc.current_balance < 0;

      let balDisplay = `${this.state.user.currency}${Math.abs(acc.current_balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      let balColor = 'text-slate-900 dark:text-white';
      let balSubtext = 'Available Balance';

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
                    <span>${acc.name}</span>
                    ${isDefaultBadge}
                  </div>
                  <span class="inline-block mt-0.5 px-2 py-0.5 rounded border text-[10px] font-semibold ${badgeStyle}">
                    ${acc.type_label}
                  </span>
                </div>
              </div>
              <div class="flex items-center space-x-1">
                <button onclick="MoneyTrackApp.filterByAccount(${acc.id})" title="Filter transactions for this account" class="p-1 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition">
                  <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                </button>
                <button onclick="MoneyTrackApp.deleteAccount(${acc.id}, '${acc.name.replace(/'/g, "\\'")}')" title="Delete account" class="p-1 rounded-lg text-slate-400 hover:text-accent-rose hover:bg-gray-100 dark:hover:bg-slate-800 transition">
                  <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
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
    const xferFrom = document.getElementById('transfer-form-from');
    const xferTo = document.getElementById('transfer-form-to');
    const goalAccount = document.getElementById('goal-form-account');
    const goalActionAcc = document.getElementById('goal-action-account');

    if (filterSelect) {
      const curFilterVal = filterSelect.value || 'ALL';
      filterSelect.innerHTML = '<option value="ALL">All Accounts</option>';
      this.state.accounts.forEach(acc => {
        filterSelect.innerHTML += `<option value="${acc.id}">${acc.name} (${acc.type_label})</option>`;
      });
      filterSelect.value = curFilterVal;
    }

    if (formSelect) {
      const curFormVal = formSelect.value;
      formSelect.innerHTML = '';
      this.state.accounts.forEach(acc => {
        formSelect.innerHTML += `<option value="${acc.id}">${acc.name} (${acc.type_label})</option>`;
      });
      // Pick default account if available and no previous selection
      const defAcc = this.state.accounts.find(a => a.is_default) || this.state.accounts[0];
      if (curFormVal && this.state.accounts.some(a => String(a.id) === String(curFormVal))) {
        formSelect.value = curFormVal;
      } else if (defAcc) {
        formSelect.value = defAcc.id;
      }
    }

    if (xferFrom && xferTo) {
      const curFrom = xferFrom.value;
      const curTo = xferTo.value;
      xferFrom.innerHTML = '';
      xferTo.innerHTML = '';
      this.state.accounts.forEach(acc => {
        xferFrom.innerHTML += `<option value="${acc.id}">${acc.name} (${acc.type_label})</option>`;
        xferTo.innerHTML += `<option value="${acc.id}">${acc.name} (${acc.type_label})</option>`;
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

    if (goalAccount) {
      const curVal = goalAccount.value;
      goalAccount.innerHTML = '<option value="">Do not deduct from an account</option>';
      this.state.accounts.forEach(acc => {
        goalAccount.innerHTML += `<option value="${acc.id}">${acc.name} (${acc.type_label})</option>`;
      });
      if (curVal) goalAccount.value = curVal;
    }

    if (goalActionAcc) {
      const curVal = goalActionAcc.value;
      goalActionAcc.innerHTML = '<option value="">Select Account / Wallet (Optional)</option>';
      this.state.accounts.forEach(acc => {
        goalActionAcc.innerHTML += `<option value="${acc.id}">${acc.name} (${acc.type_label})</option>`;
      });
      if (curVal) goalActionAcc.value = curVal;
    }
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
      alert('Please enter an account name.');
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
        this.refreshAllData();
      } else {
        alert(res.error || 'Failed to create account.');
      }
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

  openTransferModal: function() {
    if (this.state.accounts.length < 2) {
      alert('Please create at least 2 accounts or wallets before making a transfer.');
      return;
    }
    this.populateAccountSelects();
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
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      if (errEl) {
        errEl.textContent = 'Please enter a valid transfer amount greater than 0.';
        errEl.classList.remove('hidden');
      }
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
          this.refreshAllData();
        } else {
          if (errEl) {
            errEl.textContent = res.error || 'Failed to complete transfer.';
            errEl.classList.remove('hidden');
          } else {
            alert(res.error || 'Failed to complete transfer.');
          }
        }
      })
      .catch(err => {
        console.error('Transfer error:', err);
        if (errEl) {
          errEl.textContent = 'An unexpected error occurred.';
          errEl.classList.remove('hidden');
        }
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
      const amtColor = isIncome ? 'text-brand-600 dark:text-brand-400 font-bold' : (isTransfer ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-900 dark:text-white font-bold');
      const sign = isIncome ? '+' : (isTransfer ? '↔ ' : '-');
      const accName = tx.account_name || 'Unassigned';
      const accIcon = typeIcons[tx.account_type] || '<svg class="w-3.5 h-3.5 stroke-current fill-none stroke-2 inline-block" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>';
      const tagDisplay = isTransfer ? 'Transfer' : (tx.typeTag || tx.type);

      tbody.innerHTML += `
        <tr class="hover:bg-gray-50/50 dark:hover:bg-slate-900/40 transition">
          <td class="py-3 px-4 font-medium text-slate-500">${tx.date}</td>
          <td class="py-3 px-4 font-semibold text-slate-900 dark:text-white">${tx.description}</td>
          <td class="py-3 px-4"><span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">${tx.category}</span></td>
          <td class="py-3 px-4">
            <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-gray-200 dark:border-slate-700">
              <span>${accIcon}</span>
              <span>${accName}</span>
            </span>
          </td>
          <td class="py-3 px-4"><span class="capitalize text-slate-500">${tagDisplay}</span></td>
          <td class="py-3 px-4 text-right ${amtColor}">${sign}${this.state.user.currency}${parseFloat(tx.amount).toLocaleString()}</td>
          <td class="py-3 px-4 text-center">
            <button onclick="MoneyTrackApp.promptEditTransaction('${tx.id}')" class="p-1 rounded text-slate-400 hover:text-brand-600 transition mr-1" title="Edit Transaction">
              <svg class="w-4 h-4 stroke-current fill-none stroke-2 inline" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button onclick="MoneyTrackApp.deleteTransaction('${tx.id}')" class="p-1 rounded text-slate-400 hover:text-accent-rose transition" title="Delete Transaction">
              <svg class="w-4 h-4 stroke-current fill-none stroke-2 inline" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </td>
        </tr>
      `;
    });
  },

  openAddTransactionModal: function(type) {
    document.getElementById('tx-form-type').value = type;
    document.getElementById('tx-modal-title').textContent = type === 'income' ? 'Add Income' : 'Add Expense';
    document.getElementById('tx-form-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('tx-form-amount').value = '';
    document.getElementById('tx-form-desc').value = '';

    // Toggle necessity container: hide for income, show for expense
    const necContainer = document.getElementById('tx-form-necessity-container');
    if (necContainer) {
      if (type === 'income') {
        necContainer.classList.add('hidden');
      } else {
        necContainer.classList.remove('hidden');
      }
    }

    // Populate category dropdown based on type
    const catSelect = document.getElementById('tx-form-category');
    if (catSelect) {
      catSelect.innerHTML = '';
      if (type === 'income') {
        const incomeCats = ['Salary', 'Freelance', 'Investments', 'Rental', 'Bonus', 'Gifts', 'Other Income'];
        incomeCats.forEach(c => {
          catSelect.innerHTML += `<option value="${c}">${c}</option>`;
        });
      } else {
        const expenseCats = ['Housing', 'Food & Dining', 'Transportation', 'Utilities', 'Healthcare', 'Entertainment', 'Shopping', 'Personal', 'Education', 'Debt & Loans', 'Savings & Investments', 'Other'];
        expenseCats.forEach(c => {
          catSelect.innerHTML += `<option value="${c}">${c}</option>`;
        });
      }
    }

    this.populateAccountSelects();
    this.openModal('add-tx-modal');
  },

  submitTransactionForm: function(e) {
    e.preventDefault();
    const type = document.getElementById('tx-form-type').value;
    const amount = parseFloat(document.getElementById('tx-form-amount').value);
    const desc = document.getElementById('tx-form-desc').value;
    const category = document.getElementById('tx-form-category').value;
    const date = document.getElementById('tx-form-date').value;
    const typeTagInput = document.querySelector('input[name="tx_type_tag"]:checked');
    const typeTag = type === 'income' ? 'necessary' : (typeTagInput ? typeTagInput.value : 'necessary');
    const accountEl = document.getElementById('tx-form-account');
    const account_id = accountEl && accountEl.value ? parseInt(accountEl.value) : null;

    fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, amount, description: desc, category, date, typeTag, account_id })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.closeModal('add-tx-modal');
        this.refreshAllData();
      } else {
        alert(res.error || 'Failed to save transaction.');
      }
    });
  },

  promptEditTransaction: function(id) {
    const tx = this.state.transactions.find(t => String(t.id) === String(id));
    if (!tx) return;
    const newDesc = prompt('Edit Description:', tx.description);
    if (!newDesc) return;
    const newAmtStr = prompt('Edit Amount (' + this.state.user.currency + '):', tx.amount);
    if (!newAmtStr) return;
    const newAmt = parseFloat(newAmtStr);
    if (isNaN(newAmt) || newAmt <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }
    const newDate = prompt('Edit Date (YYYY-MM-DD):', tx.date);
    if (!newDate) return;

    fetch('/api/transactions/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: newDesc,
        amount: newAmt,
        date: newDate,
        category: tx.category,
        type: tx.type,
        account_id: tx.account_id
      })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.refreshAllData();
      } else {
        alert(res.error || 'Failed to update transaction.');
      }
    });
  },

  deleteTransaction: function(id) {
    if (confirm('Delete this transaction?')) {
      fetch('/api/transactions/' + id, { method: 'DELETE' })
        .then(r => r.json())
        .then(() => this.refreshAllData());
    }
  },

  promptSetBudget: function(category, currentLimit) {
    const limitStr = prompt(`Set monthly spending limit for ${category} (${this.state.user.currency}):`, currentLimit);
    if (!limitStr) return;
    const limit = parseFloat(limitStr);
    if (isNaN(limit) || limit <= 0) {
      alert('Please enter a valid positive budget limit.');
      return;
    }
    fetch('/api/budgets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: category, limit: limit })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.refreshAllData();
      } else {
        alert(res.error || 'Failed to update budget.');
      }
    });
  },

  // Goals
  renderGoals: function() {
    const container = document.getElementById('goals-grid-container');
    container.innerHTML = '';

    this.state.goals.forEach(goal => {
      container.innerHTML += `
        <div class="p-6 rounded-2xl bg-white dark:bg-slate-950 border border-gray-200 dark:border-slate-800 space-y-4 flex flex-col justify-between shadow-sm">
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="font-bold text-slate-900 dark:text-white text-base">${goal.name}</h3>
              <span class="text-xs font-bold text-brand-600 dark:text-brand-400">${goal.pct}%</span>
            </div>

            <div class="text-xl font-bold text-slate-900 dark:text-white">
              ${this.state.user.currency}${goal.currentAmount.toLocaleString()} <span class="text-xs text-slate-400 font-normal">/ ${this.state.user.currency}${goal.targetAmount.toLocaleString()}</span>
            </div>

            <div class="w-full bg-gray-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div class="bg-brand-500 h-full transition-all duration-500" style="width: ${goal.pct}%"></div>
            </div>

            <div class="flex justify-between text-xs text-slate-400 pt-1">
              <span>${this.state.user.currency}${goal.remaining.toLocaleString()} remaining</span>
              <span>Target: ${goal.date}</span>
            </div>
          </div>

          <div class="flex items-center space-x-2 pt-2 border-t border-gray-100 dark:border-slate-800">
            <button onclick="MoneyTrackApp.openGoalActionModal('${goal.id}', 'deposit')" class="flex-1 py-2 px-2.5 rounded-xl bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 text-xs font-semibold hover:bg-brand-100 transition">+ Deposit</button>
            <button onclick="MoneyTrackApp.openGoalActionModal('${goal.id}', 'withdraw')" class="py-2 px-2.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-slate-700 transition" title="Withdraw Funds">- Withdraw</button>
            <button onclick="MoneyTrackApp.promptEditGoal('${goal.id}')" class="p-2 rounded-xl text-slate-400 hover:text-brand-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition" title="Edit Goal">
              <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button onclick="MoneyTrackApp.deleteGoal('${goal.id}')" class="p-2 rounded-xl text-slate-400 hover:text-accent-rose hover:bg-gray-100 dark:hover:bg-slate-800 transition" title="Delete Goal">
              <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    });
  },

  submitGoalForm: function(e) {
    e.preventDefault();
    const name = document.getElementById('goal-form-name').value;
    const targetAmount = parseFloat(document.getElementById('goal-form-target').value);
    const currentAmount = parseFloat(document.getElementById('goal-form-current').value || 0);
    const date = document.getElementById('goal-form-date').value;
    const accEl = document.getElementById('goal-form-account');
    const account_id = accEl && accEl.value ? parseInt(accEl.value) : null;

    fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, targetAmount, currentAmount, date, account_id })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.closeModal('add-goal-modal');
        this.refreshAllData();
      } else {
        alert(res.error || 'Failed to create goal');
      }
    });
  },

  openGoalActionModal: function(goalId, actionType) {
    const goal = this.state.goals.find(g => String(g.id) === String(goalId));
    if (!goal) return;

    this.populateAccountSelects();
    document.getElementById('goal-action-id').value = goalId;
    document.getElementById('goal-action-type').value = actionType;
    document.getElementById('goal-action-amount').value = '';

    const isDeposit = actionType === 'deposit';
    document.getElementById('goal-action-modal-title').textContent = isDeposit ? `Deposit to ${goal.name}` : `Withdraw from ${goal.name}`;
    document.getElementById('goal-action-submit-btn').textContent = isDeposit ? 'Confirm Deposit' : 'Confirm Withdrawal';

    const label = document.getElementById('goal-action-account-label');
    if (label) {
      label.textContent = isDeposit ? 'Deduct from Account / Wallet (Optional)' : 'Credit to Account / Wallet (Optional)';
    }

    this.openModal('goal-action-modal');
  },

  submitGoalAction: function(e) {
    e.preventDefault();
    const goalId = document.getElementById('goal-action-id').value;
    const actionType = document.getElementById('goal-action-type').value;
    const amount = parseFloat(document.getElementById('goal-action-amount').value);
    const accEl = document.getElementById('goal-action-account');
    const account_id = accEl && accEl.value ? parseInt(accEl.value) : null;

    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }

    const endpoint = actionType === 'deposit' ? `/api/goals/${goalId}/deposit` : `/api/goals/${goalId}/withdraw`;
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amount, account_id: account_id })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.closeModal('goal-action-modal');
        this.refreshAllData();
      } else {
        alert(res.error || `Failed to ${actionType} funds.`);
      }
    }).catch(err => {
      console.error('Goal action error:', err);
      alert('An unexpected error occurred.');
    });
  },

  promptEditGoal: function(id) {
    const goal = this.state.goals.find(g => String(g.id) === String(id));
    if (!goal) return;
    const newName = prompt('Edit Goal Title:', goal.name);
    if (!newName) return;
    const newTargetStr = prompt('Edit Target Amount (' + this.state.user.currency + '):', goal.targetAmount);
    if (!newTargetStr) return;
    const newTarget = parseFloat(newTargetStr);
    if (isNaN(newTarget) || newTarget <= 0) {
      alert('Please enter a valid positive target amount.');
      return;
    }
    const newDate = prompt('Edit Target Date (YYYY-MM-DD):', goal.date);
    if (!newDate) return;

    fetch(`/api/goals/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, targetAmount: newTarget, date: newDate })
    }).then(r => r.json()).then(res => {
      if (res.success) {
        this.refreshAllData();
      } else {
        alert(res.error || 'Failed to update goal.');
      }
    });
  },

  deleteGoal: function(id) {
    if (confirm('Delete this savings goal?')) {
      fetch('/api/goals/' + id, { method: 'DELETE' }).then(() => this.refreshAllData());
    }
  },

  // Calendar
  renderCalendar: function() {
    const container = document.getElementById('calendar-timeline-events');
    if (!container) return;
    container.innerHTML = '';

    let upcomingInc = 0;
    let upcomingExp = 0;

    this.state.calendarEvents.forEach(ev => {
      const isInc = ev.type === 'income';
      if (isInc) upcomingInc += ev.amount;
      else upcomingExp += ev.amount;

      const iconColor = isInc ? 'text-brand-600 bg-brand-50 dark:bg-brand-900/30' : 'text-accent-rose bg-accent-rose/10';
      const sign = isInc ? '+' : '-';

      container.innerHTML += `
        <div class="p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <div class="flex items-center space-x-3">
            <div class="p-2 rounded-lg ${iconColor}">
              <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            </div>
            <div>
              <span class="font-bold text-slate-900 dark:text-white block">${ev.title}</span>
              <span class="text-slate-400 text-[11px]">${ev.date}</span>
            </div>
          </div>
          <div class="flex items-center space-x-3">
            <span class="font-bold ${isInc ? 'text-brand-600' : 'text-slate-900 dark:text-white'}">${sign}${this.state.user.currency}${ev.amount.toLocaleString()}</span>
            <button onclick="MoneyTrackApp.deleteCalendarEvent('${ev.id}')" class="p-1 text-slate-400 hover:text-accent-rose">
              <svg class="w-4 h-4 stroke-current fill-none stroke-2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            </button>
          </div>
        </div>
      `;
    });

    const projected = Math.max(0, upcomingInc - upcomingExp);
    const projEl = document.getElementById('cal-projected-end');
    if (projEl) projEl.textContent = projected.toLocaleString();
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

  // Simulator
  switchSimulatorTab: function(tab) {
    document.getElementById('sim-panel-scenario').classList.add('hidden');
    document.getElementById('sim-panel-afford').classList.add('hidden');
    document.getElementById('sim-tab-btn-scenario').classList.replace('text-brand-600', 'text-slate-400');
    document.getElementById('sim-tab-btn-afford').classList.replace('text-brand-600', 'text-slate-400');

    if (tab === 'scenario') {
      document.getElementById('sim-panel-scenario').classList.remove('hidden');
      document.getElementById('sim-tab-btn-scenario').classList.replace('text-slate-400', 'text-brand-600');
    } else {
      document.getElementById('sim-panel-afford').classList.remove('hidden');
      document.getElementById('sim-tab-btn-afford').classList.replace('text-slate-400', 'text-brand-600');
      this.evaluateAffordability();
    }
  },

  updateScenarioInputs: function() {
    this.runSimulation();
  },

  runSimulation: function() {
    const scenarioType = document.getElementById('sim-scenario-type').value;
    const changeAmount = parseFloat(document.getElementById('sim-change-amt').value) || 0;

    fetch('/api/simulate/what-if', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario_type: scenarioType, change_amount: changeAmount })
    }).then(r => r.json()).then(res => {
      document.getElementById('sim-curr-savings').textContent = res.curr_savings.toLocaleString();
      document.getElementById('sim-simulated-savings').textContent = res.sim_savings.toLocaleString();
      document.getElementById('sim-curr-annual').textContent = res.curr_annual.toLocaleString();
      document.getElementById('sim-simulated-annual').textContent = res.sim_annual.toLocaleString();
      document.getElementById('sim-curr-rate').textContent = res.curr_rate;
      document.getElementById('sim-simulated-rate').textContent = res.sim_rate;
      document.getElementById('sim-goal-accel').textContent = res.goal_accel;

      const card = document.getElementById('sim-simulated-savings-card');
      const label = document.getElementById('sim-simulated-savings-label');
      const num = document.getElementById('sim-simulated-savings-num');
      const accelPill = document.getElementById('sim-goal-accel-pill');

      if (res.impact === 'negative') {
        if (card) card.className = 'p-5 rounded-2xl bg-accent-rose/10 border border-accent-rose/30 space-y-2';
        if (label) label.className = 'text-xs font-semibold text-accent-rose';
        if (num) num.className = 'text-2xl font-bold text-accent-rose';
        if (accelPill) accelPill.className = 'px-3 py-1 rounded-full text-xs font-bold bg-accent-rose/10 text-accent-rose border border-accent-rose/20 inline-block';
      } else if (res.impact === 'neutral') {
        if (card) card.className = 'p-5 rounded-2xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-800 space-y-2';
        if (label) label.className = 'text-xs font-semibold text-slate-500';
        if (num) num.className = 'text-2xl font-bold text-slate-700 dark:text-slate-300';
        if (accelPill) accelPill.className = 'px-3 py-1 rounded-full text-xs font-bold bg-gray-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-gray-200 dark:border-slate-700 inline-block';
      } else {
        if (card) card.className = 'p-5 rounded-2xl bg-brand-50/50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-900/40 space-y-2';
        if (label) label.className = 'text-xs font-semibold text-brand-600 dark:text-brand-400';
        if (num) num.className = 'text-2xl font-bold text-brand-600 dark:text-brand-400';
        if (accelPill) accelPill.className = 'px-3 py-1 rounded-full text-xs font-bold bg-brand-100 dark:bg-brand-950 text-brand-700 dark:text-brand-400 border border-brand-200 dark:border-brand-800 inline-block';
      }
    });
  },

  evaluateAffordability: function() {
    const itemName = document.getElementById('afford-item-name').value;
    const price = parseFloat(document.getElementById('afford-item-price').value) || 0;

    fetch('/api/simulate/affordability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_name: itemName, price: price })
    }).then(r => r.json()).then(res => {
      document.getElementById('afford-curr-reserve').textContent = res.current_reserve.toLocaleString();
      document.getElementById('afford-post-reserve').textContent = res.post_reserve.toLocaleString();
      document.getElementById('afford-months-cov').textContent = `${res.coverage_months} Months`;
      document.getElementById('afford-summary-text').textContent = res.summary_text;

      const card = document.getElementById('afford-result-card');
      const badge = document.getElementById('afford-cov-badge');
      if (res.status === 'safe') {
        if (card) card.className = 'p-4 rounded-xl bg-brand-50/50 dark:bg-brand-950/20 border border-brand-200 dark:border-brand-900/40 space-y-3';
        if (badge) {
          badge.className = 'text-xs font-semibold text-brand-600 dark:text-brand-400';
          badge.textContent = '(Healthy Emergency Cushion)';
        }
      } else if (res.status === 'warning') {
        if (card) card.className = 'p-4 rounded-xl bg-accent-amber/10 border border-accent-amber/30 space-y-3';
        if (badge) {
          badge.className = 'text-xs font-semibold text-accent-amber';
          badge.textContent = '(Tight - Under 3 Months)';
        }
      } else {
        if (card) card.className = 'p-4 rounded-xl bg-accent-rose/10 border border-accent-rose/30 space-y-3';
        if (badge) {
          badge.className = 'text-xs font-semibold text-accent-rose';
          badge.textContent = '(Critical - Insufficient Reserves)';
        }
      }
    });
  },

  // Calculators
  initCalculators: function() {
    this.calculateEMI();
    this.calculateCI();
    this.calculateInflation();
  },

  calculateEMI: function() {
    const principal = parseFloat(document.getElementById('calc-emi-principal').value) || 0;
    const rate = parseFloat(document.getElementById('calc-emi-rate').value) || 0;
    const months = parseInt(document.getElementById('calc-emi-months').value) || 1;

    fetch('/api/calculators/emi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principal, rate, months })
    }).then(r => r.json()).then(res => {
      document.getElementById('res-emi-monthly').textContent = res.monthly_emi.toLocaleString();
      document.getElementById('res-emi-interest').textContent = res.total_interest.toLocaleString();
    });
  },

  calculateCI: function() {
    const principal = parseFloat(document.getElementById('calc-ci-principal').value) || 0;
    const rate = parseFloat(document.getElementById('calc-ci-rate').value) || 0;
    const years = parseFloat(document.getElementById('calc-ci-years').value) || 0;

    fetch('/api/calculators/ci', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ principal, rate, years })
    }).then(r => r.json()).then(res => {
      document.getElementById('res-ci-total').textContent = res.future_value.toLocaleString();
      document.getElementById('res-ci-interest').textContent = res.interest_earned.toLocaleString();
    });
  },

  calculateInflation: function() {
    const cost = parseFloat(document.getElementById('calc-inf-cost').value) || 0;
    const rate = parseFloat(document.getElementById('calc-inf-rate').value) || 0;
    const years = parseFloat(document.getElementById('calc-inf-years').value) || 0;

    fetch('/api/calculators/inflation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cost, rate, years })
    }).then(r => r.json()).then(res => {
      document.getElementById('res-inf-future').textContent = res.future_cost.toLocaleString();
    });
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

  // Chart.js initialization for offline analytics
  initChart: function() {
    const ctx = document.getElementById('analytics-chart-canvas');
    if (ctx && typeof Chart !== 'undefined') {
      this.analyticsChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Food', 'Transport', 'Shopping', 'Bills', 'Salary'],
          datasets: [{
            label: 'Actual Spending (₹)',
            data: [6440, 3680, 4600, 1800, 25000],
            backgroundColor: ['#3b82f6', '#8b5cf6', '#f43f5e', '#f59e0b', '#22c55e'],
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            y: { grid: { color: 'rgba(156, 163, 175, 0.1)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }
  },

  updateAnalyticsChart: function() {
    if (this.analyticsChart) {
      this.analyticsChart.update();
    }
  },

  // Modals
  openModal: function(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.remove('hidden');
  },

  closeModal: function(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.add('hidden');
  }
};

window.onload = function() {
  MoneyTrackApp.init();
};
