import React, { useState } from 'react';
import {
  IconMail,
  IconClock,
  IconSend,
  IconCheck,
  IconChat,
  IconHelpCircle,
  IconDocument,
  IconExternalLink,
  IconPaperclip,
  IconAlert,
} from './icons.jsx';
import {
  useAttachmentUploader,
  RemarkAttachmentBar,
} from './RemarkAttachments.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';

export function ContactUs24Content({
  clinic,
  clinicName = 'Clinic',
  clinicCode = '',
  isStaff = false,
  onOpenNewRequest,
  onGoToRequests,
}) {
  const { user } = useAuth();
  const toast = useToast();

  const [category, setCategory] = useState('Statement Review / Balance Question');
  const [patientRef, setPatientRef] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submittedTicket, setSubmittedTicket] = useState(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const {
    attachments,
    uploading,
    uploadError,
    handleFiles,
    removeAttachment,
    clearAttachments,
  } = useAttachmentUploader();

  const supportEmail = 'support@us24solutions.com';

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(supportEmail);
    setCopiedEmail(true);
    toast('US24 Support Email copied to clipboard!', 'success');
    setTimeout(() => setCopiedEmail(false), 2500);
  };

  const handleSubmitInquiry = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      setError('Please provide details or a question for your US24 billing specialist.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const fullBody = `[Category: ${category}]${patientRef.trim() ? ` [Reference: ${patientRef.trim()}]` : ''}\n\n${message.trim()}`;
      const clinicId = clinic?.id || user?.clinic_id;

      const payload = {
        clinicId,
        patientName: patientRef.trim() || `${clinicName} Billing Inquiry`,
        priority,
        body: fullBody,
        attachments,
      };

      const res = await api('/requests', {
        method: 'POST',
        body: payload,
      });

      toast('Inquiry successfully sent to US24 billing specialist!', 'success');
      setSubmittedTicket(res || { id: Date.now() });
      setMessage('');
      setPatientRef('');
      clearAttachments();
    } catch (err) {
      setError(err.message || 'Failed to send inquiry to US24. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="contact-us24-container">
      {/* 1. Header Banner */}
      <div className="contact-hero-card">
        <div className="contact-hero-main">
          <div className="contact-status-badge">
            <span className="contact-pulse-dot" />
            <span>US24 Specialist Desk · Active</span>
          </div>
          <h2 className="contact-hero-title">Dedicated US24 Billing Support</h2>
          <p className="contact-hero-desc">
            Direct communication channel for <strong>{clinicName}</strong> {clinicCode ? `(${clinicCode})` : ''}.
            Your US24 billing specialist team assists with patient statement questions, balance reconciliation, remarks & appeals review, and statement generation.
          </p>
        </div>

        <div className="contact-hero-actions">
          {onOpenNewRequest && (
            <button
              type="button"
              className="btn-hero-action btn-hero-request"
              onClick={onOpenNewRequest}
            >
              <IconDocument size={16} />
              <span>Request a Statement</span>
            </button>
          )}
          {onGoToRequests && (
            <button
              type="button"
              className="btn-hero-action btn-hero-inquiries"
              onClick={onGoToRequests}
            >
              <IconChat size={16} />
              <span>View Inquiries & Requests</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Three Info Channel Cards */}
      <div className="contact-channels-grid">
        {/* Email Support */}
        <div className="contact-channel-card">
          <div className="channel-card-icon-wrap icon-email">
            <IconMail size={22} />
          </div>
          <div className="channel-card-body">
            <span className="channel-tag">Direct Email</span>
            <h3 className="channel-value">{supportEmail}</h3>
            <p className="channel-sub">Monitored during business hours with automatic ticketing.</p>
          </div>
          <div className="channel-actions-row">
            <button
              type="button"
              className="btn-channel-sm btn-copy"
              onClick={handleCopyEmail}
            >
              {copiedEmail ? <IconCheck size={14} /> : <IconDocument size={14} />}
              <span>{copiedEmail ? 'Copied!' : 'Copy Email'}</span>
            </button>
            <a
              href={`mailto:${supportEmail}?subject=Inquiry%20from%20${encodeURIComponent(clinicName)}`}
              className="btn-channel-sm btn-mailto"
            >
              <IconExternalLink size={14} />
              <span>Open Mail App</span>
            </a>
          </div>
        </div>

        {/* Operating Hours */}
        <div className="contact-channel-card">
          <div className="channel-card-icon-wrap icon-clock">
            <IconClock size={22} />
          </div>
          <div className="channel-card-body">
            <span className="channel-tag">Support Desk Hours</span>
            <h3 className="channel-value">Monday – Friday</h3>
            <p className="channel-sub">
              <strong>8:00 AM – 6:00 PM MST</strong>
              <br />
              Standard SLA response within <strong>2–4 business hours</strong>.
            </p>
          </div>
          <div className="channel-badge-info">
            <IconCheck size={14} />
            <span>24/7/365 portal ticket ingestion</span>
          </div>
        </div>

        {/* Live Portal Communications */}
        <div className="contact-channel-card">
          <div className="channel-card-icon-wrap icon-portal">
            <IconChat size={22} />
          </div>
          <div className="channel-card-body">
            <span className="channel-tag">Portal Inquiries</span>
            <h3 className="channel-value">Track All Conversations</h3>
            <p className="channel-sub">
              View specialist replies, remarks, and shared attachment files directly in your Requests tab.
            </p>
          </div>
          <div className="channel-actions-row">
            {onGoToRequests && (
              <button
                type="button"
                className="btn-channel-sm btn-portal-jump"
                onClick={onGoToRequests}
              >
                <IconChat size={14} />
                <span>Open Requests Tab →</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Send Inquiry Form Card */}
      <div className="contact-form-card">
        <div className="contact-form-head">
          <div>
            <h3 className="form-card-title">Send Inquiry to US24 Billing Specialist</h3>
            <p className="form-card-sub">
              Your inquiry is routed directly to your assigned US24 billing specialist and logged into your Requests workspace.
            </p>
          </div>
        </div>

        {submittedTicket && (
          <div className="inquiry-success-alert">
            <div className="alert-success-icon">
              <IconCheck size={20} />
            </div>
            <div className="alert-success-body">
              <strong>Inquiry Delivered!</strong>
              <p>Your question has been sent to your US24 billing specialist team. You can track their response in the Requests tab.</p>
              <div className="alert-success-actions">
                {onGoToRequests && (
                  <button
                    type="button"
                    className="btn-alert-jump"
                    onClick={onGoToRequests}
                  >
                    View in Requests Tab
                  </button>
                )}
                <button
                  type="button"
                  className="btn-alert-dismiss"
                  onClick={() => setSubmittedTicket(null)}
                >
                  Send Another Inquiry
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="inquiry-error-alert">
            <IconAlert size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmitInquiry} className="contact-inquiry-form">
          <div className="form-grid-2col">
            <div className="form-group">
              <label htmlFor="inquiry-category" className="form-label">
                Inquiry Category
              </label>
              <select
                id="inquiry-category"
                className="form-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={submitting}
              >
                <option value="Statement Review / Balance Question">📋 Statement Review / Balance Question</option>
                <option value="Unposted or Recoupment Discrepancy">⚠️ Unposted or Recoupment Discrepancy</option>
                <option value="Remarks & Appeals Assistance">⚖️ Remarks & Appeals Assistance</option>
                <option value="New Statement Generation Request">📄 New Statement Generation Request</option>
                <option value="Collection Sheet Reconciliation">📊 Collection Sheet Reconciliation</option>
                <option value="General Billing Question">💬 General Account / Billing Question</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="inquiry-patient-ref" className="form-label">
                Patient Name or Ref # (optional)
              </label>
              <input
                id="inquiry-patient-ref"
                type="text"
                className="form-input"
                placeholder="e.g. John Doe, Ref #1201956274, or Check #805572929"
                value={patientRef}
                onChange={(e) => setPatientRef(e.target.value)}
                disabled={submitting}
              >
              </input>
            </div>
          </div>

          <div className="form-group">
            <div className="form-label-row">
              <label htmlFor="inquiry-message" className="form-label">
                Question or Review Details <span className="req-star">*</span>
              </label>
              <div className="priority-select-wrap">
                <span className="priority-label">Priority:</span>
                <select
                  className={`priority-select ${priority.toLowerCase()}`}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={submitting}
                  aria-label="Inquiry Priority"
                >
                  <option value="Normal">Normal</option>
                  <option value="High">High</option>
                  <option value="Urgent">🚨 Urgent</option>
                </select>
              </div>
            </div>

            <textarea
              id="inquiry-message"
              className="form-textarea"
              rows={4}
              placeholder="Describe what you would like your US24 billing specialist to review, explain, or update..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={submitting}
            />
          </div>

          {/* Attachments Section */}
          <div className="form-group">
            <label className="form-label">
              Attachments (optional)
              <span className="form-label-hint"> — Upload EOB, remittance sheet, statement draft, or screenshot</span>
            </label>
            <div className="attachment-drop-box">
              <label htmlFor="inquiry-files" className="attachment-file-label">
                <IconPaperclip size={16} />
                <span>{uploading ? 'Uploading attachment…' : 'Add File Attachment (PDF, Image, Excel)'}</span>
                <input
                  id="inquiry-files"
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFiles(e.target.files);
                    }
                  }}
                  disabled={uploading || submitting}
                />
              </label>
            </div>
            {uploadError && <div className="upload-error-hint">{uploadError}</div>}
            {attachments.length > 0 && (
              <RemarkAttachmentBar
                attachments={attachments}
                uploading={uploading}
                onRemove={removeAttachment}
              />
            )}
          </div>

          <div className="form-submit-row">
            <button
              type="submit"
              className="btn-submit-inquiry"
              disabled={submitting || uploading || !message.trim()}
            >
              <IconSend size={16} />
              <span>{submitting ? 'Sending to US24…' : 'Send Inquiry to US24 Specialist'}</span>
            </button>
            <span className="submit-subtext">
              Directly delivered to your assigned billing specialist queue.
            </span>
          </div>
        </form>
      </div>

      {/* 4. Help & FAQ Section */}
      <div className="contact-faq-section">
        <h3 className="faq-heading">Frequently Asked Questions</h3>
        <div className="faq-grid">
          <div className="faq-card">
            <h4 className="faq-q">
              <IconHelpCircle size={16} className="faq-icon" />
              How quickly does US24 review statement inquiries?
            </h4>
            <p className="faq-a">
              Standard inquiries are answered within <strong>2 to 4 business hours</strong>. Inquiries marked as <strong>Urgent</strong> are escalated directly to the lead specialist desk immediately.
            </p>
          </div>

          <div className="faq-card">
            <h4 className="faq-q">
              <IconHelpCircle size={16} className="faq-icon" />
              Can I request corrections to a published statement?
            </h4>
            <p className="faq-a">
              Yes. Use the inquiry form above with the patient or account number and explain the correction. Your specialist will update the ledger, adjust the balance, and publish a new statement version.
            </p>
          </div>

          <div className="faq-card">
            <h4 className="faq-q">
              <IconHelpCircle size={16} className="faq-icon" />
              Where do I see responses from US24?
            </h4>
            <p className="faq-a">
              All specialist responses, attached EOBs, and updated files appear in the <strong>Requests</strong> tab with real-time status tracking and correspondence history.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
