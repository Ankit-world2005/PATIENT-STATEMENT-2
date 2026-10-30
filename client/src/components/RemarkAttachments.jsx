import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import {
  IconClose,
  IconDocument,
  IconDownload,
  IconFileSpreadsheet,
  IconFileText,
  IconImage,
  IconPlus,
  IconPaperclip,
} from './Icons.jsx';
import { Spinner } from './ui.jsx';

export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isImageAttachment(att) {
  if (!att) return false;
  const mime = (att.contentType || '').toLowerCase();
  const name = (att.name || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

export function isExcelAttachment(att) {
  if (!att) return false;
  const mime = (att.contentType || '').toLowerCase();
  const name = (att.name || '').toLowerCase();
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')) return true;
  return /\.(xlsx|xls|csv)$/i.test(name);
}

export function isPdfAttachment(att) {
  if (!att) return false;
  const mime = (att.contentType || '').toLowerCase();
  const name = (att.name || '').toLowerCase();
  if (mime.includes('pdf')) return true;
  return /\.pdf$/i.test(name);
}

export function AttachmentIcon({ att, size = 16 }) {
  if (isImageAttachment(att)) return <IconImage size={size} />;
  if (isExcelAttachment(att)) return <IconFileSpreadsheet size={size} />;
  if (isPdfAttachment(att)) return <IconDocument size={size} />;
  return <IconFileText size={size} />;
}

export function useAttachmentUploader() {
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const uploadFile = async (file) => {
    const form = new FormData();
    form.append('file', file);
    const res = await api('/attachments', { method: 'POST', form });
    return res.attachment;
  };

  const handleFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setUploadError('');
    try {
      const added = [];
      for (const file of Array.from(fileList)) {
        if (file.size > 15 * 1024 * 1024) {
          setUploadError(`"${file.name}" exceeds the 15 MB limit.`);
          continue;
        }
        const att = await uploadFile(file);
        if (att) added.push(att);
      }
      if (added.length > 0) {
        setAttachments((prev) => [...prev, ...added]);
      }
    } catch (err) {
      setUploadError(err.message || 'Failed to upload attachment.');
    } finally {
      setUploading(false);
    }
  };

  const handlePaste = (e) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const files = [];
    if (clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        files.push(clipboardData.files[i]);
      }
    } else if (clipboardData.items && clipboardData.items.length > 0) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.kind === 'file') {
          const blob = item.getAsFile();
          if (blob) {
            const ext = (blob.type || 'image/png').split('/')[1] || 'png';
            const filename = blob.name && blob.name !== 'image.png'
              ? blob.name
              : `pasted-photo-${Date.now().toString().slice(-4)}.${ext}`;
            files.push(new File([blob], filename, { type: blob.type }));
          }
        }
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      handleFiles(files);
    }
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const clearAttachments = () => {
    setAttachments([]);
    setUploadError('');
  };

  return {
    attachments,
    setAttachments,
    uploading,
    uploadError,
    handleFiles,
    handlePaste,
    removeAttachment,
    clearAttachments,
  };
}

/**
 * Unified Remark Input Box with the '+' button and attachment chips seamlessly INSIDE the box.
 */
