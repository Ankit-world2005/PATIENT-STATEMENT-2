/**
 * MY PATIENT - MULTI-PERSONA CLIENT STATEMENT PORTAL
 * Implements the 3 Distinct Login Types:
 *   1. Clinic Level (Checks patient status, reviews itemized charges, adds clinic remarks)
 *   2. US24 Specialist (Uploads patient statements, bulk imports, records insurance remarks)
 *   3. Admin Level (Tracks all statuses across all clinics, manages clinics/users & audit logs)
 *
 * Implements PRD (v1), TRD (02), App Flow (03), UI/UX Brief (04) & Backend Schema (05)
 */

(function () {
  'use strict';

  // ==========================================================================
  // 1. DATA REPOSITORY: CLINICS & PERSONAS
  // ==========================================================================
  const CLINICS_DB = [
    {
      id: 'CLN-4082',
      name: 'Lakeside Family Clinic',
      contact: 'Ankit Kumar (Ankitkumar87147@gmail.com)',
      phone: '(312) 555-0140',
      address: '1420 N. Ashland Ave, Suite 300, Chicago, IL 60622',
      specialist: 'Ankit K.',
      status: 'Active',
      usersCount: 1
    },
    {
      id: 'CLN-5120',
      name: 'Metro Health West',
      contact: 'Clinic Manager (contact@metrohealthwest.com)',
      phone: '(312) 555-0288',
      address: '840 W. Madison St, Chicago, IL 60607',
      specialist: 'Ankit K.',
      status: 'Active',
      usersCount: 1
    },
    {
      id: 'CLN-6033',
      name: 'Sunrise Pediatrics',
      contact: 'Dr. Robert Miller (billing@sunrisepeds.org)',
      phone: '(312) 555-0391',
      address: '2210 W. North Ave, Chicago, IL 60647',
      specialist: 'Ankit K.',
      status: 'Active',
      usersCount: 1
    }
  ];

  const PRESET_USERS = {
    clinic_user: {
      name: 'Ankit Kumar',
      role: 'clinic_user',
      displayRole: 'User-Lakeside Family Clinic',
      email: 'Ankitkumar87147@gmail.com',
      password: 'Ankitsingh@123',
      clinicId: 'CLN-4082',
      clinicName: 'Lakeside Family Clinic',
      initials: 'AK'
    },
    specialist: {
      name: 'Ankit K.',
      role: 'specialist',
      displayRole: 'US24 Specialist',
      email: 'ankit.k@us24solutions.com',
      password: 'Ankitsingh@123',
      clinicId: null,
      clinicName: 'US24 Solutions (Billing Specialist)',
      initials: 'AK'
    },
    admin: {
      name: 'Saurabh',
      role: 'admin',
      displayRole: 'Admin',
      email: 'saurabh@us24solutions.com',
      password: 'Kashi@123#',
      clinicId: null,
      clinicName: 'US24 Solutions (Operations)',
      initials: 'S'
    }
  };

  const USERS_DIRECTORY = [
    { name: 'Saurabh', email: 'saurabh@us24solutions.com', role: 'Admin', clinic: 'US24 Operations & Compliance', status: 'Active', lastLogin: 'Today, 1:05 PM' },
    { name: 'Ankit K.', email: 'ankit.k@us24solutions.com', role: 'US24 Specialist', clinic: 'US24 Billing Operations', status: 'Active', lastLogin: 'Today, 12:45 PM' },
    { name: 'Ankit Kumar', email: 'Ankitkumar87147@gmail.com', role: 'User-Lakeside Family Clinic', clinic: 'Lakeside Family Clinic', status: 'Active', lastLogin: 'Today, 1:10 PM' }
  ];

  // ==========================================================================
  // 2. INITIAL MOCK STATEMENTS (Multi-Clinic Dataset)
  // ==========================================================================
  const INITIAL_STATEMENTS = [
    // --- LAKESIDE FAMILY CLINIC (CLN-4082) ---
    {
      id: 'stmt-001',
      clinicId: 'CLN-4082',
      clinicName: 'Lakeside Family Clinic',
      patientName: 'Elena Garcia',
      accountNumber: 'ACC-0048213',
      statementDate: '2026-10-14',
      formattedDate: 'Oct 14, 2026',
      balanceDue: 420.00,
      isNew: true,
      withdrawn: false,
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
          body: 'Claim processed. Deductible applied to lines 1 & 2 ($150.00). Co-insurance responsibility ($70.00). EOB mailed.'
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
      clinicId: 'CLN-4082',
      clinicName: 'Lakeside Family Clinic',
      patientName: 'Marcus Vance',
      accountNumber: 'ACC-0048214',
      statementDate: '2026-10-12',
      formattedDate: 'Oct 12, 2026',
      balanceDue: 150.00,
      isNew: true,
      withdrawn: false,
      patientDob: '11/05/1990',
      serviceDateFrom: '09/28/2026',
      serviceDateTo: '09/28/2026',
      insuranceName: 'Aetna Open Choice PPO',
      totalBilled: 380.00,
      insurancePaid: 190.00,
      adjustments: 40.00,
      publishedBy: 'Ankit K., US24 Specialist',
      publishedAt: 'Oct 12, 2026 11:30 AM CDT',
      lineItems: [
        { date: '09/28/2026', cpt: '99213', desc: 'Office Outpatient Visit - Low-Moderate Complexity', billed: 220.00, due: 75.00 },
        { date: '09/28/2026', cpt: '71046', desc: 'Chest X-Ray Examination, 2 Views', billed: 160.00, due: 75.00 }
      ],
      remarks: [
        {
          id: 'rem-201',
          authorName: 'Ankit Kumar',
          authorRole: 'Clinic User',
          type: 'clinic',
          timestamp: 'Oct 12, 2026, 2:15 PM CDT',
          body: 'Patient called to verify copay. Stated they mailed a personal check yesterday.'
        }
      ],
      otherStatements: []
    },
    {
      id: 'stmt-003',
      clinicId: 'CLN-4082',
      clinicName: 'Lakeside Family Clinic',
      patientName: 'Sophia Chen',
      accountNumber: 'ACC-0048215',
      statementDate: '2026-10-10',
      formattedDate: 'Oct 10, 2026',
      balanceDue: 0.00,
      isNew: false,
      withdrawn: false,
      patientDob: '08/22/1979',
      serviceDateFrom: '09/15/2026',
      serviceDateTo: '09/15/2026',
      insuranceName: 'UnitedHealthcare Choice Plus',
      totalBilled: 510.00,
      insurancePaid: 450.00,
      adjustments: 60.00,
      publishedBy: 'Ankit K., US24 Specialist',
      publishedAt: 'Oct 10, 2026 02:45 PM CDT',
      lineItems: [
        { date: '09/15/2026', cpt: '99395', desc: 'Periodic Comprehensive Preventive Medicine Exam', billed: 350.00, due: 0.00 },
        { date: '09/15/2026', cpt: '90471', desc: 'Immunization Administration', billed: 40.00, due: 0.00 },
        { date: '09/15/2026', cpt: '90686', desc: 'Influenza Virus Vaccine Quadrivalent', billed: 120.00, due: 0.00 }
      ],
      remarks: [
        {
          id: 'rem-301',
          authorName: 'Ankit Kumar',
          authorRole: 'Clinic User',
          type: 'clinic',
          timestamp: 'Oct 10, 2026, 3:00 PM CDT',
          body: 'Preventive exam 100% covered under ACA wellness guidelines. Zero balance reconciled.'
        }
      ],
      otherStatements: []
    },
    {
      id: 'stmt-004',
      clinicId: 'CLN-4082',
      clinicName: 'Lakeside Family Clinic',
      patientName: 'James Miller',
      accountNumber: 'ACC-0048216',
      statementDate: '2026-10-06',
      formattedDate: 'Oct 06, 2026',
      balanceDue: 780.00,
      isNew: false,
      withdrawn: false,
      patientDob: '12/14/1958',
      serviceDateFrom: '09/10/2026',
      serviceDateTo: '09/10/2026',
      insuranceName: 'Medicare Part B / Humana Gold',
      totalBilled: 1250.00,
      insurancePaid: 350.00,
      adjustments: 120.00,
      publishedBy: 'Ankit K., US24 Specialist',
      publishedAt: 'Oct 06, 2026 10:00 AM CDT',
      lineItems: [
        { date: '09/10/2026', cpt: '99215', desc: 'Office Outpatient Visit - High Complexity', billed: 420.00, due: 280.00 },
        { date: '09/10/2026', cpt: '93000', desc: 'Electrocardiogram (ECG) 12-Leads with Tracing', billed: 180.00, due: 100.00 },
        { date: '09/10/2026', cpt: '94010', desc: 'Spirometry Pulmonary Function Test', billed: 650.00, due: 400.00 }
      ],
      remarks: [
        {
          id: 'rem-401',
          authorName: 'Medicare Part B',
          authorRole: 'Insurance',
          type: 'insurance',
          companyName: 'Medicare Part B',
          refNumber: 'MED-774102',
          timestamp: 'Oct 06, 2026, 9:30 AM CDT',
          body: 'Coinsurance 20% applied. Spirometry requires medical necessity justification letter from attending physician.'
        },
        {
          id: 'rem-402',
          authorName: 'Ankit Kumar',
          authorRole: 'Clinic User',
          type: 'clinic',
          timestamp: 'Oct 06, 2026, 11:15 AM CDT',
          body: 'Clinic spoke with Mr. Miller; he requested an itemized statement copy sent via secure mail.'
        }
      ],
      otherStatements: []
    },
    {
      id: 'stmt-005',
      clinicId: 'CLN-4082',
      clinicName: 'Lakeside Family Clinic',
      patientName: 'Brenda Ortiz',
      accountNumber: 'ACC-0048217',
      statementDate: '2026-09-20',
      formattedDate: 'Sep 20, 2026',
      balanceDue: -25.00, // Credit balance
      isNew: false,
      withdrawn: false,
      patientDob: '02/09/1993',
      serviceDateFrom: '09/01/2026',
      serviceDateTo: '09/01/2026',
      insuranceName: 'Cigna Health and Life',
      totalBilled: 210.00,
      insurancePaid: 185.00,
      adjustments: 50.00,
      publishedBy: 'Ankit K., US24 Specialist',
      publishedAt: 'Sep 20, 2026 01:00 PM CDT',
      lineItems: [
        { date: '09/01/2026', cpt: '99213', desc: 'Office Outpatient Visit - Low-Moderate Severity', billed: 210.00, due: -25.00 }
      ],
      remarks: [
        {
          id: 'rem-501',
          authorName: 'Ankit K.',
          authorRole: 'US24 Specialist',
          type: 'specialist',
          timestamp: 'Sep 20, 2026, 1:12 PM CDT',
          body: 'Patient overpaid copay at time of service by $25. Credit balance reflected on statement. Will apply to future visit per clinic protocol.'
        }
      ],
      otherStatements: []
    },

    // --- METRO HEALTH WEST (CLN-5120) ---
    {
      id: 'stmt-011',
      clinicId: 'CLN-5120',
      clinicName: 'Metro Health West',
      patientName: 'Liam Jackson',
      accountNumber: 'ACC-0051201',
      statementDate: '2026-10-15',
      formattedDate: 'Oct 15, 2026',
      balanceDue: 340.00,
      isNew: true,
      withdrawn: false,
      patientDob: '05/12/1988',
      serviceDateFrom: '10/01/2026',
      serviceDateTo: '10/01/2026',
      insuranceName: 'Blue Cross Blue Shield (IL)',
      totalBilled: 720.00,
      insurancePaid: 320.00,
      adjustments: 60.00,
      publishedBy: 'Ankit K., US24 Specialist',
      publishedAt: 'Oct 15, 2026 10:00 AM CDT',
      lineItems: [
        { date: '10/01/2026', cpt: '99214', desc: 'Outpatient Clinical Evaluation', billed: 320.00, due: 140.00 },
        { date: '10/01/2026', cpt: '73030', desc: 'Radiologic Examination Shoulder', billed: 400.00, due: 200.00 }
      ],
      remarks: [
        {
          id: 'rem-601',
          authorName: 'Karen Phillips',
          authorRole: 'Clinic User',
          type: 'clinic',
          timestamp: 'Oct 15, 2026, 11:30 AM CDT',
          body: 'Patient inquiring why secondary insurance was not billed. Can US24 specialist check secondary submission?'
        }
      ],
      otherStatements: []
    },
    {
      id: 'stmt-012',
      clinicId: 'CLN-5120',
      clinicName: 'Metro Health West',
      patientName: 'Olivia Taylor',
      accountNumber: 'ACC-0051202',
      statementDate: '2026-10-11',
      formattedDate: 'Oct 11, 2026',
      balanceDue: 180.00,
      isNew: false,
      withdrawn: false,
      patientDob: '09/30/1995',
      serviceDateFrom: '09/25/2026',
      serviceDateTo: '09/25/2026',
      insuranceName: 'Aetna PPO',
      totalBilled: 390.00,
      insurancePaid: 160.00,
      adjustments: 50.00,
      publishedBy: 'Ankit K., US24 Specialist',
      publishedAt: 'Oct 11, 2026 09:30 AM CDT',
      lineItems: [
        { date: '09/25/2026', cpt: '99213', desc: 'Outpatient Evaluation', billed: 220.00, due: 90.00 },
        { date: '09/25/2026', cpt: '87880', desc: 'Rapid Strep A Assay Detection', billed: 170.00, due: 90.00 }
      ],
      remarks: [],
      otherStatements: []
    },

    // --- SUNRISE PEDIATRICS (CLN-6033) ---
    {
      id: 'stmt-021',
      clinicId: 'CLN-6033',
      clinicName: 'Sunrise Pediatrics',
      patientName: 'Lucas Martinez',
      accountNumber: 'ACC-0060331',
      statementDate: '2026-10-16',
      formattedDate: 'Oct 16, 2026',
      balanceDue: 195.00,
      isNew: true,
      withdrawn: false,
      patientDob: '07/11/2018',
      serviceDateFrom: '10/05/2026',
      serviceDateTo: '10/05/2026',
      insuranceName: 'UnitedHealthcare Child Health Plus',
      totalBilled: 420.00,
      insurancePaid: 180.00,
      adjustments: 45.00,
      publishedBy: 'Ankit K., US24 Specialist',
      publishedAt: 'Oct 16, 2026 08:30 AM CDT',
      lineItems: [
        { date: '10/05/2026', cpt: '99392', desc: 'Preventive Visit Established (Age 5-11)', billed: 280.00, due: 120.00 },
        { date: '10/05/2026', cpt: '90707', desc: 'MMR Vaccine Subcutaneous', billed: 140.00, due: 75.00 }
      ],
      remarks: [],
      otherStatements: []
    }
  ];

  // ==========================================================================
  // 3. INITIAL AUDIT LOG DATA (HIPAA § 164.312(b))
  // ==========================================================================
  const INITIAL_AUDIT_LOG = [
    { timestamp: 'Oct 21, 2026, 1:10 PM', actor: 'Ankit Kumar', role: 'User-Lakeside Family Clinic', clinic: 'Lakeside Family Clinic', action: 'user.login', target: 'Portal Auth (2FA)', ip: '192.168.1.104', outcome: 'SUCCESS' },
    { timestamp: 'Oct 21, 2026, 1:08 PM', actor: 'Saurabh', role: 'Admin Level', clinic: 'US24 Operations', action: 'user.login', target: 'Admin Dashboard', ip: '10.0.4.12', outcome: 'SUCCESS' },
    { timestamp: 'Oct 21, 2026, 12:45 PM', actor: 'Ankit K.', role: 'US24 Specialist', clinic: 'US24 Billing Operations', action: 'statement.upload', target: 'Statement #ACC-0060331 (Lucas Martinez)', ip: '10.0.4.18', outcome: 'SUCCESS' },
    { timestamp: 'Oct 21, 2026, 11:32 AM', actor: 'Ankit Kumar', role: 'User-Lakeside Family Clinic', clinic: 'Lakeside Family Clinic', action: 'statement.view', target: 'Statement #ACC-0048213 (Elena Garcia)', ip: '192.168.1.104', outcome: 'SUCCESS' },
    { timestamp: 'Oct 21, 2026, 11:35 AM', actor: 'Ankit Kumar', role: 'User-Lakeside Family Clinic', clinic: 'Lakeside Family Clinic', action: 'statement.print', target: 'Statement #ACC-0048213 (Elena Garcia)', ip: '192.168.1.104', outcome: 'SUCCESS' },
    { timestamp: 'Oct 20, 2026, 4:15 PM', actor: 'Ankit K.', role: 'US24 Specialist', clinic: 'Lakeside Family Clinic', action: 'remark.add', target: 'Statement #ACC-0048213', ip: '10.0.4.18', outcome: 'SUCCESS' }
  ];

  const RECENT_UPLOADS = [
    { date: 'Oct 21, 2026, 12:45 PM', clinic: 'Sunrise Pediatrics', type: 'Single PDF Upload', desc: 'Lucas Martinez (ACC-0060331)', count: 1, status: 'Published' },
    { date: 'Oct 15, 2026, 10:00 AM', clinic: 'Metro Health West', type: 'Bulk Import', desc: 'October Cycle Batch #METRO-10A', count: 14, status: 'Published' },
    { date: 'Oct 14, 2026, 09:15 AM', clinic: 'Lakeside Family Clinic', type: 'Bulk Import', desc: 'October Billing Cycle #LAKE-10', count: 8, status: 'Published' }
  ];

  // ==========================================================================
  // 4. APPLICATION STATE
  // ==========================================================================
  const state = {
    selectedPersonaKey: 'clinic_user', // 'clinic_user', 'specialist', 'admin'
    user: null, // Active signed-in user object
    clinics: JSON.parse(JSON.stringify(CLINICS_DB)),
    statements: JSON.parse(JSON.stringify(INITIAL_STATEMENTS)),
    auditLog: JSON.parse(JSON.stringify(INITIAL_AUDIT_LOG)),
    recentUploads: JSON.parse(JSON.stringify(RECENT_UPLOADS)),
    currentStatementId: null,
    searchQuery: '',
    dateFilter: '',
    statusFilter: 'all',
    sortOrder: 'date-desc',
    selectedClinicFilter: 'CLN-4082', // For clinic statements view
    adminActiveTab: 'status-tracker', // 'status-tracker', 'clinics', 'users', 'audit'
    adminSearch: '',
    adminClinicFilter: 'all',
    adminStatusFilter: 'all'
  };

  // ==========================================================================
  // 5. DOM ELEMENTS CACHE
  // ==========================================================================
  const elements = {
    // Header
    siteHeader: document.getElementById('site-header'),
    headerUserBadge: document.getElementById('header-user-badge'),
    userAvatar: document.getElementById('user-avatar'),
    userDisplayName: document.getElementById('user-display-name'),
    userRoleBadge: document.getElementById('user-role-badge'),
    userClinicName: document.getElementById('user-clinic-name'),
    userClinicIdBadge: document.getElementById('user-clinic-id-badge'),
    btnHeaderSwitchRole: document.getElementById('btn-header-switch-role'),
    btnHeaderSignout: document.getElementById('btn-header-signout'),
    brandHomeLink: document.getElementById('brand-home-link'),
    roleQuickBar: document.getElementById('role-quick-bar'),
    quickBarRoleText: document.getElementById('quick-bar-role-text'),
    quickSwitchClinic: document.getElementById('quick-switch-clinic'),
    quickSwitchSpecialist: document.getElementById('quick-switch-specialist'),
    quickSwitchAdmin: document.getElementById('quick-switch-admin'),

    // Views
    viewLogin: document.getElementById('view-login'),
    viewVerify: document.getElementById('view-verify'),
    viewHome: document.getElementById('view-home'),
    viewSpecialistDashboard: document.getElementById('view-specialist-dashboard'),
    viewAdminDashboard: document.getElementById('view-admin-dashboard'),
    viewStatements: document.getElementById('view-statements'),
    viewDetail: document.getElementById('view-detail'),

    // Login Form & Personas
    tabPersonaClinic: document.getElementById('tab-persona-clinic'),
    tabPersonaSpecialist: document.getElementById('tab-persona-specialist'),
    tabPersonaAdmin: document.getElementById('tab-persona-admin'),
    authRoleNotice: document.getElementById('auth-role-notice'),
    formLogin: document.getElementById('form-login'),
    inputEmail: document.getElementById('input-email'),
    inputPassword: document.getElementById('input-password'),
    btnTogglePassword: document.getElementById('btn-toggle-password'),
    loginErrorAlert: document.getElementById('login-error-alert'),
    btnQuickClinic: document.getElementById('btn-quick-clinic'),
    btnQuickSpecialist: document.getElementById('btn-quick-specialist'),
    btnQuickAdmin: document.getElementById('btn-quick-admin'),

    // 2-Step Verify Form
    verifyUserName: document.getElementById('verify-user-name'),
    verifyRoleBadge: document.getElementById('verify-role-badge'),
    verifyMaskedEmail: document.getElementById('verify-masked-email'),
    formVerify: document.getElementById('form-verify'),
    otpInputs: Array.from(document.querySelectorAll('.otp-input')),
    verifyErrorAlert: document.getElementById('verify-error-alert'),
    btnResendCode: document.getElementById('btn-resend-code'),
    btnBackToLogin: document.getElementById('btn-back-to-login'),

    // Clinic Home (C1)
    homeHeadline: document.getElementById('home-headline'),
    homeWelcomeName: document.getElementById('home-welcome-name'),
    cardPatientStatements: document.getElementById('card-patient-statements'),
    homeNewBadge: document.getElementById('home-new-badge'),

    // Specialist Dashboard (S1)
    specDashName: document.getElementById('spec-dash-name'),
    kpiSpecClinics: document.getElementById('kpi-spec-clinics'),
    kpiSpecStatements: document.getElementById('kpi-spec-statements'),
    kpiSpecRemarks: document.getElementById('kpi-spec-remarks'),
    kpiSpecUploads: document.getElementById('kpi-spec-uploads'),
    assignedClinicsList: document.getElementById('assigned-clinics-list'),
    tableUnansweredRemarks: document.getElementById('table-unanswered-remarks'),
    tableRecentUploads: document.getElementById('table-recent-uploads'),
    btnSpecUploadModal: document.getElementById('btn-spec-upload-modal'),
    btnSpecImportModal: document.getElementById('btn-spec-import-modal'),

    // Admin Dashboard (M1)
    adminDashName: document.getElementById('admin-dash-name'),
    kpiAdminClinics: document.getElementById('kpi-admin-clinics'),
    kpiAdminStatements: document.getElementById('kpi-admin-statements'),
    kpiAdminUsers: document.getElementById('kpi-admin-users'),
    kpiAdminAudit: document.getElementById('kpi-admin-audit'),
    tabAdminStatusTracker: document.getElementById('tab-admin-status-tracker'),
    tabAdminClinics: document.getElementById('tab-admin-clinics'),
    tabAdminUsers: document.getElementById('tab-admin-users'),
    tabAdminAudit: document.getElementById('tab-admin-audit'),
    panelAdminStatusTracker: document.getElementById('panel-admin-status-tracker'),
    panelAdminClinics: document.getElementById('panel-admin-clinics'),
    panelAdminUsers: document.getElementById('panel-admin-users'),
    panelAdminAudit: document.getElementById('panel-admin-audit'),
    adminSearchStatement: document.getElementById('admin-search-statement'),
    adminFilterClinic: document.getElementById('admin-filter-clinic'),
    adminFilterStatus: document.getElementById('admin-filter-status'),
    tableAdminTrackerBody: document.getElementById('table-admin-tracker-body'),
    tableAdminClinicsBody: document.getElementById('table-admin-clinics-body'),
    tableAdminUsersBody: document.getElementById('table-admin-users-body'),
    tableAdminAuditBody: document.getElementById('table-admin-audit-body'),
    btnExportAuditCsv: document.getElementById('btn-export-audit-csv'),
    btnAdminAddClinicModal: document.getElementById('btn-admin-add-clinic-modal'),
    btnAdminInviteModal: document.getElementById('btn-admin-invite-modal'),

    // Statement List (P1)
    breadcrumbHome: document.getElementById('breadcrumb-home'),
    statementsClinicName: document.getElementById('statements-clinic-name'),
    statementsCountHint: document.getElementById('statements-count-hint'),
    specialistClinicPickerContainer: document.getElementById('specialist-clinic-picker-container'),
    selectViewClinic: document.getElementById('select-view-clinic'),
    btnQuickUploadStatement: document.getElementById('btn-quick-upload-statement'),
    filterSearchInput: document.getElementById('filter-search-input'),
    filterDateInput: document.getElementById('filter-date-input'),
    filterStatusSelect: document.getElementById('filter-status-select'),
    sortStatementsSelect: document.getElementById('sort-statements-select'),
    resultsCountText: document.getElementById('results-count-text'),
    btnClearFilters: document.getElementById('btn-clear-filters'),
    statementsTableContainer: document.getElementById('statements-table-container'),
    statementsTableBody: document.getElementById('statements-table-body'),
    statementsEmptyState: document.getElementById('statements-empty-state'),
    btnEmptyClear: document.getElementById('btn-empty-clear'),

    // Statement Detail (P2)
    detailBreadcrumbBack: document.getElementById('detail-breadcrumb-back'),
    detailBreadcrumbPatient: document.getElementById('detail-breadcrumb-patient'),
    detailRoleIndicator: document.getElementById('detail-role-indicator'),
    detailPatientNameHeading: document.getElementById('detail-patient-name-heading'),
    detailHeaderAccount: document.getElementById('detail-header-account'),
    detailHeaderDate: document.getElementById('detail-header-date'),
    detailHeaderClinic: document.getElementById('detail-header-clinic'),
    detailNewPill: document.getElementById('detail-new-pill'),
    btnPrintStatement: document.getElementById('btn-print-statement'),
    btnDownloadStatement: document.getElementById('btn-download-statement'),
    btnWithdrawStatement: document.getElementById('btn-withdraw-statement'),
    docClinicName: document.getElementById('doc-clinic-name'),
    docStmtNumber: document.getElementById('doc-stmt-number'),
    docStmtDate: document.getElementById('doc-stmt-date'),
    docPatientName: document.getElementById('doc-patient-name'),
    docAccountNum: document.getElementById('doc-account-num'),
    docDob: document.getElementById('doc-dob'),
    docServiceDates: document.getElementById('doc-service-dates'),
    docInsuranceName: document.getElementById('doc-insurance-name'),
    docLineItemsBody: document.getElementById('doc-line-items-body'),
    docTotalBilled: document.getElementById('doc-total-billed'),
    docInsPaid: document.getElementById('doc-ins-paid'),
    docAdjustments: document.getElementById('doc-adjustments'),
    docFinalBalance: document.getElementById('doc-final-balance'),
    printTimestamp: document.getElementById('print-timestamp'),
    otherStatementsContainer: document.getElementById('other-statements-container'),
    otherStatementsList: document.getElementById('other-statements-list'),

    // Remarks Ledger
    remarksFeed: document.getElementById('remarks-feed'),
    remarksCountTag: document.getElementById('remarks-count-tag'),
    formAddRemark: document.getElementById('form-add-remark'),
    textareaRemark: document.getElementById('textarea-remark'),
    charCounter: document.getElementById('char-counter'),
    remarkPostingAuthor: document.getElementById('remark-posting-author'),
    specialistRemarkTypeRow: document.getElementById('specialist-remark-type-row'),
    insuranceExtraFields: document.getElementById('insurance-extra-fields'),
    inputInsCompany: document.getElementById('input-ins-company'),
    inputInsClaim: document.getElementById('input-ins-claim'),

    // Modals
    modalUploadStatement: document.getElementById('modal-upload-statement'),
    formUploadStatement: document.getElementById('form-upload-statement'),
    btnCloseUploadModal: document.getElementById('btn-close-upload-modal'),
    btnCancelUpload: document.getElementById('btn-cancel-upload'),
    uploadClinicSelect: document.getElementById('upload-clinic-select'),
    uploadStmtDate: document.getElementById('upload-stmt-date'),
    uploadPatientName: document.getElementById('upload-patient-name'),
    uploadAccountNum: document.getElementById('upload-account-num'),
    uploadDob: document.getElementById('upload-dob'),
    uploadBalanceDue: document.getElementById('upload-balance-due'),
    uploadServiceDates: document.getElementById('upload-service-dates'),
    uploadInsurance: document.getElementById('upload-insurance'),
    uploadCptDesc: document.getElementById('upload-cpt-desc'),

    modalImportStatements: document.getElementById('modal-import-statements'),
    btnCloseImportModal: document.getElementById('btn-close-import-modal'),
    btnCancelImport: document.getElementById('btn-cancel-import'),
    btnExecuteImport: document.getElementById('btn-execute-import'),
    importClinicSelect: document.getElementById('import-clinic-select'),

    modalWithdrawStatement: document.getElementById('modal-withdraw-statement'),
    btnCloseWithdrawModal: document.getElementById('btn-close-withdraw-modal'),
    btnCancelWithdraw: document.getElementById('btn-cancel-withdraw'),
    btnConfirmWithdraw: document.getElementById('btn-confirm-withdraw'),
    withdrawPatientName: document.getElementById('withdraw-patient-name'),
    textareaWithdrawReason: document.getElementById('textarea-withdraw-reason'),

    modalAddClinic: document.getElementById('modal-add-clinic'),
    formAddClinic: document.getElementById('form-add-clinic'),
    btnCloseClinicModal: document.getElementById('btn-close-clinic-modal'),
    btnCancelAddClinic: document.getElementById('btn-cancel-add-clinic'),
    newClinicName: document.getElementById('new-clinic-name'),
    newClinicId: document.getElementById('new-clinic-id'),
    newClinicContact: document.getElementById('new-clinic-contact'),
    newClinicSpecialist: document.getElementById('new-clinic-specialist'),

    modalInviteUser: document.getElementById('modal-invite-user'),
    formInviteUser: document.getElementById('form-invite-user'),
    btnCloseInviteModal: document.getElementById('btn-close-invite-modal'),
    btnCancelInvite: document.getElementById('btn-cancel-invite'),
    inviteUserName: document.getElementById('invite-user-name'),
    inviteUserEmail: document.getElementById('invite-user-email'),
    inviteUserRole: document.getElementById('invite-user-role'),
    inviteUserClinic: document.getElementById('invite-user-clinic'),

    modalSwitchPersona: document.getElementById('modal-switch-persona'),
    btnCloseSwitchModal: document.getElementById('btn-close-switch-modal'),
    btnModalSwitchClinic: document.getElementById('btn-modal-switch-clinic'),
    btnModalSwitchSpecialist: document.getElementById('btn-modal-switch-specialist'),
    btnModalSwitchAdmin: document.getElementById('btn-modal-switch-admin'),

    toastBanner: document.getElementById('toast-banner'),
    toastMessage: document.getElementById('toast-message')
  };

  // Set today's date for date inputs
  const todayISO = new Date().toISOString().split('T')[0];
  if (elements.uploadStmtDate) elements.uploadStmtDate.value = todayISO;

  // ==========================================================================
  // 6. ROUTING & VIEW NAVIGATION
  // ==========================================================================
  function showView(viewId) {
    const allViews = [
      elements.viewLogin,
      elements.viewVerify,
      elements.viewHome,
      elements.viewSpecialistDashboard,
      elements.viewAdminDashboard,
      elements.viewStatements,
      elements.viewDetail
    ];

    allViews.forEach(v => {
      if (v) {
        v.classList.remove('active');
        v.style.display = 'none';
      }
    });

    const target = document.getElementById(viewId);
    if (target) {
      target.classList.add('active');
      target.style.display = 'block';
      window.scrollTo(0, 0);
    }

    updateHeaderState(viewId);
  }

  function updateHeaderState(viewId) {
    const isAuthed = state.user !== null && viewId !== 'view-login' && viewId !== 'view-verify';

    if (elements.headerUserBadge) elements.headerUserBadge.style.display = isAuthed ? 'flex' : 'none';
    if (elements.btnHeaderSignout) elements.btnHeaderSignout.style.display = isAuthed ? 'inline-flex' : 'none';
    if (elements.btnHeaderSwitchRole) elements.btnHeaderSwitchRole.style.display = isAuthed ? 'inline-flex' : 'none';
    if (elements.roleQuickBar) elements.roleQuickBar.style.display = isAuthed ? 'block' : 'none';

    if (isAuthed && state.user) {
      elements.userDisplayName.textContent = state.user.name;
      elements.userAvatar.textContent = state.user.initials || 'U';

      // Role badge styling
      elements.userRoleBadge.className = 'badge-role ' + (
        state.user.role === 'clinic_user' ? 'badge-role-clinic' :
        state.user.role === 'specialist' ? 'badge-role-specialist' : 'badge-role-admin'
      );
      elements.userRoleBadge.textContent = state.user.displayRole;

      if (state.user.role === 'clinic_user') {
        elements.userClinicName.textContent = state.user.clinicName;
        elements.userClinicIdBadge.textContent = state.user.clinicId;
        elements.userClinicIdBadge.style.display = 'inline-block';
        elements.quickBarRoleText.textContent = `1. Clinic Level (${state.user.name} - ${state.user.clinicName})`;
      } else if (state.user.role === 'specialist') {
        elements.userClinicName.textContent = 'US24 Solutions';
        elements.userClinicIdBadge.textContent = 'Specialist';
        elements.userClinicIdBadge.style.display = 'inline-block';
        elements.quickBarRoleText.textContent = `2. US24 Specialist (${state.user.name})`;
      } else {
        elements.userClinicName.textContent = 'US24 Operations';
        elements.userClinicIdBadge.textContent = 'Admin';
        elements.userClinicIdBadge.style.display = 'inline-block';
        elements.quickBarRoleText.textContent = `3. Admin Level (${state.user.name})`;
      }

      // Update active state on quick switcher pills
      [elements.quickSwitchClinic, elements.quickSwitchSpecialist, elements.quickSwitchAdmin].forEach(btn => {
        if (btn) btn.classList.remove('active');
      });
      if (state.user.role === 'clinic_user' && elements.quickSwitchClinic) elements.quickSwitchClinic.classList.add('active');
      if (state.user.role === 'specialist' && elements.quickSwitchSpecialist) elements.quickSwitchSpecialist.classList.add('active');
      if (state.user.role === 'admin' && elements.quickSwitchAdmin) elements.quickSwitchAdmin.classList.add('active');
    }
  }

  function routeUserToPrimaryHome() {
    if (!state.user) {
      showView('view-login');
      return;
    }

    if (state.user.role === 'clinic_user') {
      elements.homeHeadline.textContent = state.user.clinicName;
      elements.homeWelcomeName.textContent = state.user.name;
      updateHomeNewBadge();
      showView('view-home');
    } else if (state.user.role === 'specialist') {
      elements.specDashName.textContent = state.user.name;
      renderSpecialistDashboard();
      showView('view-specialist-dashboard');
    } else if (state.user.role === 'admin') {
      elements.adminDashName.textContent = state.user.name;
      renderAdminDashboard();
      showView('view-admin-dashboard');
    }
  }

  // ==========================================================================
  // 7. PERSONA SELECTION & AUTHENTICATION
  // ==========================================================================
  function selectLoginPersona(personaKey) {
    state.selectedPersonaKey = personaKey;
    const persona = PRESET_USERS[personaKey];

    // Update Tab Styles
    [elements.tabPersonaClinic, elements.tabPersonaSpecialist, elements.tabPersonaAdmin].forEach(t => {
      if (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      }
    });

    if (personaKey === 'clinic_user') {
      elements.tabPersonaClinic.classList.add('active');
      elements.tabPersonaClinic.setAttribute('aria-selected', 'true');
      elements.inputEmail.value = persona.email;
      elements.inputPassword.value = persona.password;
      elements.authRoleNotice.innerHTML = `<strong>1. Clinic Level Login (${persona.displayRole}):</strong> Sign in as clinic employee (${persona.name}) to check patient statements, review itemized services, and record clinic updates in the shared remarks ledger.`;
    } else if (personaKey === 'specialist') {
      elements.tabPersonaSpecialist.classList.add('active');
      elements.tabPersonaSpecialist.setAttribute('aria-selected', 'true');
      elements.inputEmail.value = persona.email;
      elements.inputPassword.value = persona.password;
      elements.authRoleNotice.innerHTML = `<strong>2. US24 Specialist Login (${persona.displayRole}):</strong> Sign in as billing specialist (${persona.name}) to upload single statements, import batch spreadsheets for assigned clinics, and post insurance notes.`;
    } else if (personaKey === 'admin') {
      elements.tabPersonaAdmin.classList.add('active');
      elements.tabPersonaAdmin.setAttribute('aria-selected', 'true');
      elements.inputEmail.value = persona.email;
      elements.inputPassword.value = persona.password;
      elements.authRoleNotice.innerHTML = `<strong>3. Admin Level Login (${persona.displayRole}):</strong> Sign in as operations administrator (${persona.name}) to track all statement statuses across all clinics, manage accounts, and audit access logs.`;
    }
  }

  function handleLoginSubmit(e) {
    if (e) e.preventDefault();
    const email = elements.inputEmail.value.trim().toLowerCase();
    const password = elements.inputPassword.value.trim();

    if (!email || !password) {
      elements.loginErrorAlert.textContent = 'Please enter both your email address and password.';
      elements.loginErrorAlert.style.display = 'block';
      return;
    }

    // Match against the 3 authorized static users
    const userEntries = Object.entries(PRESET_USERS);
    const matched = userEntries.find(([key, user]) => user.email.toLowerCase() === email);

    if (!matched) {
      elements.loginErrorAlert.textContent = 'Account not found. Please enter an authorized user email.';
      elements.loginErrorAlert.style.display = 'block';
      return;
    }

    const [matchedPersonaKey, persona] = matched;

    if (password !== persona.password) {
      elements.loginErrorAlert.textContent = 'Incorrect password. Please verify your credentials and try again.';
      elements.loginErrorAlert.style.display = 'block';
      return;
    }

    state.selectedPersonaKey = matchedPersonaKey;

    // Populate 2-step verification card
    elements.verifyUserName.textContent = persona.name;
    elements.verifyRoleBadge.textContent = persona.displayRole;
    elements.verifyRoleBadge.className = 'badge-role ' + (
      persona.role === 'clinic_user' ? 'badge-role-clinic' :
      persona.role === 'specialist' ? 'badge-role-specialist' : 'badge-role-admin'
    );
    elements.verifyMaskedEmail.textContent = maskEmail(persona.email);

    // Clear and autofill OTP for smooth demo
    elements.otpInputs.forEach((inp, idx) => {
      inp.value = (idx + 1).toString();
    });

    elements.loginErrorAlert.style.display = 'none';
    showView('view-verify');
    showToast(`6-digit code sent to ${maskEmail(persona.email)}`);
  }

  function handleVerifySubmit(e) {
    if (e) e.preventDefault();
    const enteredCode = elements.otpInputs.map(i => i.value).join('');

    if (enteredCode.length < 6) {
      elements.verifyErrorAlert.textContent = 'Please enter all 6 digits of the verification code.';
      elements.verifyErrorAlert.style.display = 'block';
      return;
    }

    elements.verifyErrorAlert.style.display = 'none';
    const persona = PRESET_USERS[state.selectedPersonaKey];
    state.user = JSON.parse(JSON.stringify(persona));

    // Log login audit event
    logAuditEvent('user.login', `Portal Auth (2FA Verified)`, 'SUCCESS');

    showToast(`Signed in as ${state.user.name} (${state.user.displayRole})`);
    routeUserToPrimaryHome();
  }

  function handleDirectRoleSwitch(personaKey) {
    state.selectedPersonaKey = personaKey;
    const persona = PRESET_USERS[personaKey];
    state.user = JSON.parse(JSON.stringify(persona));

    closeModal('modal-switch-persona');
    logAuditEvent('user.role_switch', `Switched role to ${persona.displayRole}`, 'SUCCESS');
    showToast(`Switched active role to: ${persona.displayRole} (${persona.name})`);
    routeUserToPrimaryHome();
  }

  function handleSignOut() {
    if (state.user) {
      logAuditEvent('user.logout', `Signed out from session`, 'SUCCESS');
    }
    state.user = null;
    state.currentStatementId = null;
    showToast('You have been securely signed out.');
    showView('view-login');
  }

  // ==========================================================================
  // 8. AUDIT LOGGING & COMPLIANCE ENGINE (HIPAA § 164.312(b))
  // ==========================================================================
  function logAuditEvent(action, target, outcome) {
    const now = new Date();
    const timeStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ', ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

    const auditEntry = {
      timestamp: timeStr,
      actor: state.user ? state.user.name : 'System / Anonymous',
      role: state.user ? state.user.displayRole : 'Guest',
      clinic: state.user && state.user.clinicName ? state.user.clinicName : 'US24 Portal',
      action: action,
      target: target,
      ip: '192.168.1.104',
      outcome: outcome || 'SUCCESS'
    };

    state.auditLog.unshift(auditEntry);
    if (elements.kpiAdminAudit) elements.kpiAdminAudit.textContent = (state.auditLog.length + 135).toString();
  }

  function exportAuditLogCSV() {
    logAuditEvent('audit.export_csv', 'Full Access Audit Trail Download', 'SUCCESS');
    
    let csv = 'Timestamp,Actor,Role Level,Clinic,Action Type,Target Resource,IP Address,Outcome\n';
    state.auditLog.forEach(row => {
      csv += `"${row.timestamp}","${row.actor}","${row.role}","${row.clinic}","${row.action}","${row.target}","${row.ip}","${row.outcome}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `US24_HIPAA_Audit_Trail_${todayISO}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Audit log CSV exported successfully.');
  }

  // ==========================================================================
  // 9. SPECIALIST DASHBOARD RENDERING (Role 2)
  // ==========================================================================
  function renderSpecialistDashboard() {
    // KPIs
    const assignedClinics = state.clinics.filter(c => c.specialist === state.user.name || true);
    const assignedClinicIds = assignedClinics.map(c => c.id);
    const specStatements = state.statements.filter(s => assignedClinicIds.includes(s.clinicId) && !s.withdrawn);
    
    // Count unanswered clinic inquiries
    const unanswered = [];
    specStatements.forEach(s => {
      const clinicRemarks = s.remarks.filter(r => r.type === 'clinic');
      if (clinicRemarks.length > 0) {
        const lastRemark = s.remarks[s.remarks.length - 1];
        if (lastRemark.type === 'clinic') {
          unanswered.push({
            statement: s,
            remark: lastRemark
          });
        }
      }
    });

    elements.kpiSpecClinics.textContent = assignedClinics.length.toString();
    elements.kpiSpecStatements.textContent = specStatements.length.toString();
    elements.kpiSpecRemarks.textContent = unanswered.length.toString();
    elements.kpiSpecUploads.textContent = state.recentUploads.length.toString();

    // Render Assigned Clinics Cards
    elements.assignedClinicsList.innerHTML = '';
    assignedClinics.forEach(c => {
      const clinicStmts = specStatements.filter(s => s.clinicId === c.id);
      const totalBalance = clinicStmts.reduce((acc, curr) => acc + curr.balanceDue, 0);

      const card = document.createElement('div');
      card.className = 'clinic-card';
      card.innerHTML = `
        <div>
          <div class="clinic-card-header">
            <div>
              <div class="clinic-card-name">${escapeHTML(c.name)}</div>
              <span class="clinic-card-id">${escapeHTML(c.id)}</span>
            </div>
            <span class="badge badge-neutral" style="color: var(--color-success);">● ${c.status}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 6px;">
            ${escapeHTML(c.contact)}
          </div>
          <div class="clinic-card-stats">
            <div class="clinic-stat-item">
              <span class="clinic-stat-label">Active Statements</span>
              <span class="clinic-stat-val">${clinicStmts.length}</span>
            </div>
            <div class="clinic-stat-item">
              <span class="clinic-stat-label">Total Balance Due</span>
              <span class="clinic-stat-val">$${totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button type="button" class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.viewClinicStatements('${c.id}')">
            View Statements
          </button>
          <button type="button" class="btn btn-primary btn-sm" onclick="window.openUploadForClinic('${c.id}')">
            + Upload
          </button>
        </div>
      `;
      elements.assignedClinicsList.appendChild(card);
    });

    // Render Unanswered Remarks Queue
    elements.tableUnansweredRemarks.innerHTML = '';
    if (unanswered.length === 0) {
      elements.tableUnansweredRemarks.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--color-text-subtle); padding: 24px;">
            ✓ All clinic inquiries have been answered. You're completely caught up!
          </td>
        </tr>
      `;
    } else {
      unanswered.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${escapeHTML(item.statement.clinicName)}</strong></td>
          <td>${escapeHTML(item.statement.patientName)}</td>
          <td><span style="font-family: var(--font-mono); font-size: 0.8rem;">${escapeHTML(item.statement.accountNumber)}</span></td>
          <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            "${escapeHTML(item.remark.body)}"
          </td>
          <td>${escapeHTML(item.remark.authorName)}</td>
          <td style="font-size: 0.76rem; color: var(--color-text-subtle);">${escapeHTML(item.remark.timestamp)}</td>
          <td style="text-align: right;">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.openStatementDetail('${item.statement.id}')">
              Answer Remark
            </button>
          </td>
        </tr>
        `;
        elements.tableUnansweredRemarks.appendChild(tr);
      });
    }

    // Render Recent Uploads Table
    elements.tableRecentUploads.innerHTML = '';
    state.recentUploads.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-size: 0.78rem;">${escapeHTML(u.date)}</td>
        <td><strong>${escapeHTML(u.clinic)}</strong></td>
        <td><span class="badge badge-neutral">${escapeHTML(u.type)}</span></td>
        <td>${escapeHTML(u.desc)}</td>
        <td style="font-weight: 600;">${u.count} statement${u.count > 1 ? 's' : ''}</td>
        <td><span class="badge badge-neutral" style="color: var(--color-success);">✓ ${escapeHTML(u.status)}</span></td>
      `;
      elements.tableRecentUploads.appendChild(tr);
    });
  }

  // ==========================================================================
  // 10. ADMIN DASHBOARD RENDERING (Role 3)
  // ==========================================================================
  function renderAdminDashboard() {
    // KPIs
    const totalBalance = state.statements.filter(s => !s.withdrawn).reduce((acc, curr) => acc + curr.balanceDue, 0);
    elements.kpiAdminClinics.textContent = state.clinics.length.toString();
    elements.kpiAdminStatements.textContent = state.statements.length.toString();
    elements.kpiAdminUsers.textContent = USERS_DIRECTORY.length.toString();
    elements.kpiAdminAudit.textContent = (state.auditLog.length + 135).toString();

    // Render Status Tracker Tab (All Statements across all clinics)
    renderAdminStatusTracker();

    // Render Clinics Directory Tab
    renderAdminClinicsDirectory();

    // Render Users Accounts Tab
    renderAdminUsersDirectory();

    // Render Audit Trail Tab
    renderAdminAuditTrail();
  }

  function renderAdminStatusTracker() {
    let rows = state.statements.slice();

    // Filter by search
    if (state.adminSearch) {
      const q = state.adminSearch.toLowerCase();
      rows = rows.filter(s => s.patientName.toLowerCase().includes(q) || s.accountNumber.toLowerCase().includes(q));
    }

    // Filter by clinic
    if (state.adminClinicFilter !== 'all') {
      rows = rows.filter(s => s.clinicId === state.adminClinicFilter);
    }

    // Filter by status
    if (state.adminStatusFilter === 'new') {
      rows = rows.filter(s => s.isNew && !s.withdrawn);
    } else if (state.adminStatusFilter === 'viewed') {
      rows = rows.filter(s => !s.isNew && !s.withdrawn);
    } else if (state.adminStatusFilter === 'withdrawn') {
      rows = rows.filter(s => s.withdrawn);
    }

    elements.tableAdminTrackerBody.innerHTML = '';
    if (rows.length === 0) {
      elements.tableAdminTrackerBody.innerHTML = `
        <tr><td colspan="8" style="text-align: center; color: var(--color-text-subtle); padding: 24px;">No statements match the selected status filters.</td></tr>
      `;
      return;
    }

    rows.forEach(s => {
      const tr = document.createElement('tr');
      const statusBadge = s.withdrawn
        ? `<span class="status-chip status-withdrawn">Withdrawn</span>`
        : s.isNew
        ? `<span class="status-chip status-new">Unopened (New)</span>`
        : `<span class="status-chip status-viewed">Viewed by Clinic</span>`;

      tr.innerHTML = `
        <td><strong>${escapeHTML(s.clinicName)}</strong></td>
        <td>${escapeHTML(s.patientName)}</td>
        <td style="font-family: var(--font-mono); font-size: 0.8rem;">${escapeHTML(s.accountNumber)}</td>
        <td>${escapeHTML(s.formattedDate)}</td>
        <td style="font-weight: 600; font-family: var(--font-mono);">$${s.balanceDue.toFixed(2)}</td>
        <td>${statusBadge}</td>
        <td><span class="badge badge-neutral">${s.remarks.length} remark${s.remarks.length !== 1 ? 's' : ''}</span></td>
        <td style="text-align: right;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.openStatementDetail('${s.id}')">
            Inspect & Audit
          </button>
        </td>
      `;
      elements.tableAdminTrackerBody.appendChild(tr);
    });
  }

  function renderAdminClinicsDirectory() {
    elements.tableAdminClinicsBody.innerHTML = '';
    state.clinics.forEach(c => {
      const count = state.statements.filter(s => s.clinicId === c.id && !s.withdrawn).length;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHTML(c.name)}</strong></td>
        <td style="font-family: var(--font-mono);">${escapeHTML(c.id)}</td>
        <td>${escapeHTML(c.contact)}</td>
        <td><span class="badge-role badge-role-specialist">${escapeHTML(c.specialist)}</span></td>
        <td style="font-weight: 600;">${count} statements</td>
        <td><span class="badge badge-neutral" style="color: var(--color-success);">● ${c.status}</span></td>
        <td style="text-align: right;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.viewClinicStatements('${c.id}')">
            Statements
          </button>
        </td>
      `;
      elements.tableAdminClinicsBody.appendChild(tr);
    });
  }

  function renderAdminUsersDirectory() {
    elements.tableAdminUsersBody.innerHTML = '';
    USERS_DIRECTORY.forEach(u => {
      const roleBadge = u.role.includes('Clinic') ? 'badge-role-clinic' :
        u.role.includes('Specialist') ? 'badge-role-specialist' : 'badge-role-admin';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHTML(u.name)}</strong></td>
        <td style="font-family: var(--font-mono); font-size: 0.8rem;">${escapeHTML(u.email)}</td>
        <td><span class="badge-role ${roleBadge}">${escapeHTML(u.role)}</span></td>
        <td>${escapeHTML(u.clinic)}</td>
        <td><span class="badge badge-neutral" style="color: var(--color-success);">● ${u.status}</span></td>
        <td style="font-size: 0.76rem; color: var(--color-text-subtle);">${escapeHTML(u.lastLogin)}</td>
      `;
      elements.tableAdminUsersBody.appendChild(tr);
    });
  }

  function renderAdminAuditTrail() {
    elements.tableAdminAuditBody.innerHTML = '';
    state.auditLog.forEach(row => {
      const tr = document.createElement('tr');
      const badgeRoleClass = row.role.includes('Clinic') ? 'badge-role-clinic' :
        row.role.includes('Specialist') ? 'badge-role-specialist' : 'badge-role-admin';

      tr.innerHTML = `
        <td style="color: var(--color-text-muted);">${escapeHTML(row.timestamp)}</td>
        <td><strong>${escapeHTML(row.actor)}</strong></td>
        <td><span class="badge-role ${badgeRoleClass}">${escapeHTML(row.role)}</span></td>
        <td>${escapeHTML(row.clinic)}</td>
        <td><span class="badge badge-neutral">${escapeHTML(row.action)}</span></td>
        <td>${escapeHTML(row.target)}</td>
        <td style="color: var(--color-text-subtle);">${escapeHTML(row.ip)}</td>
        <td><span class="badge badge-neutral" style="color: var(--color-success); font-weight: 700;">${escapeHTML(row.outcome)}</span></td>
      `;
      elements.tableAdminAuditBody.appendChild(tr);
    });
  }

  function setAdminTab(tabKey) {
    state.adminActiveTab = tabKey;
    const tabs = [elements.tabAdminStatusTracker, elements.tabAdminClinics, elements.tabAdminUsers, elements.tabAdminAudit];
    const panels = [elements.panelAdminStatusTracker, elements.panelAdminClinics, elements.panelAdminUsers, elements.panelAdminAudit];

    tabs.forEach(t => { if (t) t.classList.remove('active'); });
    panels.forEach(p => { if (p) p.style.display = 'none'; });

    if (tabKey === 'status-tracker') {
      elements.tabAdminStatusTracker.classList.add('active');
      elements.panelAdminStatusTracker.style.display = 'block';
    } else if (tabKey === 'clinics') {
      elements.tabAdminClinics.classList.add('active');
      elements.panelAdminClinics.style.display = 'block';
    } else if (tabKey === 'users') {
      elements.tabAdminUsers.classList.add('active');
      elements.panelAdminUsers.style.display = 'block';
    } else if (tabKey === 'audit') {
      elements.tabAdminAudit.classList.add('active');
      elements.panelAdminAudit.style.display = 'block';
    }
  }

  // ==========================================================================
  // 11. PATIENT STATEMENTS LIST (P1)
  // ==========================================================================
  function renderStatementsList() {
    let filtered = state.statements.slice();

    // Role-based Isolation (FR-4): Clinic User ONLY sees their clinic!
    if (state.user && state.user.role === 'clinic_user') {
      filtered = filtered.filter(s => s.clinicId === state.user.clinicId);
      elements.statementsClinicName.textContent = state.user.clinicName;
      elements.specialistClinicPickerContainer.style.display = 'none';
      elements.btnQuickUploadStatement.style.display = 'none';
    } else {
      // Specialist or Admin can pick which clinic they are viewing
      elements.specialistClinicPickerContainer.style.display = 'block';
      elements.selectViewClinic.value = state.selectedClinicFilter;
      elements.btnQuickUploadStatement.style.display = state.user && state.user.role === 'specialist' ? 'inline-flex' : 'none';

      filtered = filtered.filter(s => s.clinicId === state.selectedClinicFilter);
      const matchedClinic = state.clinics.find(c => c.id === state.selectedClinicFilter);
      elements.statementsClinicName.textContent = matchedClinic ? matchedClinic.name : 'Client Clinic';
    }

    // Exclude withdrawn from general clinic view
    filtered = filtered.filter(s => !s.withdrawn);

    // Apply Search
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      filtered = filtered.filter(s =>
        s.patientName.toLowerCase().includes(q) ||
        s.accountNumber.toLowerCase().includes(q)
      );
    }

    // Apply Date Filter
    if (state.dateFilter) {
      filtered = filtered.filter(s => s.statementDate === state.dateFilter);
    }

    // Apply Status Filter
    if (state.statusFilter === 'new') {
      filtered = filtered.filter(s => s.isNew);
    } else if (state.statusFilter === 'open') {
      filtered = filtered.filter(s => s.balanceDue > 0);
    } else if (state.statusFilter === 'paid') {
      filtered = filtered.filter(s => s.balanceDue <= 0);
    }

    // Apply Sorting
    filtered.sort((a, b) => {
      switch (state.sortOrder) {
        case 'date-desc': return new Date(b.statementDate) - new Date(a.statementDate);
        case 'date-asc': return new Date(a.statementDate) - new Date(b.statementDate);
        case 'name-asc': return a.patientName.localeCompare(b.patientName);
        case 'name-desc': return b.patientName.localeCompare(a.patientName);
        case 'balance-desc': return b.balanceDue - a.balanceDue;
        case 'balance-asc': return a.balanceDue - b.balanceDue;
        default: return 0;
      }
    });

    // Update Counter & Controls
    elements.resultsCountText.innerHTML = `Showing <strong>${filtered.length}</strong> statement${filtered.length !== 1 ? 's' : ''}`;
    const hasActiveFilters = Boolean(state.searchQuery || state.dateFilter || state.statusFilter !== 'all');
    elements.btnClearFilters.style.display = hasActiveFilters ? 'inline-block' : 'none';

    // Render Table Rows
    elements.statementsTableBody.innerHTML = '';
    if (filtered.length === 0) {
      elements.statementsTableContainer.style.display = 'none';
      elements.statementsEmptyState.style.display = 'block';
      return;
    }

    elements.statementsTableContainer.style.display = 'block';
    elements.statementsEmptyState.style.display = 'none';

    filtered.forEach(item => {
      const tr = document.createElement('tr');
      tr.className = item.isNew ? 'unread-row' : '';
      tr.setAttribute('data-id', item.id);

      const statusBadge = item.balanceDue <= 0
        ? `<span class="badge badge-neutral" style="color: var(--color-success);">Paid / Zero</span>`
        : `<span class="badge badge-neutral" style="color: var(--color-warning);">Balance Due</span>`;

      const newBadge = item.isNew
        ? `<span class="badge badge-highlight" style="margin-right: 8px;">New</span>`
        : '';

      tr.innerHTML = `
        <td class="col-patient-name">
          <div style="display: flex; align-items: center;">
            ${newBadge}
            <strong>${escapeHTML(item.patientName)}</strong>
          </div>
        </td>
        <td class="col-account"><span style="font-family: var(--font-mono);">${escapeHTML(item.accountNumber)}</span></td>
        <td class="col-date">${escapeHTML(item.formattedDate)}</td>
        <td class="col-balance" style="text-align: right; font-weight: 600; font-family: var(--font-mono);">$${item.balanceDue.toFixed(2)}</td>
        <td class="col-status" style="text-align: center;">${statusBadge}</td>
        <td class="col-action" style="text-align: right;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.openStatementDetail('${item.id}')">
            View Statement
          </button>
        </td>
      `;

      tr.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          window.openStatementDetail(item.id);
        }
      });

      elements.statementsTableBody.appendChild(tr);
    });
  }

  function updateHomeNewBadge() {
    if (!state.user || state.user.role !== 'clinic_user') return;
    const newCount = state.statements.filter(s => s.clinicId === state.user.clinicId && s.isNew && !s.withdrawn).length;
    if (elements.homeNewBadge) {
      if (newCount > 0) {
        elements.homeNewBadge.textContent = `${newCount} New`;
        elements.homeNewBadge.style.display = 'inline-block';
      } else {
        elements.homeNewBadge.style.display = 'none';
      }
    }
  }

  // ==========================================================================
  // 12. STATEMENT DETAIL & REMARKS LEDGER (P2)
  // ==========================================================================
  window.openStatementDetail = function (statementId) {
    const stmt = state.statements.find(s => s.id === statementId);
    if (!stmt) return;

    state.currentStatementId = statementId;

    // Clear "New" badge for clinic users when opened
    if (stmt.isNew && state.user && state.user.role === 'clinic_user') {
      stmt.isNew = false;
      updateHomeNewBadge();
    }

    // Log HIPAA Statement View event
    logAuditEvent('statement.view', `Statement #${stmt.accountNumber} (${stmt.patientName})`, 'SUCCESS');

    // Populate Top Bar & Breadcrumbs
    elements.detailBreadcrumbPatient.textContent = stmt.patientName;
    elements.detailPatientNameHeading.textContent = stmt.patientName;
    elements.detailHeaderAccount.textContent = stmt.accountNumber;
    elements.detailHeaderDate.textContent = stmt.formattedDate;
    elements.detailHeaderClinic.textContent = stmt.clinicName;
    elements.detailNewPill.style.display = stmt.isNew ? 'inline-block' : 'none';

    // Role Indicator Pill in Breadcrumb
    elements.detailRoleIndicator.className = 'badge-role ' + (
      state.user && state.user.role === 'clinic_user' ? 'badge-role-clinic' :
      state.user && state.user.role === 'specialist' ? 'badge-role-specialist' : 'badge-role-admin'
    );
    elements.detailRoleIndicator.textContent = state.user ? state.user.displayRole : 'Viewer';

    // Show/Hide Withdraw button (Only Specialist or Admin can withdraw)
    const canWithdraw = state.user && (state.user.role === 'specialist' || state.user.role === 'admin') && !stmt.withdrawn;
    elements.btnWithdrawStatement.style.display = canWithdraw ? 'inline-flex' : 'none';

    // Populate Document Left Sheet
    elements.docClinicName.textContent = stmt.clinicName;
    elements.docStmtNumber.textContent = stmt.accountNumber.replace('ACC-', '2026-10-');
    elements.docStmtDate.textContent = stmt.formattedDate;
    elements.docPatientName.textContent = stmt.patientName;
    elements.docAccountNum.textContent = stmt.accountNumber;
    elements.docDob.textContent = stmt.patientDob;
    elements.docServiceDates.textContent = `${stmt.serviceDateFrom} - ${stmt.serviceDateTo}`;
    elements.docInsuranceName.textContent = stmt.insuranceName;

    // Populate Line Items
    elements.docLineItemsBody.innerHTML = '';
    stmt.lineItems.forEach(line => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td style="font-size: 0.8rem; color: var(--color-text-muted);">${escapeHTML(line.date)}</td>
        <td style="font-family: var(--font-mono); font-size: 0.8rem; font-weight: 500;">${escapeHTML(line.cpt)}</td>
        <td style="font-size: 0.86rem; color: var(--color-text);">${escapeHTML(line.desc)}</td>
        <td style="text-align: right; font-family: var(--font-mono);">$${line.billed.toFixed(2)}</td>
        <td style="text-align: right; font-family: var(--font-mono); font-weight: 600;">$${line.due.toFixed(2)}</td>
      `;
      elements.docLineItemsBody.appendChild(row);
    });

    // Populate Totals
    elements.docTotalBilled.textContent = `$${stmt.totalBilled.toFixed(2)}`;
    elements.docInsPaid.textContent = `-$${stmt.insurancePaid.toFixed(2)}`;
    elements.docAdjustments.textContent = `-$${stmt.adjustments.toFixed(2)}`;
    elements.docFinalBalance.textContent = `$${stmt.balanceDue.toFixed(2)}`;

    // Other statements
    elements.otherStatementsList.innerHTML = '';
    if (stmt.otherStatements && stmt.otherStatements.length > 0) {
      elements.otherStatementsContainer.style.display = 'block';
      stmt.otherStatements.forEach(oth => {
        const item = document.createElement('div');
        item.className = 'other-stmt-item';
        item.innerHTML = `
          <span>Statement Date: <strong>${escapeHTML(oth.date)}</strong></span>
          <span style="font-family: var(--font-mono); color: var(--color-text-muted);">${escapeHTML(oth.balance)}</span>
        `;
        elements.otherStatementsList.appendChild(item);
      });
    } else {
      elements.otherStatementsContainer.style.display = 'none';
    }

    // Role-specific Remark Options
    configureRemarkFormForRole();

    // Render Remarks Feed
    renderRemarksFeed(stmt);

    showView('view-detail');
  };

  function configureRemarkFormForRole() {
    if (!state.user) return;

    if (state.user.role === 'specialist') {
      elements.specialistRemarkTypeRow.style.display = 'block';
      elements.remarkPostingAuthor.textContent = `${state.user.name} (US24 Specialist)`;
      elements.insuranceExtraFields.style.display = 'none';
    } else if (state.user.role === 'admin') {
      elements.specialistRemarkTypeRow.style.display = 'none';
      elements.insuranceExtraFields.style.display = 'none';
      elements.remarkPostingAuthor.textContent = `${state.user.name} (System Administrator)`;
    } else {
      elements.specialistRemarkTypeRow.style.display = 'none';
      elements.insuranceExtraFields.style.display = 'none';
      elements.remarkPostingAuthor.textContent = `${state.user.name} (Clinic User)`;
    }

    elements.textareaRemark.value = '';
    elements.charCounter.textContent = '0 / 2,000';
  }

  function renderRemarksFeed(stmt) {
    elements.remarksFeed.innerHTML = '';
    elements.remarksCountTag.textContent = `${stmt.remarks.length} entr${stmt.remarks.length === 1 ? 'y' : 'ies'}`;

    if (stmt.remarks.length === 0) {
      elements.remarksFeed.innerHTML = `
        <div style="text-align: center; color: var(--color-text-subtle); padding: 20px 0; font-size: 0.85rem;">
          No remarks recorded yet for this patient statement.
        </div>
      `;
      return;
    }

    stmt.remarks.forEach(rem => {
      const entry = document.createElement('div');
      const roleType = rem.type || 'clinic';
      const roleTagClass = roleType === 'specialist' ? 'tag-specialist' :
        roleType === 'insurance' ? 'tag-insurance' : 'tag-clinic';

      entry.className = `remark-entry ${roleType}-remark`;

      let metaExtra = '';
      if (roleType === 'insurance') {
        metaExtra = `<span class="insurance-claim-pill">Payer: <strong>${escapeHTML(rem.companyName || 'Insurance')}</strong> &bull; Ref: ${escapeHTML(rem.refNumber || 'N/A')}</span>`;
      }

      entry.innerHTML = `
        <div class="remark-meta">
          <div class="remark-author-group">
            <span class="remark-author-name">${escapeHTML(rem.authorName)}</span>
            <span class="remark-role-tag ${roleTagClass}">${escapeHTML(rem.authorRole)}</span>
          </div>
          <span class="remark-timestamp">${escapeHTML(rem.timestamp)}</span>
        </div>
        ${metaExtra}
        <div class="remark-body-text">${escapeHTML(rem.body)}</div>
      `;
      elements.remarksFeed.appendChild(entry);
    });

    elements.remarksFeed.scrollTop = elements.remarksFeed.scrollHeight;
  }

  function handleAddRemarkSubmit(e) {
    if (e) e.preventDefault();
    if (!state.currentStatementId || !state.user) return;

    const stmt = state.statements.find(s => s.id === state.currentStatementId);
    if (!stmt) return;

    const bodyText = elements.textareaRemark.value.trim();
    if (!bodyText) return;

    const now = new Date();
    const timeStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ', ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) + ' CDT';

    let remType = 'clinic';
    let authorRole = 'Clinic User';
    let companyName = null;
    let refNumber = null;

    if (state.user.role === 'specialist') {
      const selectedTypeRadio = document.querySelector('input[name="remark-type-radio"]:checked');
      if (selectedTypeRadio && selectedTypeRadio.value === 'insurance') {
        remType = 'insurance';
        authorRole = 'Insurance';
        companyName = elements.inputInsCompany.value.trim() || 'Insurance Payer';
        refNumber = elements.inputInsClaim.value.trim() || 'CLM-' + Math.floor(10000 + Math.random() * 90000);
      } else {
        remType = 'specialist';
        authorRole = 'US24 Specialist';
      }
    } else if (state.user.role === 'admin') {
      remType = 'specialist';
      authorRole = 'US24 Operations';
    }

    const newRemark = {
      id: 'rem-' + Date.now(),
      authorName: state.user.name,
      authorRole: authorRole,
      type: remType,
      timestamp: timeStr,
      body: bodyText,
      companyName: companyName,
      refNumber: refNumber
    };

    stmt.remarks.push(newRemark);

    // Log HIPAA remark event
    logAuditEvent('remark.add', `Statement #${stmt.accountNumber} (${remType})`, 'SUCCESS');

    // Reset textarea
    elements.textareaRemark.value = '';
    elements.charCounter.textContent = '0 / 2,000';
    renderRemarksFeed(stmt);
    showToast('Remark posted successfully to ledger.');
  }

  // ==========================================================================
  // 13. SPECIALIST UPLOAD & BULK IMPORT HANDLERS
  // ==========================================================================
  function handleSingleUploadSubmit(e) {
    if (e) e.preventDefault();
    const clinicId = elements.uploadClinicSelect.value;
    const targetClinic = state.clinics.find(c => c.id === clinicId);
    const patientName = elements.uploadPatientName.value.trim();
    const accountNum = elements.uploadAccountNum.value.trim();
    const dob = elements.uploadDob.value.trim();
    const stmtDate = elements.uploadStmtDate.value;
    const balance = parseFloat(elements.uploadBalanceDue.value) || 0;
    const srvDates = elements.uploadServiceDates.value.trim();
    const ins = elements.uploadInsurance.value.trim() || 'Self Pay';
    const cptDesc = elements.uploadCptDesc.value.trim();

    const formattedDate = new Date(stmtDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    const newStmt = {
      id: 'stmt-' + Date.now(),
      clinicId: clinicId,
      clinicName: targetClinic ? targetClinic.name : 'Client Practice',
      patientName: patientName,
      accountNumber: accountNum,
      statementDate: stmtDate,
      formattedDate: formattedDate,
      balanceDue: balance,
      isNew: true,
      withdrawn: false,
      patientDob: dob,
      serviceDateFrom: srvDates.split('-')[0].trim() || srvDates,
      serviceDateTo: srvDates.split('-')[1] ? srvDates.split('-')[1].trim() : srvDates,
      insuranceName: ins,
      totalBilled: balance + 150.00,
      insurancePaid: 150.00,
      adjustments: 0.00,
      publishedBy: `${state.user.name}, US24 Specialist`,
      publishedAt: `${formattedDate} 12:00 PM CDT`,
      lineItems: [
        { date: srvDates.split('-')[0].trim() || srvDates, cpt: '99214', desc: cptDesc, billed: balance + 150.00, due: balance }
      ],
      remarks: [
        {
          id: 'rem-' + Date.now(),
          authorName: state.user.name,
          authorRole: 'US24 Specialist',
          type: 'specialist',
          timestamp: formattedDate + ', 12:00 PM CDT',
          body: 'Statement published for clinic review following clinical charge entry adjudication.'
        }
      ],
      otherStatements: []
    };

    state.statements.unshift(newStmt);

    // Record upload batch item
    state.recentUploads.unshift({
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      clinic: targetClinic ? targetClinic.name : 'Practice',
      type: 'Single PDF Upload',
      desc: `${patientName} (${accountNum})`,
      count: 1,
      status: 'Published'
    });

    logAuditEvent('statement.upload', `Published single statement #${accountNum} (${patientName}) to ${newStmt.clinicName}`, 'SUCCESS');

    closeModal('modal-upload-statement');
    elements.formUploadStatement.reset();
    showToast(`Statement published to ${newStmt.clinicName} successfully.`);

    if (state.user && state.user.role === 'specialist') {
      renderSpecialistDashboard();
    }
  }

  function handleBulkImportExecute() {
    const clinicId = elements.importClinicSelect.value;
    const targetClinic = state.clinics.find(c => c.id === clinicId);
    const clinicName = targetClinic ? targetClinic.name : 'Client Practice';

    const batch = [
      {
        id: 'stmt-batch-1-' + Date.now(),
        clinicId: clinicId,
        clinicName: clinicName,
        patientName: 'Julian Vance',
        accountNumber: 'ACC-0091823',
        statementDate: todayISO,
        formattedDate: 'Oct 21, 2026',
        balanceDue: 310.00,
        isNew: true,
        withdrawn: false,
        patientDob: '03/12/1982',
        serviceDateFrom: '10/12/2026',
        serviceDateTo: '10/12/2026',
        insuranceName: 'Aetna Health',
        totalBilled: 550.00,
        insurancePaid: 200.00,
        adjustments: 40.00,
        lineItems: [{ date: '10/12/2026', cpt: '99214', desc: 'Outpatient Evaluation', billed: 550.00, due: 310.00 }],
        remarks: []
      },
      {
        id: 'stmt-batch-2-' + Date.now(),
        clinicId: clinicId,
        clinicName: clinicName,
        patientName: 'Natalie Cole',
        accountNumber: 'ACC-0091824',
        statementDate: todayISO,
        formattedDate: 'Oct 21, 2026',
        balanceDue: 185.50,
        isNew: true,
        withdrawn: false,
        patientDob: '06/25/1991',
        serviceDateFrom: '10/14/2026',
        serviceDateTo: '10/14/2026',
        insuranceName: 'UnitedHealthcare',
        totalBilled: 380.00,
        insurancePaid: 150.00,
        adjustments: 44.50,
        lineItems: [{ date: '10/14/2026', cpt: '99213', desc: 'Outpatient Visit', billed: 380.00, due: 185.50 }],
        remarks: []
      },
      {
        id: 'stmt-batch-3-' + Date.now(),
        clinicId: clinicId,
        clinicName: clinicName,
        patientName: 'Carlos Delgado',
        accountNumber: 'ACC-0091825',
        statementDate: todayISO,
        formattedDate: 'Oct 21, 2026',
        balanceDue: 425.00,
        isNew: true,
        withdrawn: false,
        patientDob: '09/04/1975',
        serviceDateFrom: '10/15/2026',
        serviceDateTo: '10/15/2026',
        insuranceName: 'Blue Cross Blue Shield',
        totalBilled: 780.00,
        insurancePaid: 300.00,
        adjustments: 55.00,
        lineItems: [{ date: '10/15/2026', cpt: '99215', desc: 'High Complexity Outpatient Exam', billed: 780.00, due: 425.00 }],
        remarks: []
      }
    ];

    batch.forEach(item => state.statements.unshift(item));

    state.recentUploads.unshift({
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      clinic: clinicName,
      type: 'Bulk Import',
      desc: `Cycle Batch #${clinicId}-OCT21`,
      count: 3,
      status: 'Published'
    });

    logAuditEvent('statement.import', `Imported batch of 3 statements to ${clinicName}`, 'SUCCESS');

    closeModal('modal-import-statements');
    showToast(`Successfully published 3 statements to ${clinicName}.`);

    if (state.user && state.user.role === 'specialist') {
      renderSpecialistDashboard();
    }
  }

  function handleWithdrawConfirm() {
    if (!state.currentStatementId) return;
    const stmt = state.statements.find(s => s.id === state.currentStatementId);
    if (!stmt) return;

    const reason = elements.textareaWithdrawReason.value.trim();
    if (!reason) {
      alert('Please provide a mandatory withdrawal reason for compliance tracking.');
      return;
    }

    stmt.withdrawn = true;
    stmt.remarks.push({
      id: 'rem-' + Date.now(),
      authorName: state.user.name,
      authorRole: state.user.displayRole,
      type: 'specialist',
      timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      body: `[STATEMENT WITHDRAWN]: ${reason}`
    });

    logAuditEvent('statement.withdraw', `Statement #${stmt.accountNumber} withdrawn: ${reason}`, 'SUCCESS');

    closeModal('modal-withdraw-statement');
    elements.textareaWithdrawReason.value = '';
    showToast(`Statement #${stmt.accountNumber} has been withdrawn.`);
    routeUserToPrimaryHome();
  }

  // ==========================================================================
  // 14. ADMIN ACTIONS: ADD CLINIC & INVITE USER
  // ==========================================================================
  function handleAddClinicSubmit(e) {
    if (e) e.preventDefault();
    const name = elements.newClinicName.value.trim();
    const id = elements.newClinicId.value.trim().toUpperCase();
    const contact = elements.newClinicContact.value.trim();
    const specialist = elements.newClinicSpecialist.value;

    if (!name || !id || !contact) return;

    const newClinic = {
      id: id,
      name: name,
      contact: contact,
      phone: '(312) 555-0900',
      address: 'Chicago, IL',
      specialist: specialist,
      status: 'Active',
      usersCount: 1
    };

    state.clinics.push(newClinic);
    logAuditEvent('clinic.create', `Created practice ${name} (${id})`, 'SUCCESS');

    closeModal('modal-add-clinic');
    elements.formAddClinic.reset();
    showToast(`Clinic "${name}" registered successfully.`);

    if (state.user && state.user.role === 'admin') {
      renderAdminDashboard();
    }
  }

  function handleInviteUserSubmit(e) {
    if (e) e.preventDefault();
    const name = elements.inviteUserName.value.trim();
    const email = elements.inviteUserEmail.value.trim().toLowerCase();
    const roleKey = elements.inviteUserRole.value;
    const clinic = elements.inviteUserClinic.value;

    if (!name || !email) return;

    const displayRole = roleKey === 'clinic_user' ? 'Clinic User' :
      roleKey === 'specialist' ? 'US24 Specialist' : 'Admin Level';

    USERS_DIRECTORY.push({
      name: name,
      email: email,
      role: displayRole,
      clinic: roleKey === 'clinic_user' ? clinic : 'US24 Operations',
      status: 'Invited',
      lastLogin: 'Never (Invited)'
    });

    logAuditEvent('user.invite', `Invited ${name} (${email}) as ${displayRole}`, 'SUCCESS');

    closeModal('modal-invite-user');
    elements.formInviteUser.reset();
    showToast(`Invitation sent to ${email}.`);

    if (state.user && state.user.role === 'admin') {
      renderAdminDashboard();
    }
  }

  // ==========================================================================
  // 15. MODAL HELPERS & UTILITIES
  // ==========================================================================
  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  function showToast(msg) {
    if (!elements.toastBanner || !elements.toastMessage) return;
    elements.toastMessage.textContent = msg;
    elements.toastBanner.classList.add('show');
    setTimeout(() => {
      elements.toastBanner.classList.remove('show');
    }, 3800);
  }

  function maskEmail(email) {
    if (!email) return '••••••@us24solutions.com';
    const parts = email.split('@');
    if (parts.length < 2) return email;
    const name = parts[0];
    const domain = parts[1];
    return name[0] + '•••••••' + (name.length > 1 ? name[name.length - 1] : '') + '@' + domain;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Helper window functions for inline onclick handlers
  window.viewClinicStatements = function (clinicId) {
    state.selectedClinicFilter = clinicId;
    renderStatementsList();
    showView('view-statements');
  };

  window.openUploadForClinic = function (clinicId) {
    elements.uploadClinicSelect.value = clinicId;
    openModal('modal-upload-statement');
  };

  // ==========================================================================
  // 16. ATTACH EVENT LISTENERS
  // ==========================================================================
  function initEventListeners() {
    // Login Persona Tabs
    elements.tabPersonaClinic.addEventListener('click', () => selectLoginPersona('clinic_user'));
    elements.tabPersonaSpecialist.addEventListener('click', () => selectLoginPersona('specialist'));
    elements.tabPersonaAdmin.addEventListener('click', () => selectLoginPersona('admin'));

    // Instant One-Click Sign In Buttons
    elements.btnQuickClinic.addEventListener('click', () => {
      selectLoginPersona('clinic_user');
      handleLoginSubmit();
    });
    elements.btnQuickSpecialist.addEventListener('click', () => {
      selectLoginPersona('specialist');
      handleLoginSubmit();
    });
    elements.btnQuickAdmin.addEventListener('click', () => {
      selectLoginPersona('admin');
      handleLoginSubmit();
    });

    // Form Submissions
    elements.formLogin.addEventListener('submit', handleLoginSubmit);
    elements.formVerify.addEventListener('submit', handleVerifySubmit);
    elements.btnHeaderSignout.addEventListener('click', handleSignOut);

    // Password Toggle
    elements.btnTogglePassword.addEventListener('click', () => {
      const type = elements.inputPassword.getAttribute('type') === 'password' ? 'text' : 'password';
      elements.inputPassword.setAttribute('type', type);
      elements.btnTogglePassword.textContent = type === 'password' ? 'Show' : 'Hide';
    });

    // OTP Auto-Advance
    elements.otpInputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && index < elements.otpInputs.length - 1) {
          elements.otpInputs[index + 1].focus();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          elements.otpInputs[index - 1].focus();
        }
      });
    });

    elements.btnBackToLogin.addEventListener('click', () => showView('view-login'));
    elements.btnResendCode.addEventListener('click', () => {
      showToast('New 6-digit verification code sent.');
    });

    // Header Role Switcher & Quick Bar
    elements.btnHeaderSwitchRole.addEventListener('click', () => openModal('modal-switch-persona'));
    elements.btnCloseSwitchModal.addEventListener('click', () => closeModal('modal-switch-persona'));
    elements.btnModalSwitchClinic.addEventListener('click', () => handleDirectRoleSwitch('clinic_user'));
    elements.btnModalSwitchSpecialist.addEventListener('click', () => handleDirectRoleSwitch('specialist'));
    elements.btnModalSwitchAdmin.addEventListener('click', () => handleDirectRoleSwitch('admin'));

    elements.quickSwitchClinic.addEventListener('click', () => handleDirectRoleSwitch('clinic_user'));
    elements.quickSwitchSpecialist.addEventListener('click', () => handleDirectRoleSwitch('specialist'));
    elements.quickSwitchAdmin.addEventListener('click', () => handleDirectRoleSwitch('admin'));

    // Logo click goes to role primary home
    elements.brandHomeLink.addEventListener('click', routeUserToPrimaryHome);

    // Clinic Home (C1)
    elements.cardPatientStatements.addEventListener('click', () => {
      state.selectedClinicFilter = state.user ? state.user.clinicId : 'CLN-4082';
      renderStatementsList();
      showView('view-statements');
    });

    // Specialist Dashboard Actions
    elements.btnSpecUploadModal.addEventListener('click', () => openModal('modal-upload-statement'));
    elements.btnCloseUploadModal.addEventListener('click', () => closeModal('modal-upload-statement'));
    elements.btnCancelUpload.addEventListener('click', () => closeModal('modal-upload-statement'));
    elements.formUploadStatement.addEventListener('submit', handleSingleUploadSubmit);

    elements.btnSpecImportModal.addEventListener('click', () => openModal('modal-import-statements'));
    elements.btnCloseImportModal.addEventListener('click', () => closeModal('modal-import-statements'));
    elements.btnCancelImport.addEventListener('click', () => closeModal('modal-import-statements'));
    elements.btnExecuteImport.addEventListener('click', handleBulkImportExecute);

    // Admin Dashboard Actions
    elements.tabAdminStatusTracker.addEventListener('click', () => setAdminTab('status-tracker'));
    elements.tabAdminClinics.addEventListener('click', () => setAdminTab('clinics'));
    elements.tabAdminUsers.addEventListener('click', () => setAdminTab('users'));
    elements.tabAdminAudit.addEventListener('click', () => setAdminTab('audit'));

    elements.adminSearchStatement.addEventListener('input', (e) => {
      state.adminSearch = e.target.value.trim();
      renderAdminStatusTracker();
    });
    elements.adminFilterClinic.addEventListener('change', (e) => {
      state.adminClinicFilter = e.target.value;
      renderAdminStatusTracker();
    });
    elements.adminFilterStatus.addEventListener('change', (e) => {
      state.adminStatusFilter = e.target.value;
      renderAdminStatusTracker();
    });

    elements.btnExportAuditCsv.addEventListener('click', exportAuditLogCSV);

    elements.btnAdminAddClinicModal.addEventListener('click', () => openModal('modal-add-clinic'));
    elements.btnCloseClinicModal.addEventListener('click', () => closeModal('modal-add-clinic'));
    elements.btnCancelAddClinic.addEventListener('click', () => closeModal('modal-add-clinic'));
    elements.formAddClinic.addEventListener('submit', handleAddClinicSubmit);

    elements.btnAdminInviteModal.addEventListener('click', () => openModal('modal-invite-user'));
    elements.btnCloseInviteModal.addEventListener('click', () => closeModal('modal-invite-user'));
    elements.btnCancelInvite.addEventListener('click', () => closeModal('modal-invite-user'));
    elements.formInviteUser.addEventListener('submit', handleInviteUserSubmit);

    // Statement List Filters
    elements.breadcrumbHome.addEventListener('click', routeUserToPrimaryHome);
    elements.selectViewClinic.addEventListener('change', (e) => {
      state.selectedClinicFilter = e.target.value;
      renderStatementsList();
    });
    elements.btnQuickUploadStatement.addEventListener('click', () => openModal('modal-upload-statement'));

    elements.filterSearchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      renderStatementsList();
    });
    elements.filterDateInput.addEventListener('change', (e) => {
      state.dateFilter = e.target.value;
      renderStatementsList();
    });
    elements.filterStatusSelect.addEventListener('change', (e) => {
      state.statusFilter = e.target.value;
      renderStatementsList();
    });
    elements.sortStatementsSelect.addEventListener('change', (e) => {
      state.sortOrder = e.target.value;
      renderStatementsList();
    });
    elements.btnClearFilters.addEventListener('click', () => {
      elements.filterSearchInput.value = '';
      elements.filterDateInput.value = '';
      elements.filterStatusSelect.value = 'all';
      state.searchQuery = '';
      state.dateFilter = '';
      state.statusFilter = 'all';
      renderStatementsList();
    });
    elements.btnEmptyClear.addEventListener('click', () => {
      elements.filterSearchInput.value = '';
      state.searchQuery = '';
      renderStatementsList();
    });

    // Statement Detail Back & Actions
    elements.detailBreadcrumbBack.addEventListener('click', () => {
      renderStatementsList();
      showView('view-statements');
    });

    elements.btnPrintStatement.addEventListener('click', () => {
      elements.printTimestamp.textContent = new Date().toLocaleString();
      logAuditEvent('statement.print', `Statement #${elements.docAccountNum.textContent}`, 'SUCCESS');
      window.print();
    });

    elements.btnDownloadStatement.addEventListener('click', () => {
      logAuditEvent('statement.download', `Statement #${elements.docAccountNum.textContent} (PDF)`, 'SUCCESS');
      showToast('Downloading statement PDF (AES-256 Encrypted)...');
    });

    // Statement Withdrawal (Specialist / Admin)
    elements.btnWithdrawStatement.addEventListener('click', () => {
      elements.withdrawPatientName.textContent = elements.docPatientName.textContent;
      openModal('modal-withdraw-statement');
    });
    elements.btnCloseWithdrawModal.addEventListener('click', () => closeModal('modal-withdraw-statement'));
    elements.btnCancelWithdraw.addEventListener('click', () => closeModal('modal-withdraw-statement'));
    elements.btnConfirmWithdraw.addEventListener('click', handleWithdrawConfirm);

    // Remarks
    elements.textareaRemark.addEventListener('input', (e) => {
      const len = e.target.value.length;
      elements.charCounter.textContent = `${len.toLocaleString()} / 2,000`;
    });
    elements.formAddRemark.addEventListener('submit', handleAddRemarkSubmit);

    // Specialist Remark Radio toggle
    document.querySelectorAll('input[name="remark-type-radio"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        elements.insuranceExtraFields.style.display = e.target.value === 'insurance' ? 'block' : 'none';
      });
    });

    // Inactivity Simulation (13 min warning)
    let idleTimer = setTimeout(() => {
      openModal('modal-timeout');
    }, 13 * 60 * 1000);

    const btnStay = document.getElementById('btn-timeout-extend');
    if (btnStay) {
      btnStay.addEventListener('click', () => {
        closeModal('modal-timeout');
        showToast('Your session has been extended for 15 minutes.');
      });
    }
    const btnSignoutModal = document.getElementById('btn-timeout-signout');
    if (btnSignoutModal) {
      btnSignoutModal.addEventListener('click', () => {
        closeModal('modal-timeout');
        handleSignOut();
      });
    }
  }

  // ==========================================================================
  // 17. INITIALIZATION
  // ==========================================================================
  document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    selectLoginPersona('clinic_user');
    showView('view-login');
  });

})();
