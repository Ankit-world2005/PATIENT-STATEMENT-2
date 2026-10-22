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
          <div className="doc-badge-date">Date: {date(s.statementDate)}</div>
          <div className="doc-badge-date">Account: {s.accountNumber}</div>
          <div style={{ marginTop: 4 }}>
            <LedgerStatusBadge status={s.ledgerStatus || s.status} />
          </div>
          {s.version > 1 && <div className="doc-badge-date" style={{ marginTop: 2 }}>Version {s.version}</div>}
        </div>
      </div>

      {/* 1. Patient & Account Information (All Core Patient Columns) */}
      <dl className="doc-summary-grid">
        <div className="doc-meta-item">
          <dt>Patient Name</dt>
          <dd>{s.patientName}</dd>
        </div>
        <div className="doc-meta-item">
          <dt>Location</dt>
          <dd>{locationDisplay}</dd>
        </div>
        <div className="doc-meta-item">
          <dt>PR Type</dt>
          <dd><PrBadge type={s.prType} /></dd>
        </div>
        <div className="doc-meta-item">
          <dt>Status</dt>
          <dd><LedgerStatusBadge status={s.ledgerStatus || s.status} /></dd>
        </div>
        <div className="doc-meta-item">
          <dt>Date of birth</dt>
          <dd>{date(s.patientDob)}</dd>
        </div>
        <div className="doc-meta-item">
          <dt>Primary Insurance</dt>
          <dd>{s.insuranceName || 'Self-pay'}</dd>
        </div>
        <div className="doc-meta-item">
          <dt>Dates of service</dt>
          <dd>{s.serviceDateFrom ? `${date(s.serviceDateFrom)} – ${date(s.serviceDateTo)}` : '—'}</dd>
        </div>
        <div className="doc-meta-item">
          <dt>Current Outstanding Balance</dt>
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
                <th scope="col">Statement Cycle</th>
                <th scope="col">Sent Date</th>
                <th scope="col">Balance Due Amount</th>
                <th scope="col">Payment Received</th>
                <th scope="col">Cycle Tag</th>
              </tr>
            </thead>
            <tbody>
              {/* 1st Electronic Statement Cycle */}
              <tr>
                <td><strong>1st Electronic Statement</strong></td>
                <td>{formatCycleDate(s.cycle1Date || s.statementDate)}</td>
                <td className="col-mono">{money(s.cycle1Balance ?? s.balanceDue)}</td>
                <td className="col-mono text-success">{formatPayment(s.cycle1Payment)}</td>
                <td><span className="doc-cycle-badge">Cycle 1</span></td>
              </tr>

              {/* 2nd Electronic Statement Cycle */}
              <tr>
                <td><strong>2nd Electronic Statement</strong></td>
                <td>{formatCycleDate(s.cycle2Date)}</td>
                <td className="col-mono">{money(s.cycle2Balance)}</td>
                <td className="col-mono text-success">{formatPayment(s.cycle2Payment)}</td>
                <td><span className="doc-cycle-badge">Cycle 2</span></td>
              </tr>

              {/* 3rd Electronic Statement Cycle */}
              <tr>
                <td><strong>3rd Electronic Statement</strong></td>
                <td>{formatCycleDate(s.cycle3Date)}</td>
                <td className="col-mono">{money(s.cycle3Balance)}</td>
                <td className="col-mono text-success">{formatPayment(s.cycle3Payment)}</td>
                <td><span className="doc-cycle-badge">Cycle 3</span></td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="2"><strong>Current Outstanding Balance</strong></td>
                <td colSpan="3" className="col-mono doc-current-balance-hero">
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

      {/* 5. Statement Remarks & Ledger Notes Section */}
      <div className="doc-section-card">
        <div className="doc-section-header">
          <h4>Statement Remarks & Ledger Notes</h4>
          <span>Specialist Remarks, Client Response & VOB</span>
        </div>
        <div className="doc-remarks-grid">
          <div className="doc-remark-item remark-specialist">
            <div className="doc-remark-header">
              <span>US24 Specialist Remarks / Notes</span>
            </div>
            <p className="doc-remark-body">
              {s.remarks || s.us24Notes || 'No specialist remarks recorded.'}
            </p>
          </div>

          <div className="doc-remark-item remark-client">
            <div className="doc-remark-header">
              <span>Client Response</span>
            </div>
            <p className="doc-remark-body">
              {s.clientResponse || 'No client response recorded yet.'}
            </p>
          </div>

          <div className="doc-remark-item remark-vob">
            <div className="doc-remark-header">
              <span>AS PER VOB- Notes</span>
            </div>
            <p className="doc-remark-body">
              {s.vobNotes || 'No VOB notes recorded.'}
            </p>
          </div>
        </div>
      </div>

      {/* 6. Payment notice footer */}
      <div className="doc-patient-notes">
        <p>
          <strong>Payment notice:</strong> Please pay within 30 days of the statement date. For questions about this
          statement or your insurance coverage, contact {c.name} at {c.phone}.
        </p>
      </div>
    </div>
  );
}