export function RemarkInputBox({
  id,
  value,
  onChange,
  onPaste,
  placeholder,
  rows = 3,
  disabled = false,
  autoFocus = false,
  required = false,
  attachments = [],
  uploading = false,
  uploadError = '',
  onAddFiles,
  onRemoveAttachment,
  name,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}) {
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  return (
    <div className={`remark-box-container ${disabled ? 'is-disabled' : ''}`}>
      <textarea
        id={id}
        name={name}
        ref={textareaRef}
        className="remark-box-textarea"
        value={value}
        onChange={onChange}
        onPaste={onPaste}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
      />

      {/* Uploaded draft attachment chips inside the remark box */}
      {attachments.length > 0 && (
        <div className="remark-box-chips-row" aria-label="Attachments">
          {attachments.map((att) => (
            <div key={att.id} className="attachment-chip">
              <span className="attachment-chip-icon">
                <AttachmentIcon att={att} size={14} />
              </span>
              <span className="attachment-chip-name" title={att.name}>
                {att.name}
              </span>
              <span className="attachment-chip-size">
                ({formatFileSize(att.size)})
              </span>
              <button
                type="button"
                className="attachment-chip-remove"
                onClick={() => onRemoveAttachment(att.id)}
                title="Remove attachment"
                aria-label={`Remove ${att.name}`}
                disabled={disabled}
              >
                <IconClose size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Inside bottom bar containing '+' button and status */}
      <div className="remark-box-bottom-bar">
        <div className="remark-box-bottom-left">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            multiple
            accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx,.txt"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                onAddFiles(e.target.files);
                e.target.value = '';
              }
            }}
            disabled={disabled || uploading}
          />
          <button
            type="button"
            className="btn-box-inside-attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            title="Attach photos, PDF, Excel sheets, or documents (or paste with Ctrl+V)"
            aria-label="Attach file"
          >
            <IconPaperclip size={14} />
            <span className="attach-btn-label">Attach</span>
          </button>
          {uploading && (
            <span className="remark-box-uploading">
              <Spinner label="Uploading…" /> Uploading…
            </span>
          )}
        </div>
      </div>

      {uploadError && (
        <div className="remark-box-error-msg" role="alert">
          {uploadError}
        </div>
      )}
    </div>
  );
}

/**
 * The '+' attachment control bar placed under or inside the remark/request box.
 */
export function RemarkAttachmentBar({
  attachments = [],
  uploading = false,
  uploadError = '',
  onAddFiles,
  onRemove,
  disabled = false,
}) {
  const fileInputRef = useRef(null);

  return (
    <div className="remark-attachments-control-bar">
      <div className="attachment-actions-row">
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          multiple
          accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx,.txt"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onAddFiles(e.target.files);
              e.target.value = '';
            }
          }}
          disabled={disabled || uploading}
        />
        <button
          type="button"
          className="btn-remark-attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          title="Attach file"
          aria-label="Attach file"
        >
          <IconPaperclip size={14} />
          <span className="attach-btn-label">Attach</span>
        </button>
        {uploading && (
          <span className="attachment-uploading-indicator">
            <Spinner label="Uploading…" /> Uploading…
          </span>
        )}
      </div>

      {uploadError && (
        <div className="attachment-error-msg" role="alert">
          {uploadError}
        </div>
      )}

      {/* Attachment chips drafted for submission */}
      {attachments.length > 0 && (
        <div className="attachment-draft-chips" aria-label="Attachments to post">
          {attachments.map((att) => (
            <div key={att.id} className="attachment-chip">
              <span className="attachment-chip-icon">
                <AttachmentIcon att={att} size={14} />
              </span>
              <span className="attachment-chip-name" title={att.name}>
                {att.name}
              </span>
              <span className="attachment-chip-size">
                ({formatFileSize(att.size)})
              </span>
              <button
                type="button"
                className="attachment-chip-remove"
                onClick={() => onRemove(att.id)}
                title="Remove attachment"
                aria-label={`Remove ${att.name}`}
                disabled={disabled}
              >
                <IconClose size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Displays attachments on posted remarks or request threads.
 */
function ImageAttachmentCard({ att, onSelectPhoto }) {
  const [loadError, setLoadError] = useState(false);

  if (loadError) {
    return (
      <a
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        download={att.name}
        className="attachment-file-pill type-image"
        title={`Download ${att.name} (${formatFileSize(att.size)})`}
      >
        <span className="pill-icon">
          <AttachmentIcon att={att} size={15} />
        </span>
        <span className="pill-name" title={att.name}>{att.name}</span>
        <span className="pill-size">{formatFileSize(att.size)}</span>
        <span className="pill-action">
          <IconDownload size={13} />
        </span>
      </a>
    );
  }

  return (
    <div className="attachment-image-card">
      <a
        href={att.url}
        target="_blank"
        rel="noopener noreferrer"
        className="attachment-image-preview-wrap"
        onClick={(e) => {
          e.preventDefault();
          onSelectPhoto(att);
        }}
        title={`View ${att.name}`}
      >
        <img
          src={att.url}
          alt={att.name}
          className="attachment-thumb-img"
          loading="lazy"
          onError={() => setLoadError(true)}
        />
        <div className="attachment-image-overlay">
          <span className="overlay-text">Click to view</span>
        </div>
      </a>
      <div className="attachment-image-caption">
        <span className="caption-name" title={att.name}>{att.name}</span>
        <a
          href={att.url}
          download={att.name}
          className="caption-download-btn"
          title="Download image"
        >
          <IconDownload size={13} />
        </a>
      </div>
    </div>
  );
}

export function RemarkAttachmentViewer({ attachments = [] }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="remark-attachments-viewer">
      <div className="attachments-grid">
        {attachments.map((att, idx) => {
          const isImg = isImageAttachment(att);
          const isExcel = isExcelAttachment(att);
          const isPdf = isPdfAttachment(att);

          const tagClass = isImg ? 'type-image' : isExcel ? 'type-excel' : isPdf ? 'type-pdf' : 'type-doc';

          if (isImg) {
            return (
              <ImageAttachmentCard
                key={att.id || idx}
                att={att}
                onSelectPhoto={setSelectedPhoto}
              />
            );
          }

          return (
            <div key={att.id || idx} className={`attachment-file-pill ${tagClass}`}>
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="pill-main-link"
                title={`Click to open ${att.name} in new tab`}
              >
                <span className="pill-icon">
                  <AttachmentIcon att={att} size={15} />
                </span>
                <span className="pill-name" title={att.name}>{att.name}</span>
                <span className="pill-size">{formatFileSize(att.size)}</span>
              </a>
              <a
                href={`${att.url}?download=1`}
                download={att.name}
                className="pill-action"
                title={`Download ${att.name}`}
              >
                <IconDownload size={13} />
              </a>
            </div>
          );
        })}
      </div>

      {/* Lightbox photo modal */}
      {selectedPhoto && (
        <div
          className="attachment-lightbox-backdrop"
          onClick={() => setSelectedPhoto(null)}
          role="dialog"
          aria-modal="true"
          aria-label={selectedPhoto.name}
        >
          <div className="attachment-lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <span className="lightbox-filename">{selectedPhoto.name}</span>
              <div className="lightbox-actions">
                <a
                  href={selectedPhoto.url}
                  download={selectedPhoto.name}
                  className="btn btn-secondary btn-sm"
                  title="Download photo"
                >
                  <IconDownload size={14} /> Download
                </a>
                <a
                  href={selectedPhoto.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  title="Open full in new tab"
                >
                  Open in tab
                </a>
                <button
                  type="button"
                  className="btn-lightbox-close"
                  onClick={() => setSelectedPhoto(null)}
                  aria-label="Close photo preview"
                >
                  <IconClose size={18} />
                </button>
              </div>
            </div>
            <div className="lightbox-image-wrap">
              <img
                src={selectedPhoto.url}
                alt={selectedPhoto.name}
                className="lightbox-full-img"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

