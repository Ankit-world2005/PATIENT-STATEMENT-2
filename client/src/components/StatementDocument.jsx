import { date, money } from '../lib/format.js';

function formatCycleDate(val) {
  if (!val) return '—';
  if (val instanceof Date) {
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    const y = val.getUTCFullYear();
    return `${m}/${d}/${y}`;
  }
  const s = String(val).slice(0, 10);
  const parts = s.split('-');
  if (parts.length === 3) {
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
  }
  return s;
}

function formatPayment(val) {
  if (val === null || val === undefined || val === '') return '—';
  const s = String(val).trim();
  if (s.toLowerCase().includes('paid')) return s;
  const n = Number(s.replace(/[$,]/g, ''));
  if (Number.isNaN(n) || n <= 0) return '$0.00';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PrBadge({ type }) {
  const val = type || 'Copay';
  const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return <span className={`badge-pr pr-${slug}`}>{val}</span>;
}

function LedgerStatusBadge({ status }) {
  const val = status || 'Active';
  const slug = val.toLowerCase().replace(/[^a-z0-9]/g, '-');
  return <span className={`badge-ledger-status status-${slug}`}>{val}</span>;
}

/**
 * Standard statement document layout (FR-7.8, P2, P3).
 * Renders all 17 multi-cycle patient status and billing ledger columns:
 * Location, Patient Name, 1st/2nd/3rd Cycle Dates, Balances & Payments,
 * Current Balance, PR Type, Status, US24 Notes, Client Response, and VOB Notes.
 */
export function StatementDocument({ statement: s, clinic: c }) {
  const hasFinancials = s.billedAmount != null || s.insurancePaid != null || s.adjustments != null;
  const locationDisplay = s.locationName || s.location_name || c.name;
  const currentBal = s.currentBalance ?? s.balanceDue;

  return (
    <div className="statement-sheet">
      {/* Top Letterhead */}
      <div className="doc-letterhead">
        <div className="doc-clinic-info">
          <h3>{c.name}</h3>
          <p>{[c.addressLine1, c.addressLine2].filter(Boolean).join(', ')}</p>
          <p>{c.city}, {c.state} {c.postalCode} · {c.phone}</p>
          <p className="doc-admin-line">Billing administered by US24 Solutions</p>
        </div>
        <div className="doc-statement-badge">
          <div className="doc-badge-title">Patient statement</div>
          <div className="doc-badge-date">Date: {date(s.uploadedAt || s.uploaded_at || s.statementDate)}</div>
          <div style={{ marginTop: 4 }}>
            <LedgerStatusBadge status={s.ledgerStatus || s.status} />
          </div>
          {s.version > 1 && <div className="doc-badge-date" style={{ marginTop: 2 }}>Version {s.version}</div>}
        </div>
      </div>

      {/* 1. Patient & Account Information (All Core Patient Columns) */}
      <dl className="doc-summary-grid">
        <div className="doc-meta-item">
          <dt>LOCATION</dt>
          <dd>{locationDisplay || '—'}</dd>
        </div>
        <div className="doc-meta-item">
          <dt>ACCT. #:</dt>
          <dd className="col-mono">{s.accountNumber || s.account_number || (s.id ? `ACC-${s.id.slice(0, 6).toUpperCase()}` : '—')}</dd>
        </div>
        <div className="doc-meta-item">
          <dt>PATIENT NAME</dt>
          <dd><strong>{s.patientName || s.patient_name || '—'}</strong></dd>
        </div>
        <div className="doc-meta-item">
          <dt>DOB</dt>
          <dd>{(s.patientDob || s.patient_dob) ? date(s.patientDob || s.patient_dob) : '—'}</dd>
        </div>
        <div className="doc-meta-item">
          <dt>INSURANCE NAME</dt>
          <dd>{s.insuranceName || s.insurance_name || 'Self-pay'}</dd>
        </div>
        <div className="doc-meta-item">
          <dt>PR TYPE</dt>
          <dd><PrBadge type={s.prType || s.pr_type} /></dd>
        </div>
        <div className="doc-meta-item">
          <dt>STATUS</dt>
          <dd><LedgerStatusBadge status={s.ledgerStatus || s.ledger_status || s.status} /></dd>
        </div>
        <div className="doc-meta-item">
          <dt>CURRENT BALANCE DUE</dt>
          <dd className="col-mono doc-current-balance-hero">{money(currentBal)}</dd>
        </div>
      </dl>

      {/* 2. Multi-Cycle Electronic Statement History & Payments Table */}
      <div className="doc-section-card">
        <div className="doc-section-header">
          <h4>Electronic Statement History & Cycle Balances</h4>
          <span>Multi-cycle billing ledger</span>
        </div>
        <div className="table-responsive">
          <table className="doc-cycle-table">
            <thead>
              <tr>
                <th scope="col">STATEMENT CYCLE</th>
                <th scope="col">STATEMENT DATE</th>
                <th scope="col" className="text-right">BALANCE DUE</th>
                <th scope="col" className="text-right">PAYMENT RECEIVED</th>
                <th scope="col" className="text-center">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {/* 1st Statement Cycle */}
              <tr>
                <td><strong>1ST STATEMENT DATE</strong></td>
                <td>{formatCycleDate(s.cycle1Date || s.statementDate)}</td>
                <td className="col-mono text-right">{money(s.cycle1Balance ?? s.balanceDue)}</td>
                <td className="col-mono text-right text-success">{formatPayment(s.cycle1Payment)}</td>
                <td className="text-center"><span className="doc-cycle-badge">1st Statement</span></td>
              </tr>

              {/* 2nd Statement Cycle */}
              <tr>
                <td><strong>2ND  STATEMENT DATE</strong></td>
                <td>{formatCycleDate(s.cycle2Date)}</td>
                <td className="col-mono text-right">{s.cycle2Balance != null ? money(s.cycle2Balance) : '—'}</td>
                <td className="col-mono text-right text-success">{formatPayment(s.cycle2Payment)}</td>
                <td className="text-center"><span className="doc-cycle-badge">2nd Statement</span></td>
              </tr>

              {/* 3rd Statement Cycle */}
              <tr>
                <td><strong>3RD  STATEMENT DATE</strong></td>
                <td>{formatCycleDate(s.cycle3Date)}</td>
                <td className="col-mono text-right">{s.cycle3Balance != null ? money(s.cycle3Balance) : '—'}</td>
                <td className="col-mono text-right text-success">{formatPayment(s.cycle3Payment)}</td>
                <td className="text-center"><span className="doc-cycle-badge">3rd Statement</span></td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="2"><strong>CURRENT BALANCE DUE</strong></td>
                <td colSpan="3" className="col-mono doc-current-balance-hero text-right">
                  {money(currentBal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 3. Procedure CPT codes (if provided) */}
      {s.cptCodes && s.cptCodes.length > 0 && (
        <table className="doc-table">
          <caption className="sr-only">Procedure codes</caption>
          <thead>
            <tr><th scope="col">Procedure (CPT) codes</th></tr>
          </thead>
          <tbody>
            <tr>
              <td className="col-mono">{s.cptCodes.join('  ·  ')}</td>
            </tr>
          </tbody>
        </table>
      )}

      {/* 4. Traditional Financial Summary (if provided) */}
      {hasFinancials && (
        <div className="doc-totals-section">
          <dl className="doc-totals-box">
            <div className="totals-row"><dt>Total billed charges</dt><dd>{money(s.billedAmount)}</dd></div>
            <div className="totals-row">
              <dt>Insurance payments</dt>
              <dd className="text-success">{s.insurancePaid == null ? '—' : `-${money(s.insurancePaid)}`}</dd>
            </div>
            <div className="totals-row"><dt>Adjustments</dt><dd>{money(s.adjustments, { credit: false })}</dd></div>
            <div className="totals-row final"><dt>Patient balance due</dt><dd>{money(currentBal)}</dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}
