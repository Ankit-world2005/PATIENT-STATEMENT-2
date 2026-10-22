import { date, money } from '../lib/format.js';

/** Standard statement layout (FR-7.8). Also used for the printout (P3). */
export function StatementDocument({ statement: s, clinic: c }) {
  const hasFinancials = s.billedAmount != null || s.insurancePaid != null || s.adjustments != null;
  return (
    <div className="statement-sheet">
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
          {s.version > 1 && <div className="doc-badge-date">Version {s.version}</div>}
        </div>
      </div>

      <dl className="doc-summary-grid">
        <div className="doc-meta-item"><dt>Patient</dt><dd>{s.patientName}</dd></div>
        <div className="doc-meta-item"><dt>Date of birth</dt><dd>{date(s.patientDob)}</dd></div>
        <div className="doc-meta-item">
          <dt>Dates of service</dt>
          <dd>{s.serviceDateFrom ? `${date(s.serviceDateFrom)} – ${date(s.serviceDateTo)}` : '—'}</dd>
        </div>
        <div className="doc-meta-item"><dt>Insurance</dt><dd>{s.insuranceName || 'Self-pay'}</dd></div>
      </dl>

      <table className="doc-table">
        <caption className="sr-only">Procedure codes</caption>
        <thead>
          <tr><th scope="col">Procedure (CPT) codes</th></tr>
        </thead>
        <tbody>
          <tr>
            <td className="col-mono">{s.cptCodes.length ? s.cptCodes.join('  ·  ') : 'None listed'}</td>
          </tr>
        </tbody>
      </table>

      <div className="doc-totals-section">
        <dl className="doc-totals-box">
          {hasFinancials && (
            <>
              <div className="totals-row"><dt>Total billed charges</dt><dd>{money(s.billedAmount)}</dd></div>
              <div className="totals-row">
                <dt>Insurance payments</dt>
                <dd className="text-success">{s.insurancePaid == null ? '—' : `-${money(s.insurancePaid)}`}</dd>
              </div>
              <div className="totals-row"><dt>Adjustments</dt><dd>{money(s.adjustments, { credit: false })}</dd></div>
            </>
          )}
          <div className="totals-row final"><dt>Patient balance due</dt><dd>{money(s.balanceDue)}</dd></div>
        </dl>
      </div>

      {(s.remarks || s.us24Notes || s.clientResponse || s.vobNotes) && (
        <div className="doc-remarks-box" style={{ marginTop: '16px', padding: '12px 16px', background: 'var(--color-bg-subtle, #f8fafc)', borderRadius: '6px', border: '1px solid var(--color-border, #e2e8f0)' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-text-subtle)' }}>Statement Remarks & Ledger Notes</h4>
          {(s.remarks || s.us24Notes) && (
            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
              <strong>Specialist Remarks:</strong> {s.remarks || s.us24Notes}
            </p>
          )}
          {s.clientResponse && (
            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
              <strong>Client Response:</strong> {s.clientResponse}
            </p>
          )}
          {s.vobNotes && (
            <p style={{ margin: '4px 0', fontSize: '0.9rem' }}>
              <strong>AS PER VOB- Notes:</strong> {s.vobNotes}
            </p>
          )}
        </div>
      )}

      <div className="doc-patient-notes">
        <p>
          <strong>Payment notice:</strong> Please pay within 30 days of the statement date. For questions about this
          statement or your insurance coverage, contact {c.name} at {c.phone}.
        </p>
      </div>
    </div>
  );
}
