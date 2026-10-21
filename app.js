/**
 * MY PATIENT - CLIENT PORTAL APPLICATION LOGIC
 * Dedicated to clinic employees checking patient statements
 * Implements PRD (v1), App Flow (03), UI/UX Brief (04) & Backend Schema (05)
 */

(function () {
  'use strict';

  // ==========================================================================
  // AUTHORIZED USER ACCOUNTS
  // ==========================================================================
  const AUTH_USERS = [
    {
      email: 'ankitkumar87147@gmail.com',
      displayEmail: 'Ankitkumar87147@gmail.com',
      password: 'Ankitsingh@123',
      name: 'Ankit Kumar',
      role: 'User-Lakeside Family Clinic',
      clinic: 'Lakeside Family Clinic',
      clinicId: 'CLN-4082',
      initials: 'AK'
    },
    {
      email: 'ankit.k@us24solutions.com',
      displayEmail: 'ankit.k@us24solutions.com',
      password: 'Ankitsingh@123',
      name: 'Ankit K.',
      role: 'US24 Specialist',
      clinic: 'US24 Billing Operations',
      clinicId: 'US24-SPEC',
      initials: 'AK'
    },
    {
      email: 'saurabh@us24solutions.com',
      displayEmail: 'saurabh@us24solutions.com',
      password: 'Kashi@123#',
      name: 'Saurabh',
      role: 'Admin',
      clinic: 'US24 Operations & Compliance',
      clinicId: 'US24-ADMIN',
      initials: 'S'
    }
  ];

  // ==========================================================================
  // INITIAL MOCK DATABASE (Lakeside Family Clinic - CLN-4082)
  // ==========================================================================
  const INITIAL_STATEMENTS = [
    {
      id: 'stmt-001',
      patientName: 'Elena Garcia',
      accountNumber: 'ACC-0048213',
      statementDate: '2026-10-14',
      formattedDate: 'Oct 14, 2026',
      balanceDue: 420.00,
      isNew: true, // Has not been opened by clinic user yet
      patientDob: '04/18/1984',
      serviceDateFrom: '10/02/2026',
      serviceDateTo: '10/02/2026',
      insuranceName: 'Blue Cross Blue Shield (IL)',
      totalBilled: 650.00,
      insurancePaid: 180.00,
      adjustments: 50.00,
      publishedBy: 'Ankit K., US24 Specialist',
      publishedAt: 'Oct 14, 2026 09:15 AM CDT',
      lineItems: [
        { date: '10/02/2026', cpt: '99214', desc: 'Office Outpatient Visit - Moderate Complexity', billed: 295.00, due: 150.00 },
        { date: '10/02/2026', cpt: '80053', desc: 'Comprehensive Metabolic Panel (CMP)', billed: 145.00, due: 70.00 },
        { date: '10/02/2026', cpt: '85025', desc: 'Complete Blood Count (CBC) w/ Differential', billed: 110.00, due: 80.00 },
        { date: '10/02/2026', cpt: '36415', desc: 'Routine Venipuncture Collection', billed: 100.00, due: 120.00 }
      ],
      remarks: [
        {
          id: 'rem-101',
          authorName: 'Aetna Member Services',
          authorRole: 'Insurance',
          type: 'insurance',
          companyName: 'Blue Cross Blue Shield',
          refNumber: 'CLM-98214-A',
          timestamp: 'Oct 14, 2026, 8:40 AM CDT',
          body: 'Claim processed. Deductible applied to line 1 and 2 ($150.00). Co-insurance responsibility ($70.00). EOB mailed to patient.'
        },
        {
          id: 'rem-102',
          authorName: 'Ankit K.',
          authorRole: 'US24 Specialist',
          type: 'specialist',
          timestamp: 'Oct 14, 2026, 9:20 AM CDT',
          body: 'Statement published for clinic review. Remaining patient copay and deductible balance matches the final remittance.'
        }
      ],
      otherStatements: [
        { id: 'stmt-008', date: 'Jul 18, 2026', balance: '$145.00 (Paid)' }
      ]
    },
    {
      id: 'stmt-002',
      patientName: 'Marcus Vance',
      accountNumber: 'ACC-0048190',
      statementDate: '2026-10-12',
      formattedDate: 'Oct 12, 2026',
      balanceDue: 175.50,
      isNew: true,
      patientDob: '11/09/1972',
      serviceDateFrom: '09/28/2026',
      serviceDateTo: '09/28/2026',
      insuranceName: 'Aetna Health Choice',
      totalBilled: 420.00,
      insurancePaid: 210.00,
      adjustments: 34.50,
      publishedBy: 'Ankit K., US24 Specialist',
      publishedAt: 'Oct 12, 2026 11:30 AM CDT',
      lineItems: [
        { date: '09/28/2026', cpt: '99213', desc: 'Office Outpatient Visit - Low Complexity', billed: 220.00, due: 95.50 },
        { date: '09/28/2026', cpt: '93000', desc: 'Electrocardiogram (ECG/EKG) 12-lead', billed: 200.00, due: 80.00 }
      ],
      remarks: [
        {
          id: 'rem-201',
          authorName: 'Ankit K.',
          authorRole: 'US24 Specialist',
          type: 'specialist',
          timestamp: 'Oct 12, 2026, 11:35 AM CDT',
          body: 'Patient copay was not collected at front desk. Invoiced patient for remaining balance after primary insurance adjudication.'
        }
      ],
      otherStatements: []
    },
    {
      id: 'stmt-003',
      patientName: 'Chloe Richardson',
      accountNumber: 'ACC-0048155',
      statementDate: '2026-10-10',
      formattedDate: 'Oct 10, 2026',
      balanceDue: 85.00,
      isNew: true,
      patientDob: '07/22/1995',
      serviceDateFrom: '09/24/2026',
      serviceDateTo: '09/24/2026',
      insuranceName: 'UnitedHealthcare',
      totalBilled: 310.00,
      insurancePaid: 185.00,
      adjustments: 40.00,
      publishedBy: 'Kevin Cole, US24 Specialist',
      publishedAt: 'Oct 10, 2026 02:15 PM CDT',
      lineItems: [
        { date: '09/24/2026', cpt: '99395', desc: 'Periodic Comprehensive Preventive Medicine', billed: 310.00, due: 85.00 }
      ],
      remarks: [
        {
          id: 'rem-301',
          authorName: 'Ankit Kumar',
          authorRole: 'Clinic User',
          type: 'clinic',
          timestamp: 'Oct 10, 2026, 3:00 PM CDT',
          body: 'Patient mentioned HSA card will be charged on the 1st of next month.'
        },
        {
          id: 'rem-302',
          authorName: 'Kevin Cole',
          authorRole: 'US24 Specialist',
          type: 'specialist',
          timestamp: 'Oct 10, 2026, 3:30 PM CDT',
          body: 'Noted. Statement will remain active with note for monthly reconciliation.'
        }
      ],
      otherStatements: []
    },
    {
      id: 'stmt-004',
      patientName: 'David K. Miller',
      accountNumber: 'ACC-0047982',
      statementDate: '2026-10-05',
      formattedDate: 'Oct 05, 2026',
      balanceDue: 630.00,
      isNew: false,
      patientDob: '03/14/1960',
      serviceDateFrom: '09/15/2026',
      serviceDateTo: '09/15/2026',
      insuranceName: 'Medicare Part B',
      totalBilled: 1200.00,
      insurancePaid: 450.00,
      adjustments: 120.00,
      publishedBy: 'Ankit K., US24 Specialist',
      publishedAt: 'Oct 05, 2026 10:00 AM CDT',
      lineItems: [
        { date: '09/15/2026', cpt: '73721', desc: 'MRI Joint of Lower Extremity (Knee)', billed: 950.00, due: 500.00 },
        { date: '09/15/2026', cpt: '99214', desc: 'Office Outpatient Visit - Moderate Complexity', billed: 250.00, due: 130.00 }
      ],
      remarks: [
        {
          id: 'rem-401',
          authorName: 'Medicare Claims Rep',
          authorRole: 'Insurance',
          type: 'insurance',
          companyName: 'Medicare Part B',
          refNumber: 'MED-774102',
          timestamp: 'Oct 04, 2026, 2:10 PM CDT',
          body: 'Pre-authorization valid. Co-insurance rate of 20% assigned to beneficiary.'
        },
        {
          id: 'rem-402',
          authorName: 'Ankit Kumar',
          authorRole: 'Clinic User',
          type: 'clinic',
          timestamp: 'Oct 06, 2026, 11:15 AM CDT',
          body: 'Clinic spoke with Mr. Miller; he requested a printed copy sent via mail.'
        }
      ],
      otherStatements: []
    },
    {
      id: 'stmt-005',
      patientName: 'Samantha Reed',
      accountNumber: 'ACC-0047810',
      statementDate: '2026-09-28',
      formattedDate: 'Sep 28, 2026',
      balanceDue: 210.00,
      isNew: false,
      patientDob: '12/05/2001',
      serviceDateFrom: '09/10/2026',
      serviceDateTo: '09/10/2026',
      insuranceName: 'Cigna Healthcare',
      totalBilled: 540.00,
      insurancePaid: 280.00,
      adjustments: 50.00,
      publishedBy: 'Kevin Cole, US24 Specialist',
      publishedAt: 'Sep 28, 2026 04:45 PM CDT',
      lineItems: [
        { date: '09/10/2026', cpt: '99214', desc: 'Office Outpatient Visit', billed: 320.00, due: 140.00 },
        { date: '09/10/2026', cpt: '87086', desc: 'Urine Culture Colony Count', billed: 220.00, due: 70.00 }
      ],
      remarks: [],
      otherStatements: []
    },
    {
      id: 'stmt-006',
      patientName: 'Arthur Pendelton',
      accountNumber: 'ACC-0047640',
      statementDate: '2026-09-20',
      formattedDate: 'Sep 20, 2026',
      balanceDue: -25.00, // Credit balance
      isNew: false,
      patientDob: '08/30/1955',
      serviceDateFrom: '09/01/2026',
      serviceDateTo: '09/01/2026',
      insuranceName: 'Humana Gold Plus',
      totalBilled: 180.00,
      insurancePaid: 155.00,
      adjustments: 50.00,
      publishedBy: 'Ankit K., US24 Specialist',
      publishedAt: 'Sep 20, 2026 01:10 PM CDT',
      lineItems: [
        { date: '09/01/2026', cpt: '99213', desc: 'Established Patient Visit', billed: 180.00, due: -25.00 }
      ],
      remarks: [
        {
          id: 'rem-601',
          authorName: 'Ankit K.',
          authorRole: 'US24 Specialist',
          type: 'specialist',
          timestamp: 'Sep 20, 2026, 1:12 PM CDT',
          body: 'Patient overpaid copay at time of service by $25. Credit balance reflected on statement. Will apply to future visit or refund per clinic policy.'
        }
      ],
      otherStatements: []
    },
    {
      id: 'stmt-007',
      patientName: 'Brenda Walsh',
      accountNumber: 'ACC-0047511',
      statementDate: '2026-09-14',
      formattedDate: 'Sep 14, 2026',
      balanceDue: 340.00,
      isNew: false,
      patientDob: '02/19/1988',
      serviceDateFrom: '08/29/2026',
      serviceDateTo: '08/29/2026',
      insuranceName: 'Anthem BCBS',
      totalBilled: 780.00,
      insurancePaid: 360.00,
      adjustments: 80.00,
      publishedBy: 'Kevin Cole, US24 Specialist',
      publishedAt: 'Sep 14, 2026 10:15 AM CDT',
      lineItems: [
        { date: '08/29/2026', cpt: '99215', desc: 'Office Outpatient Visit - High Complexity', billed: 450.00, due: 200.00 },
        { date: '08/29/2026', cpt: '95810', desc: 'Polysomnography Sleep Study', billed: 330.00, due: 140.00 }
      ],
      remarks: [],
      otherStatements: []
    },
    {
      id: 'stmt-008',
      patientName: 'Elena Garcia',
      accountNumber: 'ACC-0048213',
      statementDate: '2026-07-18',
      formattedDate: 'Jul 18, 2026',
      balanceDue: 145.00,
      isNew: false,
      patientDob: '04/18/1984',
      serviceDateFrom: '07/05/2026',
      serviceDateTo: '07/05/2026',
      insuranceName: 'Blue Cross Blue Shield (IL)',
      totalBilled: 380.00,
      insurancePaid: 200.00,
      adjustments: 35.00,
      publishedBy: 'Ankit K., US24 Specialist',
      publishedAt: 'Jul 18, 2026 11:00 AM CDT',
      lineItems: [
        { date: '07/05/2026', cpt: '99213', desc: 'Office Outpatient Visit', billed: 240.00, due: 95.00 },
        { date: '07/05/2026', cpt: '81002', desc: 'Urinalysis Non-automated', billed: 140.00, due: 50.00 }
      ],
      remarks: [
        {
          id: 'rem-801',
          authorName: 'Ankit Kumar',
          authorRole: 'Clinic User',
          type: 'clinic',
          timestamp: 'Jul 22, 2026, 09:40 AM CDT',
          body: 'Payment received via credit card at front desk.'
        }
      ],
      otherStatements: []
    }
  ];

  // ==========================================================================
  // APPLICATION STATE
  // ==========================================================================
  const state = {
    user: null, // Logged in clinic user
    pendingUser: null,
    statements: JSON.parse(JSON.stringify(INITIAL_STATEMENTS)),
    currentStatementId: null,
    searchQuery: '',
    dateFrom: '',
    dateTo: '',
    sortOrder: 'date-desc',
    currentPage: 1,
    pageSize: 8,
    activeView: 'view-login',
    timeoutTimer: null,
    timeoutCountdownTimer: null,
    inactivitySecondsLeft: 120
  };

  // ==========================================================================
  // DOM ELEMENT REFERENCES
  // ==========================================================================
  const elements = {
    // Header
    headerUserBadge: document.getElementById('header-user-badge'),
    userAvatar: document.getElementById('user-avatar'),
    userDisplayName: document.getElementById('user-display-name'),
    userClinicName: document.getElementById('user-clinic-name'),
    btnHeaderSignout: document.getElementById('btn-header-signout'),
    brandHomeLink: document.getElementById('brand-home-link'),

    // Views
    viewLogin: document.getElementById('view-login'),
    viewVerify: document.getElementById('view-verify'),
    viewHome: document.getElementById('view-home'),
    viewStatements: document.getElementById('view-statements'),
    viewDetail: document.getElementById('view-detail'),

    // Login Form
    formLogin: document.getElementById('form-login'),
    inputEmail: document.getElementById('input-email'),
    inputPassword: document.getElementById('input-password'),
    btnTogglePassword: document.getElementById('btn-toggle-password'),
    loginErrorAlert: document.getElementById('login-error-alert'),
    btnAutofillClinic: document.getElementById('btn-autofill-clinic'),
    btnAutofillSpecialist: document.getElementById('btn-autofill-specialist'),
    btnAutofillAdmin: document.getElementById('btn-autofill-admin'),

    // Verification Form
    formVerify: document.getElementById('form-verify'),
    otpCodeInput: document.getElementById('otp-code-input'),
    maskedEmailDisplay: document.getElementById('masked-email-display'),
    verifyErrorAlert: document.getElementById('verify-error-alert'),
    btnResendCode: document.getElementById('btn-resend-code'),
    btnCancelVerify: document.getElementById('btn-cancel-verify'),

    // Home Hub Cards
    cardPatientStatements: document.getElementById('card-patient-statements'),
    homeNewBadge: document.getElementById('home-new-badge'),

    // Statement List Page
    btnBackToHome: document.getElementById('btn-back-to-home'),
    btnSimulateInactivity: document.getElementById('btn-simulate-inactivity'),
    searchInput: document.getElementById('search-input'),
    filterDateFrom: document.getElementById('filter-date-from'),
    filterDateTo: document.getElementById('filter-date-to'),
    filterSort: document.getElementById('filter-sort'),
    btnClearFilters: document.getElementById('btn-clear-filters'),
    btnEmptyClearFilters: document.getElementById('btn-empty-clear-filters'),
    resultsCountLabel: document.getElementById('results-count-label'),
    activeFilterIndicator: document.getElementById('active-filter-indicator'),
    statementsTableBody: document.getElementById('statements-table-body'),
    mobileStatementsList: document.getElementById('mobile-statements-list'),
    statementsEmptyState: document.getElementById('statements-empty-state'),
    paginationInfo: document.getElementById('pagination-info'),
    btnPrevPage: document.getElementById('btn-prev-page'),
    btnNextPage: document.getElementById('btn-next-page'),

    // Statement Detail View
    btnBackToList: document.getElementById('btn-back-to-list'),
    breadcrumbStatementId: document.getElementById('breadcrumb-statement-id'),
    detailPatientName: document.getElementById('detail-patient-name'),
    detailNewBadge: document.getElementById('detail-new-badge'),
    detailAccountNo: document.getElementById('detail-account-no'),
    detailStatementDate: document.getElementById('detail-statement-date'),
    detailPublishedMeta: document.getElementById('detail-published-meta'),
    detailBalanceDue: document.getElementById('detail-balance-due'),
    btnPrintStatement: document.getElementById('btn-print-statement'),
    btnDownloadPdf: document.getElementById('btn-download-pdf'),

    // Document Sheet
    docDate: document.getElementById('doc-date'),
    docAccount: document.getElementById('doc-account'),
    docPatientName: document.getElementById('doc-patient-name'),
    docDob: document.getElementById('doc-dob'),
    docServiceDates: document.getElementById('doc-service-dates'),
    docInsuranceName: document.getElementById('doc-insurance-name'),
    docLineItemsBody: document.getElementById('doc-line-items-body'),
    docTotalBilled: document.getElementById('doc-total-billed'),
    docInsPaid: document.getElementById('doc-ins-paid'),
    docAdjustments: document.getElementById('doc-adjustments'),
    docFinalBalance: document.getElementById('doc-final-balance'),
    otherStatementsContainer: document.getElementById('other-statements-container'),
    otherStatementsList: document.getElementById('other-statements-list'),
    printTimestamp: document.getElementById('print-timestamp'),

    // Remarks Ledger
    remarksCountTag: document.getElementById('remarks-count-tag'),
    remarksFeed: document.getElementById('remarks-feed'),
    formAddRemark: document.getElementById('form-add-remark'),
    textareaRemark: document.getElementById('textarea-remark'),
    charCounter: document.getElementById('char-counter'),
    remarkAuthorHint: document.getElementById('remark-author-hint'),

    // Modal Timeout
    modalTimeout: document.getElementById('modal-timeout'),
    timeoutCountdown: document.getElementById('timeout-countdown'),
    btnTimeoutSignout: document.getElementById('btn-timeout-signout'),
    btnTimeoutExtend: document.getElementById('btn-timeout-extend'),

    // Toast
    toastBanner: document.getElementById('toast-banner'),
    toastMessage: document.getElementById('toast-message')
  };

  // ==========================================================================
  // HELPER FORMATTING FUNCTIONS
  // ==========================================================================
  function formatMoney(amount) {
    if (typeof amount !== 'number') return '$0.00';
    if (amount < 0) {
      return `-$${Math.abs(amount).toFixed(2)} (Credit)`;
    }
    return `$${amount.toFixed(2)}`;
  }

  function highlightMatches(text, query) {
    if (!query || !query.trim()) return text;
    const cleanQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${cleanQuery})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  function showToast(message) {
    if (!elements.toastBanner) return;
    elements.toastMessage.textContent = message;
    elements.toastBanner.classList.add('show');
    setTimeout(() => {
      elements.toastBanner.classList.remove('show');
    }, 3800);
  }

  // ==========================================================================
  // VIEW NAVIGATION CONTROLLER
  // ==========================================================================
  function switchView(viewId) {
    state.activeView = viewId;
    const views = [
      elements.viewLogin,
      elements.viewVerify,
      elements.viewHome,
      elements.viewStatements,
      elements.viewDetail
    ];

    views.forEach(v => {
      if (v) v.classList.remove('active');
    });

    const target = document.getElementById(viewId);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Toggle header state based on whether user is logged in and verified
    const isAuthed = state.user && (viewId === 'view-home' || viewId === 'view-statements' || viewId === 'view-detail');
    if (elements.headerUserBadge) elements.headerUserBadge.style.display = isAuthed ? 'flex' : 'none';
    if (elements.btnHeaderSignout) elements.btnHeaderSignout.style.display = isAuthed ? 'inline-flex' : 'none';

    // Update unread count badges
    updateNewBadgeCounts();
  }

  function updateNewBadgeCounts() {
    const unreadCount = state.statements.filter(s => s.isNew).length;
    if (elements.homeNewBadge) {
      if (unreadCount > 0) {
        elements.homeNewBadge.style.display = 'inline-block';
        elements.homeNewBadge.textContent = `${unreadCount} New Statement${unreadCount > 1 ? 's' : ''}`;
      } else {
        elements.homeNewBadge.style.display = 'none';
      }
    }
  }

  // ==========================================================================
  // AUTHENTICATION LOGIC (A1, A2)
  // ==========================================================================
  function handleLoginSubmit(e) {
    e.preventDefault();
    const email = elements.inputEmail.value.trim().toLowerCase();
    const password = elements.inputPassword.value.trim();

    if (!email || !password) {
      elements.loginErrorAlert.textContent = 'Please enter both your email address and password.';
      elements.loginErrorAlert.style.display = 'block';
      return;
    }

    const matchedUser = AUTH_USERS.find(u => u.email === email);
    if (!matchedUser) {
      elements.loginErrorAlert.textContent = 'Account not found. Please enter an authorized user email.';
      elements.loginErrorAlert.style.display = 'block';
      return;
    }

    if (matchedUser.password !== password) {
      elements.loginErrorAlert.textContent = 'Incorrect password. Please verify your credentials and try again.';
      elements.loginErrorAlert.style.display = 'block';
      return;
    }

    state.pendingUser = matchedUser;
    elements.loginErrorAlert.style.display = 'none';

    // Masked email for 2FA screen
    const atIndex = matchedUser.displayEmail.indexOf('@');
    const masked = atIndex > 1 ? `${matchedUser.displayEmail[0]}***${matchedUser.displayEmail.slice(atIndex)}` : matchedUser.displayEmail;
    elements.maskedEmailDisplay.textContent = masked;

    // Switch to step 2 (2FA code verification)
    switchView('view-verify');
    elements.otpCodeInput.value = '842915'; // prefill demo code
    elements.otpCodeInput.focus();
    showToast(`6-digit security code sent to ${masked}`);
  }

  function handleVerifySubmit(e) {
    e.preventDefault();
    const code = elements.otpCodeInput.value.trim();

    if (code.length < 6) {
      elements.verifyErrorAlert.textContent = 'Please enter the complete 6-digit verification code.';
      elements.verifyErrorAlert.style.display = 'block';
      return;
    }

    // Set signed-in state
    const auth = state.pendingUser || AUTH_USERS[0];
    state.user = {
      name: auth.name,
      role: auth.role,
      email: auth.displayEmail,
      clinic: auth.clinic,
      clinicId: auth.clinicId,
      initials: auth.initials
    };

    if (elements.userAvatar) elements.userAvatar.textContent = state.user.initials;
    if (elements.userDisplayName) elements.userDisplayName.textContent = state.user.name;
    if (elements.userClinicName) elements.userClinicName.textContent = state.user.clinic;
    if (elements.remarkAuthorHint) elements.remarkAuthorHint.textContent = `${state.user.name} (${state.user.role})`;

    elements.verifyErrorAlert.style.display = 'none';
    switchView('view-home');
    showToast(`Signed in as ${state.user.name} (${state.user.role}).`);
    startInactivityWatcher();
  }

  function handleSignOut() {
    state.user = null;
    clearTimeout(state.timeoutTimer);
    clearInterval(state.timeoutCountdownTimer);
    if (elements.modalTimeout) elements.modalTimeout.classList.remove('active');
    switchView('view-login');
    showToast('You have been signed out.');
  }

  // ==========================================================================
  // STATEMENT LISTING & SEARCH FILTERING (P1)
  // ==========================================================================
  function getFilteredStatements() {
    let result = [...state.statements];

    // Search query filter (patient name or account number)
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.trim().toLowerCase();
      result = result.filter(s =>
        s.patientName.toLowerCase().includes(q) ||
        s.accountNumber.toLowerCase().includes(q)
      );
    }

    // Date From filter
    if (state.dateFrom) {
      result = result.filter(s => s.statementDate >= state.dateFrom);
    }

    // Date To filter
    if (state.dateTo) {
      result = result.filter(s => s.statementDate <= state.dateTo);
    }

    // Sorting
    switch (state.sortOrder) {
      case 'date-asc':
        result.sort((a, b) => a.statementDate.localeCompare(b.statementDate));
        break;
      case 'name-asc':
        result.sort((a, b) => a.patientName.localeCompare(b.patientName));
        break;
      case 'balance-desc':
        result.sort((a, b) => b.balanceDue - a.balanceDue);
        break;
      case 'date-desc':
      default:
        result.sort((a, b) => b.statementDate.localeCompare(a.statementDate));
        break;
    }

    return result;
  }

  function renderStatements() {
    const filtered = getFilteredStatements();
    const count = filtered.length;

    // Update count labels
    if (elements.resultsCountLabel) elements.resultsCountLabel.textContent = count;
    const hasFilter = state.searchQuery || state.dateFrom || state.dateTo || state.sortOrder !== 'date-desc';
    if (elements.activeFilterIndicator) elements.activeFilterIndicator.style.display = hasFilter ? 'inline' : 'none';

    // Handle Empty State
    if (count === 0) {
      if (elements.statementsTableBody) elements.statementsTableBody.innerHTML = '';
      if (elements.mobileStatementsList) elements.mobileStatementsList.innerHTML = '';
      if (elements.statementsEmptyState) elements.statementsEmptyState.style.display = 'flex';
      if (elements.paginationInfo) elements.paginationInfo.textContent = 'Showing 0 statements';
      return;
    } else {
      if (elements.statementsEmptyState) elements.statementsEmptyState.style.display = 'none';
    }

    // Pagination calculations
    const totalPages = Math.ceil(count / state.pageSize) || 1;
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    const startIndex = (state.currentPage - 1) * state.pageSize;
    const pageItems = filtered.slice(startIndex, startIndex + state.pageSize);

    if (elements.paginationInfo) {
      elements.paginationInfo.textContent = `Showing ${startIndex + 1}–${Math.min(startIndex + state.pageSize, count)} of ${count} statements`;
    }
    if (elements.btnPrevPage) elements.btnPrevPage.disabled = state.currentPage <= 1;
    if (elements.btnNextPage) elements.btnNextPage.disabled = state.currentPage >= totalPages;

    // Desktop Table Rows
    let tableHtml = '';
    // Mobile Card Rows
    let mobileHtml = '';

    pageItems.forEach(stmt => {
      const highlightedName = highlightMatches(stmt.patientName, state.searchQuery);
      const highlightedAcc = highlightMatches(stmt.accountNumber, state.searchQuery);
      const lastRemark = stmt.remarks && stmt.remarks.length > 0 ? stmt.remarks[stmt.remarks.length - 1].timestamp.split(',')[0] : 'None';
      const newBadgeHtml = stmt.isNew ? '<span class="badge badge-new">New</span>' : '';

      tableHtml += `
        <tr data-id="${stmt.id}" tabindex="0" role="row" aria-label="Statement for ${stmt.patientName}">
          <td class="col-patient">
            ${newBadgeHtml}
            <span>${highlightedName}</span>
          </td>
          <td class="col-mono">${highlightedAcc}</td>
          <td class="col-date">${stmt.formattedDate}</td>
          <td class="col-amount">${formatMoney(stmt.balanceDue)}</td>
          <td class="col-date">${lastRemark}</td>
          <td style="text-align: right;">
            <button type="button" class="btn btn-secondary btn-sm" aria-label="Open statement for ${stmt.patientName}">
              Open &rarr;
            </button>
          </td>
        </tr>
      `;

      mobileHtml += `
        <div class="mobile-statement-card" data-id="${stmt.id}" tabindex="0" role="button">
          <div class="mobile-card-top">
            <span class="mobile-patient-name">${highlightedName}</span>
            ${newBadgeHtml}
          </div>
          <div class="mobile-card-mid">
            <span class="col-mono">${highlightedAcc}</span>
            <span>Date: ${stmt.formattedDate}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4px;">
            <div>
              <span style="font-size: 0.75rem; color: var(--color-text-muted);">Balance Due</span>
              <div class="mobile-balance-due">${formatMoney(stmt.balanceDue)}</div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm">View Details</button>
          </div>
        </div>
      `;
    });

    if (elements.statementsTableBody) elements.statementsTableBody.innerHTML = tableHtml;
    if (elements.mobileStatementsList) elements.mobileStatementsList.innerHTML = mobileHtml;

    // Attach row click handlers
    attachRowClickListeners();
  }

  function attachRowClickListeners() {
    const rows = document.querySelectorAll('#statements-table-body tr, .mobile-statement-card');
    rows.forEach(r => {
      r.addEventListener('click', () => {
        const id = r.getAttribute('data-id');
        if (id) openStatementDetail(id);
      });
      r.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const id = r.getAttribute('data-id');
          if (id) openStatementDetail(id);
        }
      });
    });
  }

  // ==========================================================================
  // STATEMENT DETAIL VIEW CONTROLLER (P2)
  // ==========================================================================
  function openStatementDetail(statementId) {
    const stmt = state.statements.find(s => s.id === statementId);
    if (!stmt) return;

    state.currentStatementId = statementId;

    // FR-10.2: When clinic user opens an unread statement, clear the "New" badge
    if (stmt.isNew) {
      stmt.isNew = false;
      updateNewBadgeCounts();
    }

    // Populate Detail Hero Summary
    if (elements.detailPatientName) elements.detailPatientName.textContent = stmt.patientName;
    if (elements.breadcrumbStatementId) elements.breadcrumbStatementId.textContent = `${stmt.patientName} (${stmt.accountNumber})`;
    if (elements.detailAccountNo) elements.detailAccountNo.textContent = stmt.accountNumber;
    if (elements.detailStatementDate) elements.detailStatementDate.textContent = stmt.formattedDate;
    if (elements.detailPublishedMeta) elements.detailPublishedMeta.textContent = `Published by ${stmt.publishedBy}`;
    if (elements.detailBalanceDue) elements.detailBalanceDue.textContent = formatMoney(stmt.balanceDue);

    // Populate Printable Statement Document Sheet
    if (elements.docDate) elements.docDate.textContent = stmt.formattedDate;
    if (elements.docAccount) elements.docAccount.textContent = stmt.accountNumber;
    if (elements.docPatientName) elements.docPatientName.textContent = stmt.patientName;
    if (elements.docDob) elements.docDob.textContent = stmt.patientDob || 'N/A';
    if (elements.docServiceDates) elements.docServiceDates.textContent = `${stmt.serviceDateFrom} - ${stmt.serviceDateTo}`;
    if (elements.docInsuranceName) elements.docInsuranceName.textContent = stmt.insuranceName || 'Self-Pay';

    // Populate Line Items Table
    let lineItemsHtml = '';
    if (stmt.lineItems && stmt.lineItems.length > 0) {
      stmt.lineItems.forEach(item => {
        lineItemsHtml += `
          <tr>
            <td>${item.date}</td>
            <td class="col-mono" style="font-weight: 500;">${item.cpt}</td>
            <td>${item.desc}</td>
            <td class="text-right">${formatMoney(item.billed)}</td>
            <td class="text-right" style="font-weight: 600; color: var(--color-text);">${formatMoney(item.due)}</td>
          </tr>
        `;
      });
    } else {
      lineItemsHtml = '<tr><td colspan="5" style="text-align:center; padding: 16px; color: var(--color-text-muted);">No individual itemized records.</td></tr>';
    }
    if (elements.docLineItemsBody) elements.docLineItemsBody.innerHTML = lineItemsHtml;

    // Totals Box
    if (elements.docTotalBilled) elements.docTotalBilled.textContent = formatMoney(stmt.totalBilled);
    if (elements.docInsPaid) elements.docInsPaid.textContent = `-${formatMoney(stmt.insurancePaid)}`;
    if (elements.docAdjustments) elements.docAdjustments.textContent = `-${formatMoney(stmt.adjustments)}`;
    if (elements.docFinalBalance) elements.docFinalBalance.textContent = formatMoney(stmt.balanceDue);

    // Other Statements by same patient
    if (elements.otherStatementsList) {
      const samePatientStatements = state.statements.filter(s => s.accountNumber === stmt.accountNumber && s.id !== stmt.id);
      if (samePatientStatements.length > 0) {
        let otherHtml = '';
        samePatientStatements.forEach(other => {
          otherHtml += `
            <a href="javascript:void(0)" class="other-statement-item" data-other-id="${other.id}">
              <span><strong>Statement Date:</strong> ${other.formattedDate}</span>
              <span class="col-mono">${formatMoney(other.balanceDue)}</span>
            </a>
          `;
        });
        elements.otherStatementsList.innerHTML = otherHtml;
        elements.otherStatementsContainer.style.display = 'block';

        // Bind clicks on other statements
        elements.otherStatementsList.querySelectorAll('.other-statement-item').forEach(item => {
          item.addEventListener('click', (e) => {
            e.preventDefault();
            const otherId = item.getAttribute('data-other-id');
            if (otherId) openStatementDetail(otherId);
          });
        });
      } else {
        elements.otherStatementsContainer.style.display = 'none';
      }
    }

    // Populate Remarks Ledger (F11)
    renderRemarks(stmt);

    // Reset Add Remark textarea
    if (elements.textareaRemark) elements.textareaRemark.value = '';
    if (elements.charCounter) elements.charCounter.textContent = '0 / 2,000';

    switchView('view-detail');
  }

  // ==========================================================================
  // REMARKS LEDGER LOGIC (F11, FR-11.1 - FR-11.7)
  // Chronological order (Oldest first), Type colors: Clinic (plum), Specialist (teal), Insurance (blue)
  // ==========================================================================
  function renderRemarks(stmt) {
    if (!elements.remarksFeed) return;

    if (!stmt.remarks || stmt.remarks.length === 0) {
      elements.remarksFeed.innerHTML = `
        <div style="text-align: center; padding: 24px 12px; color: var(--color-text-subtle); font-size: 0.88rem;">
          No remarks recorded yet for this statement.
        </div>
      `;
      if (elements.remarksCountTag) elements.remarksCountTag.textContent = '0 entries';
      return;
    }

    if (elements.remarksCountTag) elements.remarksCountTag.textContent = `${stmt.remarks.length} entr${stmt.remarks.length === 1 ? 'y' : 'ies'}`;

    let feedHtml = '';
    stmt.remarks.forEach(r => {
      let roleClass = 'tag-clinic';
      let borderClass = 'clinic-remark';
      let roleLabel = 'Clinic User';

      if (r.type === 'specialist') {
        roleClass = 'tag-specialist';
        borderClass = 'specialist-remark';
        roleLabel = 'US24 Specialist';
      } else if (r.type === 'insurance') {
        roleClass = 'tag-insurance';
        borderClass = 'insurance-remark';
        roleLabel = 'Insurance';
      }

      let extraInsuranceInfo = '';
      if (r.type === 'insurance') {
        extraInsuranceInfo = `
          <div class="remark-insurance-extra">
            <strong>Payer:</strong> ${r.companyName || 'Insurance'} &bull; <strong>Ref #:</strong> ${r.refNumber || 'N/A'}
          </div>
        `;
      }

      feedHtml += `
        <div class="remark-entry ${borderClass}">
          <div class="remark-meta">
            <span class="remark-author-role">
              ${r.authorName}
              <span class="remark-role-tag ${roleClass}">${roleLabel}</span>
            </span>
            <span class="remark-timestamp">${r.timestamp}</span>
          </div>
          ${extraInsuranceInfo}
          <div class="remark-body">${escapeHtml(r.body)}</div>
        </div>
      `;
    });

    elements.remarksFeed.innerHTML = feedHtml;
    // Auto-scroll to latest remark
    elements.remarksFeed.scrollTop = elements.remarksFeed.scrollHeight;
  }

  function handleAddRemarkSubmit(e) {
    e.preventDefault();
    const text = elements.textareaRemark.value.trim();

    if (!text) return;
    if (text.length > 2000) {
      alert('Remarks are limited to 2,000 characters maximum.');
      return;
    }

    const stmt = state.statements.find(s => s.id === state.currentStatementId);
    if (!stmt) return;

    // Create new clinic remark
    const newRemark = {
      id: `rem-${Date.now()}`,
      authorName: state.user ? state.user.name : 'Ankit Kumar',
      authorRole: state.user ? state.user.role : 'User-Lakeside Family Clinic',
      type: 'clinic',
      timestamp: new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' CDT',
      body: text
    };

    if (!stmt.remarks) stmt.remarks = [];
    stmt.remarks.push(newRemark);

    // Re-render feed and clear input
    renderRemarks(stmt);
    elements.textareaRemark.value = '';
    elements.charCounter.textContent = '0 / 2,000';
    showToast('Clinic remark added to patient statement.');
  }

  function escapeHtml(string) {
    const div = document.createElement('div');
    div.textContent = string;
    return div.innerHTML;
  }

  // ==========================================================================
  // INACTIVITY TIMEOUT SIMULATION (FR-1.9, G1)
  // ==========================================================================
  function startInactivityWatcher() {
    clearTimeout(state.timeoutTimer);
    clearInterval(state.timeoutCountdownTimer);

    // After 13 minutes (or 5 minutes for demo), trigger warning
    // We also provide a direct manual simulation button in the UI
  }

  function triggerInactivityModal() {
    state.inactivitySecondsLeft = 120;
    updateCountdownDisplay();
    if (elements.modalTimeout) elements.modalTimeout.classList.add('active');

    clearInterval(state.timeoutCountdownTimer);
    state.timeoutCountdownTimer = setInterval(() => {
      state.inactivitySecondsLeft--;
      updateCountdownDisplay();
      if (state.inactivitySecondsLeft <= 0) {
        clearInterval(state.timeoutCountdownTimer);
        handleSignOut();
        showToast('You were signed out after 15 minutes of inactivity.');
      }
    }, 1000);
  }

  function updateCountdownDisplay() {
    const mins = Math.floor(state.inactivitySecondsLeft / 60);
    const secs = state.inactivitySecondsLeft % 60;
    if (elements.timeoutCountdown) {
      elements.timeoutCountdown.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  }

  function extendSession() {
    clearInterval(state.timeoutCountdownTimer);
    if (elements.modalTimeout) elements.modalTimeout.classList.remove('active');
    showToast('Session extended. You are still signed in.');
  }

  // ==========================================================================
  // DOWNLOAD & PRINT ACTIONS (FR-12.1, FR-12.2)
  // ==========================================================================
  function handlePrintStatement() {
    if (elements.printTimestamp) {
      elements.printTimestamp.textContent = new Date().toLocaleString();
    }
    window.print();
  }

  function handleDownloadPdf() {
    const stmt = state.statements.find(s => s.id === state.currentStatementId);
    if (!stmt) return;

    // Generate a downloadable text/document representation of the statement
    const content = `
========================================================================
                      PATIENT STATEMENT - OFFICIAL COPY
                      US24 Solutions Client Portal
========================================================================
Clinic:           Lakeside Family Clinic (CLN-4082)
Address:          104 Medical Plaza Way, Suite 200, Peoria, IL 61614
Patient Name:     ${stmt.patientName}
Account Number:   ${stmt.accountNumber}
Statement Date:   ${stmt.formattedDate}
Date of Birth:    ${stmt.patientDob}
Dates of Service: ${stmt.serviceDateFrom} - ${stmt.serviceDateTo}
Primary Insurer:  ${stmt.insuranceName}

------------------------------------------------------------------------
ITEMIZED CHARGES
------------------------------------------------------------------------
${stmt.lineItems.map(item => `${item.date}  |  ${item.cpt.padEnd(8)}  |  ${item.desc.padEnd(45)}  |  $${item.billed.toFixed(2)}  |  Patient Due: $${item.due.toFixed(2)}`).join('\n')}

------------------------------------------------------------------------
FINANCIAL RECONCILIATION
------------------------------------------------------------------------
Total Billed Charges:      $${stmt.totalBilled.toFixed(2)}
Insurance Paid:           -$${stmt.insurancePaid.toFixed(2)}
Contractual Adjustments:  -$${stmt.adjustments.toFixed(2)}
------------------------------------------------------------------------
PATIENT BALANCE DUE:       $${stmt.balanceDue.toFixed(2)}
------------------------------------------------------------------------

REMARKS HISTORY:
${stmt.remarks.map(r => `[${r.timestamp}] ${r.authorName} (${r.authorRole}):\n${r.body}`).join('\n\n')}

========================================================================
Confidential Medical Information Protected Under HIPAA Standards.
For questions regarding this statement, please contact Lakeside Family Clinic.
========================================================================
    `.trim();

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Statement_${stmt.accountNumber}_${stmt.statementDate}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Statement file downloaded for ${stmt.patientName}`);
  }

  // ==========================================================================
  // EVENT LISTENERS & INITIALIZATION
  // ==========================================================================
  function bindEvents() {
    // Brand Link
    if (elements.brandHomeLink) {
      elements.brandHomeLink.addEventListener('click', () => {
        if (state.user) switchView('view-home');
        else switchView('view-login');
      });
    }

    // Sign out button
    if (elements.btnHeaderSignout) {
      elements.btnHeaderSignout.addEventListener('click', handleSignOut);
    }

    // Login Form
    if (elements.formLogin) {
      elements.formLogin.addEventListener('submit', handleLoginSubmit);
    }
    if (elements.btnAutofillClinic) {
      elements.btnAutofillClinic.addEventListener('click', () => {
        elements.inputEmail.value = AUTH_USERS[0].displayEmail;
        elements.inputPassword.value = AUTH_USERS[0].password;
        elements.loginErrorAlert.style.display = 'none';
      });
    }
    if (elements.btnAutofillSpecialist) {
      elements.btnAutofillSpecialist.addEventListener('click', () => {
        elements.inputEmail.value = AUTH_USERS[1].displayEmail;
        elements.inputPassword.value = AUTH_USERS[1].password;
        elements.loginErrorAlert.style.display = 'none';
      });
    }
    if (elements.btnAutofillAdmin) {
      elements.btnAutofillAdmin.addEventListener('click', () => {
        elements.inputEmail.value = AUTH_USERS[2].displayEmail;
        elements.inputPassword.value = AUTH_USERS[2].password;
        elements.loginErrorAlert.style.display = 'none';
      });
    }
    if (elements.btnTogglePassword) {
      elements.btnTogglePassword.addEventListener('click', () => {
        const isPassword = elements.inputPassword.type === 'password';
        elements.inputPassword.type = isPassword ? 'text' : 'password';
        elements.btnTogglePassword.textContent = isPassword ? 'Hide' : 'Show';
      });
    }

    // Verification Form
    if (elements.formVerify) {
      elements.formVerify.addEventListener('submit', handleVerifySubmit);
    }
    if (elements.btnCancelVerify) {
      elements.btnCancelVerify.addEventListener('click', () => switchView('view-login'));
    }
    if (elements.btnResendCode) {
      elements.btnResendCode.addEventListener('click', () => {
        showToast('New 6-digit verification code sent.');
      });
    }

    // Home Hub Cards
    if (elements.cardPatientStatements) {
      elements.cardPatientStatements.addEventListener('click', () => {
        switchView('view-statements');
        renderStatements();
      });
      elements.cardPatientStatements.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          switchView('view-statements');
          renderStatements();
        }
      });
    }

    // Statement List Navigation & Search
    if (elements.btnBackToHome) {
      elements.btnBackToHome.addEventListener('click', () => switchView('view-home'));
    }

    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        state.currentPage = 1;
        renderStatements();
      });
    }

    if (elements.filterDateFrom) {
      elements.filterDateFrom.addEventListener('change', (e) => {
        state.dateFrom = e.target.value;
        state.currentPage = 1;
        renderStatements();
      });
    }

    if (elements.filterDateTo) {
      elements.filterDateTo.addEventListener('change', (e) => {
        state.dateTo = e.target.value;
        state.currentPage = 1;
        renderStatements();
      });
    }

    if (elements.filterSort) {
      elements.filterSort.addEventListener('change', (e) => {
        state.sortOrder = e.target.value;
        renderStatements();
      });
    }

    function clearAllFilters() {
      state.searchQuery = '';
      state.dateFrom = '';
      state.dateTo = '';
      state.sortOrder = 'date-desc';
      state.currentPage = 1;
      if (elements.searchInput) elements.searchInput.value = '';
      if (elements.filterDateFrom) elements.filterDateFrom.value = '';
      if (elements.filterDateTo) elements.filterDateTo.value = '';
      if (elements.filterSort) elements.filterSort.value = 'date-desc';
      renderStatements();
    }

    if (elements.btnClearFilters) elements.btnClearFilters.addEventListener('click', clearAllFilters);
    if (elements.btnEmptyClearFilters) elements.btnEmptyClearFilters.addEventListener('click', clearAllFilters);

    // Pagination
    if (elements.btnPrevPage) {
      elements.btnPrevPage.addEventListener('click', () => {
        if (state.currentPage > 1) {
          state.currentPage--;
          renderStatements();
        }
      });
    }
    if (elements.btnNextPage) {
      elements.btnNextPage.addEventListener('click', () => {
        state.currentPage++;
        renderStatements();
      });
    }

    // Detail View Navigation
    if (elements.btnBackToList) {
      elements.btnBackToList.addEventListener('click', () => {
        switchView('view-statements');
        renderStatements();
      });
    }

    // Add Remark Form & Character Counter
    if (elements.formAddRemark) {
      elements.formAddRemark.addEventListener('submit', handleAddRemarkSubmit);
    }
    if (elements.textareaRemark) {
      elements.textareaRemark.addEventListener('input', (e) => {
        const len = e.target.value.length;
        if (elements.charCounter) {
          elements.charCounter.textContent = `${len.toLocaleString()} / 2,000`;
          elements.charCounter.classList.toggle('warning', len >= 1800 && len < 2000);
          elements.charCounter.classList.toggle('danger', len >= 2000);
        }
      });
    }

    // Print & Download
    if (elements.btnPrintStatement) {
      elements.btnPrintStatement.addEventListener('click', handlePrintStatement);
    }
    if (elements.btnDownloadPdf) {
      elements.btnDownloadPdf.addEventListener('click', handleDownloadPdf);
    }

    // Inactivity Simulation
    if (elements.btnSimulateInactivity) {
      elements.btnSimulateInactivity.addEventListener('click', triggerInactivityModal);
    }
    if (elements.btnTimeoutSignout) {
      elements.btnTimeoutSignout.addEventListener('click', handleSignOut);
    }
    if (elements.btnTimeoutExtend) {
      elements.btnTimeoutExtend.addEventListener('click', extendSession);
    }

    // Forgot password link demo
    const forgotLink = document.getElementById('link-forgot-password');
    if (forgotLink) {
      forgotLink.addEventListener('click', () => {
        showToast('Password reset link sent if an account exists for this clinic.');
      });
    }

    // Keyboard support: Escape closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && elements.modalTimeout && elements.modalTimeout.classList.contains('active')) {
        extendSession();
      }
    });
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    bindEvents();
    renderStatements();
    switchView('view-login');
  });

})();
