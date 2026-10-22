import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { IconArrowRight, IconBuilding, IconChevronDown, IconSearch } from './Icons.jsx';

/**
 * ClinicsDropdown - Action tab/dropdown for US24 Specialist view
 * Positioned to the left of "Upload statement" in the specialist dashboard.
 * Displays all assigned clinics in a sleek dropdown list, allowing one-tap
 * navigation to that clinic's specific statement portal (/clinics/:clinicId/statements).
 */
export function ClinicsDropdown({ clinics = [], currentClinicId = null, className = '' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const searchInputRef = useRef(null);
  const menuId = useId();

  // Close on click outside or Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input when menu opens (if more than 3 clinics)
  useEffect(() => {
    if (isOpen && clinics.length > 3) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen, clinics.length]);

  const query = search.trim().toLowerCase();
  const filteredClinics = query
    ? clinics.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          (c.code && c.code.toLowerCase().includes(query)),
      )
    : clinics;

  const totalCount = clinics.length;

  return (
    <div className={`clinics-dropdown-wrap ${className}`} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        id="btn-clinics-action-tab"
        className={`btn btn-secondary clinics-action-tab ${isOpen ? 'active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (isOpen) setSearch('');
        }}
        title="View assigned clinics and jump to a clinic portal"
      >
        <IconBuilding size={16} />
        <span>Clinics</span>
        {totalCount > 0 && <span className="clinics-tab-count">{totalCount}</span>}
        <IconChevronDown size={14} className={`clinics-chevron ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div
          id={menuId}
          className="clinics-dropdown-menu"
          role="menu"
          aria-labelledby="btn-clinics-action-tab"
        >
          <div className="clinics-menu-header">
            <div className="clinics-menu-header-text">
              <span className="clinics-menu-title">
                <IconBuilding size={15} /> Clinic Portals
              </span>
              <span className="clinics-menu-subtitle">
                Select a clinic to open its patient statement ledger
              </span>
            </div>
            <span className="badge badge-neutral">{totalCount} assigned</span>
          </div>

          {clinics.length > 3 && (
            <div className="clinics-menu-search">
              <IconSearch size={14} className="clinics-search-icon" />
              <input
                ref={searchInputRef}
                type="search"
                className="form-input clinics-search-input"
                placeholder="Search by clinic name or code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Filter clinics"
              />
            </div>
          )}

          <div className="clinics-menu-list" role="presentation">
            {totalCount === 0 ? (
              <div className="clinics-menu-empty">
                <p>No clinics assigned yet.</p>
                <small>Contact your administrator to be assigned to clinic portals.</small>
              </div>
            ) : filteredClinics.length === 0 ? (
              <div className="clinics-menu-empty">
                <p>No clinics match "{search}".</p>
                <button
                  type="button"
                  className="btn btn-tertiary btn-sm"
                  onClick={() => setSearch('')}
                >
                  Clear search
                </button>
              </div>
            ) : (
              filteredClinics.map((c) => {
                const isCurrent = currentClinicId && currentClinicId === c.id;
                return (
                  <Link
                    key={c.id}
                    to={`/clinics/${c.id}/statements`}
                    role="menuitem"
                    className={`clinics-menu-item ${!c.isActive ? 'inactive' : ''} ${isCurrent ? 'current' : ''}`}
                    onClick={() => {
                      setIsOpen(false);
                      setSearch('');
                    }}
                  >
                    <div className="clinics-item-main">
                      <div className="clinics-item-title-row">
                        <strong className="clinics-item-name">{c.name}</strong>
                        {c.code && <span className="user-clinic-badge">{c.code}</span>}
                      </div>

                      <div className="clinics-item-meta-row">
                        <span className="clinic-meta-pill">
                          {c.statementCount ?? 0}{' '}
                          {c.statementCount === 1 ? 'statement' : 'statements'}
                        </span>
                        {c.unopenedCount > 0 && (
                          <span className="clinic-meta-pill pill-unopened">
                            {c.unopenedCount} unopened
                          </span>
                        )}
                        {c.awaitingCount > 0 && (
                          <span className="clinic-meta-pill pill-awaiting">
                            {c.awaitingCount} awaiting
                          </span>
                        )}
                        {!c.isActive && (
                          <span className="clinic-meta-pill pill-inactive">Deactivated</span>
                        )}
                      </div>
                    </div>

                    <div className="clinics-item-action" aria-hidden="true">
                      <span className="portal-hint">Portal</span>
                      <IconArrowRight size={14} />
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
