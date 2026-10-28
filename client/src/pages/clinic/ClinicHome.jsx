import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { IconChart, IconChat, IconDocument, IconWallet } from '../../components/Icons.jsx';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';

// C1 – Clinic Home: only three centered cards (N1, FR-3.2-3.4). Patient
// Statement comes first on every screen size (implementation plan C-5).
export function ClinicHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [homeData, setHomeData] = useState({ newCount: null, awaitingCount: 0 });
  const [cardTab, setCardTab] = useState('statements');

  useEffect(() => {
    api('/home').then((d) => setHomeData(d)).catch(() => {});
  }, []);

  const statementPath =
    user?.role === 'specialist'
      ? '/dashboard'
      : user?.role === 'admin'
        ? '/admin'
        : '/statements';

  return (
    <div className="container">
      <div className="hub-wrapper">
        <h1 className="sr-only">
          {user?.clinic ? `${user.clinic.name} portal home` : 'My Patient portal home'}
        </h1>
        <div className="three-cards-grid" role="list">
          <div className="hub-card hub-card-active hub-card-with-tabs" role="listitem">
            <div className="hub-card-tabs" role="tablist" aria-label="Patient Statement views">
              <button
                type="button"
                className={`hub-card-tab ${cardTab === 'statements' ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (cardTab === 'statements') {
                    navigate(statementPath);
                  } else {
                    setCardTab('statements');
                  }
                }}
                role="tab"
                aria-selected={cardTab === 'statements'}
                title="View Patient Statements"
              >
                <IconDocument size={13} />
                <span>Statements</span>
                {homeData.newCount > 0 && (
                  <span className="tab-pill-badge">{homeData.newCount}</span>
                )}
              </button>
              <button
                type="button"
                className={`hub-card-tab ${cardTab === 'requests' ? 'active' : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (cardTab === 'requests') {
                    navigate('/requests');
                  } else {
                    setCardTab('requests');
                  }
                }}
                role="tab"
                aria-selected={cardTab === 'requests'}
                title="Submit or view requests to US24 specialists"
              >
                <IconChat size={13} />
                <span>Request</span>
                {homeData.awaitingCount > 0 && (
                  <span className="tab-pill-badge plum">{homeData.awaitingCount}</span>
                )}
              </button>
            </div>

            {cardTab === 'statements' ? (
              <Link to={statementPath} className="hub-card-body-link">
                <div className="hub-card-icon-wrap"><IconDocument size={32} /></div>
                <h2 className="hub-card-title">Patient Statement</h2>
                <p className="hub-card-desc">View your patients' statements, their remark history, and download or print copies.</p>
                <div className="hub-card-tag">
                  {homeData.newCount > 0 ? (
                    <span className="badge badge-new">{homeData.newCount} new</span>
                  ) : (
                    <span className="badge badge-open">Open</span>
                  )}
                </div>
              </Link>
            ) : (
              <Link to="/requests" className="hub-card-body-link">
                <div className="hub-card-icon-wrap"><IconChat size={32} /></div>
                <h2 className="hub-card-title">Requests & Inquiries</h2>
                <p className="hub-card-desc">Submit requests, statement disputes, and billing questions to your US24 specialists.</p>
                <div className="hub-card-tag">
                  {homeData.awaitingCount > 0 ? (
                    <span className="badge badge-plum">{homeData.awaitingCount} awaiting</span>
                  ) : (
                    <span className="badge badge-open">Open</span>
                  )}
                </div>
              </Link>
            )}
          </div>

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
