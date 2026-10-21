import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { IconChart, IconDocument, IconWallet } from '../../components/Icons.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';

// C1 – Clinic Home: only three centered cards (N1, FR-3.2-3.4). Patient
// Statement comes first on every screen size (implementation plan C-5).
export function ClinicHome() {
  const { user } = useAuth();
  const [newCount, setNewCount] = useState(null);

  useEffect(() => {
    api('/home').then((d) => setNewCount(d.newCount)).catch(() => {});
  }, []);

  return (
    <div className="container">
      <div className="hub-wrapper">
        <h1 className="sr-only">{user.clinic?.name} portal home</h1>
        <div className="three-cards-grid" role="list">
          <Link to="/statements" className="hub-card hub-card-active" role="listitem">
            <div className="hub-card-icon-wrap"><IconDocument size={32} /></div>
            <h2 className="hub-card-title">Patient Statement</h2>
            <p className="hub-card-desc">View your patients' statements, their remark history, and download or print copies.</p>
            <div className="hub-card-tag">
              {newCount > 0 ? (
                <span className="badge badge-new">{newCount} new</span>
              ) : (
                <span className="badge badge-open">Open</span>
              )}
            </div>
          </Link>

          <div className="hub-card hub-card-disabled" role="listitem" aria-disabled="true" aria-label="AR Report. Coming soon, unavailable.">
            <div className="hub-card-icon-wrap"><IconChart size={32} /></div>
            <h2 className="hub-card-title">AR Report</h2>
            <p className="hub-card-desc">Accounts receivable tracking and insurance aging.</p>
            <div className="hub-card-tag"><span className="badge badge-coming-soon">Coming soon</span></div>
          </div>

          <div className="hub-card hub-card-disabled" role="listitem" aria-disabled="true" aria-label="Clinic Collection. Coming soon, unavailable.">
            <div className="hub-card-icon-wrap"><IconWallet size={32} /></div>
            <h2 className="hub-card-title">Clinic Collection</h2>
            <p className="hub-card-desc">Patient payment collections and deposit reconciliation.</p>
            <div className="hub-card-tag"><span className="badge badge-coming-soon">Coming soon</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
