import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { RemarksLedger } from '../../components/RemarksLedger.jsx';
import { StatementDocument } from '../../components/StatementDocument.jsx';
import { Alert, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { NotFoundPage } from '../NotFoundPage.jsx';

// P3 – Print view. The print request is recorded before the print dialog opens (FR-12.3).
export function StatementPrintPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const includeRemarks = params.get('remarks') === '1';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const printed = useRef(false);

  useEffect(() => {
    let ignore = false;
    Promise.all([api(`/statements/${id}`), api(`/statements/${id}/print`, { method: 'POST', body: { includeRemarks } })])
      .then(([d]) => !ignore && setData(d))
      .catch((err) => !ignore && setError(err));
    return () => {
      ignore = true;
    };
  }, [id, includeRemarks]);

  useEffect(() => {
    if (data && !printed.current) {
      printed.current = true;
      setTimeout(() => window.print(), 300);
    }
  }, [data]);

  if (error?.status === 404) return <NotFoundPage />;
  if (error) return <div className="container"><Alert tone="error">{error.message}</Alert></div>;
  if (!data) return <div className="container"><Spinner label="Preparing printout…" /></div>;

  return (
    <div className="container print-view">
      <div className="print-toolbar no-print">
        <Link to={`/statements/${id}`} className="btn btn-secondary">Close</Link>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print again</button>
      </div>
      <div className="statement-document-card print-sheet">
        {data.statement.source === 'pdf_upload' && (
          <p className="print-note">Original PDF: use Download PDF to print the uploaded document.</p>
        )}
        <StatementDocument statement={data.statement} clinic={data.clinic} />
      </div>
      {includeRemarks && <RemarksLedger statementId={id} remarks={data.remarks} printMode role={user.role} />}
      <p className="print-page-footer">
        Printed by {user.fullName} on {new Date().toLocaleString('en-US', { timeZoneName: 'short' })} · Confidential: contains protected health information.
      </p>
    </div>
  );
}
