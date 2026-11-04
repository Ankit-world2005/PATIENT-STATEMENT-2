import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { IconBell, IconChat, IconCheck, IconClock, IconDocument, IconInbox } from './Icons.jsx';

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const storageKey = user ? `mypatient:read_notifs:${user.id}` : null;

  // Load read notification IDs from localStorage
  const [readIds, setReadIds] = useState(() => {
    if (!storageKey) return new Set();
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const loadNotifications = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const res = await api('/notifications?limit=20', { skipActivity: true });
      setNotifications(res?.notifications || []);
    } catch (err) {
      if (err?.status === 401 || err?.status === 403) return;
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadNotifications();

    // Refresh notifications every 60 seconds only while page is active
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadNotifications();
      }
    }, 60000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadNotifications();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user?.id]);

  // Handle click outside to close popover
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const markAllAsRead = () => {
    const next = new Set([...readIds, ...notifications.map((n) => n.id)]);
    setReadIds(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {
        /* storage full or unavailable */
      }
    }
  };

  const handleItemClick = (n) => {
    const next = new Set(readIds);
    next.add(n.id);
    setReadIds(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    if (n.link) {
      navigate(n.link);
    }
  };

  return (
    <div className="header-bell-wrap" ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`header-bell-btn ${open ? 'active' : ''}`}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        title="Notifications"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <IconBell size={20} />
        {unreadCount > 0 && <span className="header-bell-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="notification-popover" role="dialog" aria-label="Notifications Panel">
          <div className="notification-header">
            <div className="notification-title">
              <strong>Notifications</strong>
              {unreadCount > 0 ? (
                <span className="badge badge-accent" style={{ fontSize: '0.72rem', padding: '1px 7px' }}>
                  {unreadCount} unread
                </span>
              ) : (
                <span className="badge badge-subtle" style={{ fontSize: '0.72rem', padding: '1px 7px' }}>
                  All caught up
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                className="notification-mark-all"
                onClick={markAllAsRead}
                title="Mark all notifications as read"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-list-wrap">
            {loading && notifications.length === 0 ? (
              <div className="notification-loading">Loading notifications…</div>
            ) : notifications.length === 0 ? (
              <div className="notification-empty">
                <div className="empty-bell-icon" aria-hidden="true">
                  <IconInbox size={32} />
                </div>
                <p>No new notifications</p>
                <span className="empty-sub">Inquiries, specialist replies, and statement updates will appear here.</span>
              </div>
            ) : (
              <ul className="notification-list">
                {notifications.map((n) => {
                  const isUnread = !readIds.has(n.id);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`notification-item ${isUnread ? 'unread' : ''}`}
                        onClick={() => handleItemClick(n)}
                      >
                        <div className={`notification-icon-wrap icon-type-${n.type}`}>
                          {n.type === 'reply' ? (
                            <IconCheck size={16} />
                          ) : n.isAwaiting ? (
                            <IconClock size={16} />
                          ) : (
                            <IconChat size={16} />
                          )}
                        </div>

                        <div className="notification-content">
                          <div className="notification-item-top">
                            <span className="notif-patient-name">{n.patientName}</span>
                            <span className="notif-time">{formatTimeAgo(n.createdAt)}</span>
                          </div>

                          <div className="notif-clinic-meta">
                            {n.clinicName}
                            {n.accountNumber ? ` · Acct: ${n.accountNumber}` : ''}
                          </div>

                          {n.body && (
                            <div className="notif-body-preview">
                              {n.type === 'reply' ? 'Specialist: ' : ''}
                              {n.body.replace(/^\([^)]+\)\s*/, '')}
                            </div>
                          )}

                          {n.isAwaiting && (
                            <div className="notif-tag-wrap">
                              <span className="badge badge-plum" style={{ fontSize: '0.66rem', padding: '1px 6px' }}>
                                Awaiting US24 Specialist
                              </span>
                            </div>
                          )}
                        </div>

                        {isUnread && <span className="notif-unread-dot" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="notification-footer">
            <button
              type="button"
              className="notif-footer-link"
              onClick={() => {
                setOpen(false);
                navigate('/requests');
              }}
            >
              View all inquiries & requests →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
