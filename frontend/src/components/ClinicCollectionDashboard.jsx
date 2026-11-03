import { useState, useEffect, useMemo, useRef } from 'react';
import { api, downloadFile } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useToast } from '../lib/toast.jsx';
import {
  IconWallet,
  IconDocument,
  IconDownload,
  IconUpload,
  IconSearch,
  IconClose,
  IconCheck,
  IconChart,
  IconPieChart,
  IconFileSpreadsheet,
} from './Icons.jsx';

function formatMoney(amount) {
  if (amount == null || amount === '') return '$0.00';
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


const PAYER_COLORS = [
  '#1E3A8A', // Deep Blue
  '#2563EB', // Royal Blue
  '#0D9488', // Teal
  '#EA580C', // Amber Orange
  '#8B5CF6', // Purple
  '#DB2777', // Pink
  '#64748B', // Slate
];

function PayerPieChart({ checkRows = [], onSelectPayer }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0 });
  const chartWrapRef = useRef(null);

  const breakdown = useMemo(() => {
    if (!checkRows || checkRows.length === 0) return { slices: [], total: 0, count: 0 };

    const map = new Map();
    let total = 0;
    let count = 0;

    checkRows.forEach((r) => {
      const payer = (r.payer || 'Unknown Payer').trim();
      const amt = Number(r.paymentAmount) || 0;
      if (amt > 0) {
        map.set(payer, (map.get(payer) || 0) + amt);
        total += amt;
        count++;
      }
    });

    if (total === 0) return { slices: [], total: 0, count };

    const sorted = Array.from(map.entries())
      .map(([payer, amount]) => ({
        payer,
        amount,
        percent: (amount / total) * 100,
      }))
      .sort((a, b) => b.amount - a.amount);

    const topLimit = 5;
    let slices = [];

    if (sorted.length <= topLimit + 1) {
      slices = sorted.map((item, idx) => ({
        ...item,
        color: PAYER_COLORS[idx % PAYER_COLORS.length],
      }));
    } else {
      const top = sorted.slice(0, topLimit);
      const other = sorted.slice(topLimit);
      const otherAmt = other.reduce((sum, item) => sum + item.amount, 0);

      slices = [
        ...top.map((item, idx) => ({
          ...item,
          color: PAYER_COLORS[idx % PAYER_COLORS.length],
        })),
        {
          payer: `Other (${other.length} Payers)`,
          amount: otherAmt,
          percent: (otherAmt / total) * 100,
          color: '#94A3B8',
          isOther: true,
        },
      ];
    }

    return { slices, total, count };
  }, [checkRows]);

  if (breakdown.slices.length === 0) {
    return (
      <div className="pie-empty-state">
        <IconPieChart size={32} className="text-muted" />
        <p>No check payment remittances to display.</p>
      </div>
    );
  }

  // SVG Donut calculation
  const size = 150;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulated = 0;
  const activeItem = hoveredIdx !== null ? breakdown.slices[hoveredIdx] : null;

  const updateTooltip = (e, idx) => {
    setHoveredIdx(idx);
    const rect = chartWrapRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltip({
        visible: true,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  const clearTooltip = () => {
    setHoveredIdx(null);
    setTooltip({ visible: false, x: 0, y: 0 });
  };

  return (
    <div className="payer-pie-container">
      {/* Donut Chart Visual */}
      <div className="payer-pie-chart-wrap" ref={chartWrapRef}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="payer-pie-svg"
          aria-label="Payer Remittance Share Chart"
        >
          {/* Background circle track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
          />

          {/* Slices */}
          {breakdown.slices.map((slice, idx) => {
            const strokeLength = Math.max(1, (slice.percent / 100) * circumference);
            const strokeOffset = -accumulated;
            accumulated += strokeLength;
            const isHovered = hoveredIdx === idx;

            return (
              <circle
                key={slice.payer}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeDasharray={`${strokeLength} ${circumference - strokeLength}`}
                strokeDashoffset={strokeOffset}
                transform={`rotate(-90 ${center} ${center})`}
                className="pie-slice"
                style={{
                  transition: 'stroke-width 0.18s ease, opacity 0.18s ease',
                  opacity: hoveredIdx !== null && !isHovered ? 0.45 : 1,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => updateTooltip(e, idx)}
                onMouseMove={(e) => updateTooltip(e, idx)}
                onMouseLeave={clearTooltip}
                onClick={() => !slice.isOther && onSelectPayer?.(slice.payer)}
              >
                <title>{`${slice.payer}: ${formatMoney(slice.amount)} (${slice.percent.toFixed(1)}%)`}</title>
              </circle>
            );
          })}
        </svg>

        {/* Center overlay in donut */}
        <div className="payer-pie-center">
          {activeItem ? (
            <>
              <div className="pie-center-payer-name" title={activeItem.payer}>
                {activeItem.payer}
              </div>
              <div className="pie-center-val">
                {formatMoney(activeItem.amount)}
              </div>
              <div className="pie-center-lbl">
                {activeItem.percent.toFixed(1)}% Share
              </div>
            </>
          ) : (
            <>
              <div className="pie-center-val">
                {formatMoney(breakdown.total)}
              </div>
              <div className="pie-center-lbl">
                {breakdown.count} Checks
              </div>
            </>
          )}
        </div>

        {/* Floating Tooltip tracking cursor */}
        {tooltip.visible && activeItem && (
          <div
            className="payer-pie-floating-tooltip"
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y - 12}px`,
            }}
          >
            <div className="tooltip-payer-header">
              <span className="tooltip-dot" style={{ backgroundColor: activeItem.color }} />
              <span className="tooltip-payer-name">{activeItem.payer}</span>
            </div>
            <div className="tooltip-payer-meta">
              <span className="tooltip-payer-amt">{formatMoney(activeItem.amount)}</span>
              <span className="tooltip-payer-pct">({activeItem.percent.toFixed(1)}%)</span>
            </div>
          </div>
        )}
      </div>

      {/* Legend & Breakdown Details */}
      <div className="payer-pie-legend">
        <div className="payer-legend-header">
          <span>PAYER</span>
          <span>SHARE / AMOUNT</span>
        </div>
        <div className="payer-legend-list">
          {breakdown.slices.map((slice, idx) => {
            const isHovered = hoveredIdx === idx;
            return (
              <div
                key={slice.payer}
                className={`payer-legend-item ${isHovered ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => !slice.isOther && onSelectPayer?.(slice.payer)}
                title={slice.payer}
              >
                <div className="payer-legend-left">
                  <span
                    className="payer-color-dot"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="payer-legend-name">{slice.payer}</span>
                </div>
                <div className="payer-legend-right">
                  <span className="payer-legend-pct">
                    {slice.percent.toFixed(1)}%
                  </span>
                  <span className="payer-legend-amt">
                    {formatMoney(slice.amount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ClinicCollectionDashboard({ clinic, isStaff }) {
  const { user } = useAuth();
  const isSpecialist = isStaff || user?.role === 'specialist' || user?.role === 'admin';
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [activeSheetTab, setActiveSheetTab] = useState('checks'); // 'checks' | 'lineitems'
  
  // Table filters
  const [checkSearch, setCheckSearch] = useState('');
  const [lineItemSearch, setLineItemSearch] = useState('');
  const [prTypeFilter, setPrTypeFilter] = useState('ALL');
  const [checkLocationFilter, setCheckLocationFilter] = useState('ALL');
  const [lineItemLocationFilter, setLineItemLocationFilter] = useState('ALL');

  // Dual horizontal scroll synchronization & measurement refs
  const topScrollRef = useRef(null);
  const tableScrollRef = useRef(null);
  const isSyncingRef = useRef(false);
  const [tableScrollWidth, setTableScrollWidth] = useState(1500);

  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Row Pouch (Corner dog-ear fold with isolated logs and flags) state
  const [pouchModalRow, setPouchModalRow] = useState(null); // { row, rowIndex, sheetType: 'check' | 'lineitem' }
  const [pouchTab, setPouchTab] = useState('logs'); // 'logs' | 'flags'
  const [newLogInput, setNewLogInput] = useState('');
  const [flagReasonInput, setFlagReasonInput] = useState('');
  const [selectedFlagType, setSelectedFlagType] = useState('Under Review');
  const [pouchBusy, setPouchBusy] = useState(false);
  const [pouchClosing, setPouchClosing] = useState(false);
  const [pouchAnchor, setPouchAnchor] = useState(null); // { x, y } screen coordinates of hovered pouch

  const pouchHoverTimerRef = useRef(null);
  const pouchCloseTimerRef = useRef(null);

  const handleOpenPouch = (row, rowIndex, sheetType = 'check', rect = null) => {
    if (pouchHoverTimerRef.current) {
      clearTimeout(pouchHoverTimerRef.current);
      pouchHoverTimerRef.current = null;
    }
    if (pouchCloseTimerRef.current) {
      clearTimeout(pouchCloseTimerRef.current);
      pouchCloseTimerRef.current = null;
    }
    if (rect) {
      setPouchAnchor({ x: rect.left, y: rect.top, right: rect.right, bottom: rect.bottom });
    }
    setPouchClosing(false);
    setPouchModalRow({ row, rowIndex, sheetType });
    setPouchTab('logs');
    setNewLogInput('');
    setFlagReasonInput('');
    setSelectedFlagType('Under Review');
  };

  const handlePouchMouseEnter = (row, rowIndex, sheetType = 'check', rect = null) => {
    if (pouchCloseTimerRef.current) {
      clearTimeout(pouchCloseTimerRef.current);
      pouchCloseTimerRef.current = null;
    }
    if (pouchHoverTimerRef.current) {
      clearTimeout(pouchHoverTimerRef.current);
    }
    // Automatically open directly from corner pouch hover
    pouchHoverTimerRef.current = setTimeout(() => {
      handleOpenPouch(row, rowIndex, sheetType, rect);
    }, 100);
  };

  const handlePouchMouseLeave = () => {
    if (pouchHoverTimerRef.current) {
      clearTimeout(pouchHoverTimerRef.current);
      pouchHoverTimerRef.current = null;
    }
    // If flyout is open, give a brief grace window for cursor to move from pouch into dialog
    if (pouchModalRow && !pouchClosing) {
      if (pouchCloseTimerRef.current) clearTimeout(pouchCloseTimerRef.current);
      pouchCloseTimerRef.current = setTimeout(() => {
        handleClosePouch();
      }, 250);
    }
  };

  const handleDialogMouseEnter = () => {
    // Cursor entered the opened card, cancel close timer so it stays open
    if (pouchCloseTimerRef.current) {
      clearTimeout(pouchCloseTimerRef.current);
      pouchCloseTimerRef.current = null;
    }
  };

  const handleDialogMouseLeave = () => {
    // When cursor is removed from the card, automatically close it!
    if (pouchModalRow && !pouchClosing) {
      if (pouchCloseTimerRef.current) clearTimeout(pouchCloseTimerRef.current);
      pouchCloseTimerRef.current = setTimeout(() => {
        handleClosePouch();
      }, 150);
    }
  };

  // Compute anchored floating position emerging directly from corner pouch
  const dialogStyle = useMemo(() => {
    if (!pouchAnchor) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        transformOrigin: 'center center',
      };
    }

    const cardWidth = 580;
    const cardHeight = 490;
    const padding = 16;

    let left = pouchAnchor.x;
    if (left + cardWidth > window.innerWidth - padding) {
      left = Math.max(padding, window.innerWidth - cardWidth - padding);
    }
    if (left < padding) left = padding;

    let top = pouchAnchor.y;
    if (top + cardHeight > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - cardHeight - padding);
    }
    if (top < padding) top = padding;

    const originX = Math.round(Math.max(0, Math.min(cardWidth, pouchAnchor.x - left + 8)));
    const originY = Math.round(Math.max(0, Math.min(cardHeight, pouchAnchor.y - top + 8)));

    return {
      top: `${top}px`,
      left: `${left}px`,
      transformOrigin: `${originX}px ${originY}px`,
    };
  }, [pouchAnchor]);

  useEffect(() => {
    if (!pouchModalRow) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClosePouch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pouchModalRow, pouchClosing]);

  useEffect(() => {
    return () => {
      if (pouchHoverTimerRef.current) clearTimeout(pouchHoverTimerRef.current);
      if (pouchCloseTimerRef.current) clearTimeout(pouchCloseTimerRef.current);
    };
  }, []);

  const handleClosePouch = () => {
    if (pouchClosing || !pouchModalRow) return;
    setPouchClosing(true);
    setTimeout(() => {
      setPouchModalRow(null);
      setPouchClosing(false);
      setNewLogInput('');
      setFlagReasonInput('');
    }, 180);
  };

  const handleAddLog = async () => {
    if (!newLogInput.trim() || !pouchModalRow || !data?.id) return;
    setPouchBusy(true);
    try {
      const res = await api(`/collections/${data.id}/rows/logs`, {
        method: 'POST',
        body: {
          rowIndex: pouchModalRow.rowIndex,
          paymentReference: pouchModalRow.row.paymentReference || pouchModalRow.row.referenceNumber,
          logText: newLogInput.trim(),
          sheetType: pouchModalRow.sheetType,
        },
      });
      if (res.ok) {
        toast('Log entry saved successfully.', 'success');
        const updatedRow = { ...pouchModalRow.row, logs: res.logs };
        setPouchModalRow((prev) => ({ ...prev, row: updatedRow }));
        setData((prev) => {
          if (!prev) return prev;
          if (pouchModalRow.sheetType === 'check') {
            const nextCheckRows = [...(prev.checkRows || [])];
            nextCheckRows[pouchModalRow.rowIndex] = updatedRow;
            return { ...prev, checkRows: nextCheckRows };
          } else {
            const nextLineItems = [...(prev.lineItems || [])];
            nextLineItems[pouchModalRow.rowIndex] = updatedRow;
            return { ...prev, lineItems: nextLineItems };
          }
        });
        setNewLogInput('');
      }
    } catch (err) {
      toast(err.message || 'Failed to save log entry.', 'error');
    } finally {
      setPouchBusy(false);
    }
  };

  const handleToggleFlag = async (flagType, makeActive) => {
    if (!pouchModalRow || !data?.id) return;
    setPouchBusy(true);
    try {
      const res = await api(`/collections/${data.id}/rows/flags`, {
        method: 'POST',
        body: {
          rowIndex: pouchModalRow.rowIndex,
          paymentReference: pouchModalRow.row.paymentReference || pouchModalRow.row.referenceNumber,
          flagType,
          active: makeActive,
          reason: makeActive ? (flagReasonInput.trim() || undefined) : undefined,
          sheetType: pouchModalRow.sheetType,
        },
      });
      if (res.ok) {
        toast(makeActive ? `Flag "${flagType}" added.` : `Flag "${flagType}" resolved.`, 'success');
        const updatedRow = { ...pouchModalRow.row, flags: res.flags, logs: res.logs };
        setPouchModalRow((prev) => ({ ...prev, row: updatedRow }));
        setData((prev) => {
          if (!prev) return prev;
          if (pouchModalRow.sheetType === 'check') {
            const nextCheckRows = [...(prev.checkRows || [])];
            nextCheckRows[pouchModalRow.rowIndex] = updatedRow;
            return { ...prev, checkRows: nextCheckRows };
          } else {
            const nextLineItems = [...(prev.lineItems || [])];
            nextLineItems[pouchModalRow.rowIndex] = updatedRow;
            return { ...prev, lineItems: nextLineItems };
          }
        });
        setFlagReasonInput('');
      }
    } catch (err) {
      toast(err.message || 'Failed to update flag.', 'error');
    } finally {
      setPouchBusy(false);
    }
  };

  const fetchCollection = async (month) => {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams();
      if (clinic?.id) q.set('clinicId', clinic.id);
      if (month) q.set('month', month);
      const res = await api(`/collections?${q.toString()}`);
      if (res.ok && res.collection) {
        setData(res.collection);
        if (!selectedMonth && res.collection.monthYear) {
          setSelectedMonth(res.collection.monthYear);
        }
      } else {
        setData(null);
      }
    } catch (err) {
      console.error('Failed to load collections:', err);
      setError(err.message || 'Unable to load collection report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollection(selectedMonth);
  }, [clinic?.id, selectedMonth]);

  // Filtered check sheet rows
  const filteredCheckRows = useMemo(() => {
    if (!data?.checkRows) return [];
    if (!checkSearch.trim()) return data.checkRows;
    const term = checkSearch.toLowerCase().trim();
    return data.checkRows.filter(r =>
      (r.payer && r.payer.toLowerCase().includes(term)) ||
      (r.paymentReference && r.paymentReference.toLowerCase().includes(term)) ||
      (r.remarks && r.remarks.toLowerCase().includes(term))
    );
  }, [data?.checkRows, checkSearch]);

  // Filtered line item rows
  const filteredLineItems = useMemo(() => {
    if (!data?.lineItems) return [];
    return data.lineItems.filter(r => {
      const matchesSearch = !lineItemSearch.trim() ||
        (r.patientName && r.patientName.toLowerCase().includes(lineItemSearch.toLowerCase().trim())) ||
        (r.referenceNumber && r.referenceNumber.toLowerCase().includes(lineItemSearch.toLowerCase().trim()));
      
      const matchesPr = prTypeFilter === 'ALL' ||
        (r.prType && r.prType.toLowerCase().includes(prTypeFilter.toLowerCase()));

      return matchesSearch && matchesPr;
    });
  }, [data?.lineItems, lineItemSearch, prTypeFilter]);

  const hasCreatedBy = useMemo(() => (data?.checkRows || []).some(r => r.createdBy && String(r.createdBy).trim()), [data?.checkRows]);
  const hasClaimNumber = useMemo(() => (data?.lineItems || []).some(r => r.claimNumber && String(r.claimNumber).trim()), [data?.lineItems]);

  // Unique PR types for dropdown
  const availablePrTypes = useMemo(() => {
    if (!data?.lineItems) return [];
    const set = new Set();
    data.lineItems.forEach(r => {
      if (r.prType) set.add(r.prType);
    });
    return Array.from(set);
  }, [data?.lineItems]);

  // Unique locations for checks
  const availableCheckLocations = useMemo(() => {
    if (!data?.checkRows) return [];
    const set = new Set();
    data.checkRows.forEach(r => {
      if (r.location) set.add(r.location);
    });
    return Array.from(set);
  }, [data?.checkRows]);

  // Unique locations for line items
  const availableLineItemLocations = useMemo(() => {
    if (!data?.lineItems) return [];
    const set = new Set();
    data.lineItems.forEach(r => {
      if (r.location) set.add(r.location);
    });
    return Array.from(set);
  }, [data?.lineItems]);

  // Check sheet totals
  const checkTotals = useMemo(() => {
    const list = filteredCheckRows;
    return {
      paymentAmount: list.reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0),
      totalPosted: list.reduce((sum, r) => sum + (Number(r.totalPosted) || 0), 0),
      unposted: list.reduce((sum, r) => sum + (Number(r.unposted) || 0), 0),
      recoupment: list.reduce((sum, r) => sum + (Number(r.recoupment) || 0), 0),
    };
  }, [filteredCheckRows]);

  // Line item totals
  const lineItemTotals = useMemo(() => {
    const list = filteredLineItems;
    return {
      charged: list.reduce((sum, r) => sum + (Number(r.chargedAmount) || 0), 0),
      allowed: list.reduce((sum, r) => sum + (Number(r.allowedAmount) || 0), 0),
      insurancePayment: list.reduce((sum, r) => sum + (Number(r.insurancePayment) || 0), 0),
      adjusted: list.reduce((sum, r) => sum + (Number(r.adjustedAmount) || 0), 0),
      transferredSec: list.reduce((sum, r) => sum + (Number(r.transferredToSecondary) || 0), 0),
      transferredPt: list.reduce((sum, r) => sum + (Number(r.transferredToPatient) || 0), 0),
      patientPaid: list.reduce((sum, r) => sum + (Number(r.patientPaid) || 0), 0),
    };
  }, [filteredLineItems]);

  const handleTopScroll = () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (tableScrollRef.current && topScrollRef.current) {
      tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  const handleTableScroll = () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (topScrollRef.current && tableScrollRef.current) {
      topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
    }
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  // Reset scroll to leftmost position when switching between Check Sheet and Line Items tabs
  useEffect(() => {
    if (tableScrollRef.current) tableScrollRef.current.scrollLeft = 0;
    if (topScrollRef.current) topScrollRef.current.scrollLeft = 0;
  }, [activeSheetTab]);

  // Sync spacer width with actual table scroll width whenever table content or tab changes
  useEffect(() => {
    const updateWidth = () => {
      if (tableScrollRef.current) {
        setTableScrollWidth(tableScrollRef.current.scrollWidth);
      }
    };
    updateWidth();

    let ro;
    if (typeof window !== 'undefined' && window.ResizeObserver && tableScrollRef.current) {
      ro = new ResizeObserver(updateWidth);
      ro.observe(tableScrollRef.current);
      const tableEl = tableScrollRef.current.querySelector('table');
      if (tableEl) ro.observe(tableEl);
    }
    return () => {
      if (ro) ro.disconnect();
    };
  }, [activeSheetTab, filteredCheckRows.length, filteredLineItems.length]);

  const [exporting, setExporting] = useState(false);

  const handleDownloadTemplate = async () => {
    try {
      await downloadFile('/collections/template', 'Prompt_Collection_Template.xlsx');
      toast('Template downloaded successfully.', 'success');
    } catch (err) {
      toast(err.message || 'Failed to download collection template.', 'error');
    }
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const q = new URLSearchParams();
      if (clinic?.id) q.set('clinicId', clinic.id);
      if (selectedMonth) q.set('month', selectedMonth);
      await downloadFile(`/collections/export?${q.toString()}`, `${clinic?.name || 'Clinic'}_Collections.xlsx`);
      toast('Collection report exported successfully.', 'success');
    } catch (err) {
      toast(err.message || 'Failed to export collection spreadsheet.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      toast('Please choose an Excel file to upload.', 'error');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      if (clinic?.id) formData.append('clinicId', clinic.id);

      const res = await api('/collections/upload', {
        method: 'POST',
        form: formData,
      });

      if (res.ok) {
        toast('Collection report uploaded and reconciled successfully!', 'success');
        setUploadOpen(false);
        setUploadFile(null);
        if (res.collection?.monthYear) {
          setSelectedMonth(res.collection.monthYear);
        }
        await fetchCollection(res.collection?.monthYear || selectedMonth);
      }
    } catch (err) {
      toast(err.message || 'Failed to upload collection spreadsheet.', 'error');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="clinic-collection-workspace collection-empty-container">
        <p style={{ color: '#64748B', fontWeight: 600 }}>Loading clinic collection report...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="clinic-collection-workspace" aria-label="Clinic Collection Dashboard">
        {/* 1. Header Toolbar */}
        <div className="collection-header-band">
          <div className="collection-title-block">
            <div className="collection-badge-row">
              <span className="collection-tag-pill">
                <IconWallet size={14} /> Clinic Collections & Reconciliations
              </span>
            </div>
            <h2 className="collection-report-h2">{clinic?.name || 'Clinic'} Collection Report</h2>
            <p className="collection-report-sub">
              Monthly deposit verification, insurance remittances, and patient responsibility ledger reconciliation.
            </p>
          </div>

          <div className="collection-actions-cluster">
          </div>
        </div>

        {error && (
          <div className="collection-alert-error" role="alert">
            {error}
          </div>
        )}

        {/* Empty State Banner */}
        <div className="collection-empty-container">
          <div className="collection-empty-card">
            <div className="collection-empty-icon-wrap">
              <IconWallet size={42} />
            </div>
            <h3 className="collection-empty-title">
              No Collection Report Uploaded Yet
            </h3>
            <p className="collection-empty-text">
              {isSpecialist
                ? `No collection report has been uploaded for ${clinic?.name || 'this clinic'} yet. Click "Upload Collection" to upload the Prompt Collection Report (.xlsx).`
                : `Your US24 Solutions billing specialist has not uploaded a collection report for ${clinic?.name || 'your clinic'} yet. Once uploaded and reconciled, all monthly deposit totals, insurance checks, and patient line items will appear here.`}
            </p>
            {isSpecialist && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn-empty-primary-upload"
                  onClick={() => setUploadOpen(true)}
                >
                  <IconUpload size={16} />
                  <span>Upload Collection Report (.xlsx)</span>
                </button>
                <button
                  type="button"
                  className="btn-collection-action btn-template"
                  onClick={handleDownloadTemplate}
                  title="Download blank Excel template"
                >
                  <IconDownload size={15} />
                  <span>Download Blank Template</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Upload Modal Dialog for US24 specialists only */}
  

      {/* Upload Collection Modal */}
      {uploadOpen && isSpecialist && (
          <div className="collection-modal-backdrop" onClick={() => !uploading && setUploadOpen(false)}>
            <div className="collection-modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <div className="collection-modal-header">
                <div className="modal-title-wrap">
                  <IconUpload size={18} className="modal-icon-navy" />
                  <h3>Upload Clinic Collection Excel</h3>
                </div>
                <button
                  type="button"
                  className="btn-modal-close"
                  onClick={() => !uploading && setUploadOpen(false)}
                  disabled={uploading}
                  aria-label="Close modal"
                >
                  <IconClose size={16} />
                </button>
              </div>

              <form onSubmit={handleUploadSubmit} className="collection-upload-form">
                <div className="collection-upload-intro">
                  Select or drag-and-drop the collection report (<strong>Prompt</strong>, <strong>Therabill</strong>, or <strong>Combined Prompt + Therabill</strong> format) for {clinic?.name || 'this clinic'}.
                </div>

                <div
                  className={`upload-dropzone ${uploadFile ? 'has-file' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      setUploadFile(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept=".xlsx,.xls,.csv"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadFile(e.target.files[0]);
                      }
                    }}
                    disabled={uploading}
                  />

                  <div className="dropzone-body">
                    <div className="dropzone-icon">
                      <IconFileSpreadsheet size={36} />
                    </div>
                    {uploadFile ? (
                      <div className="dropzone-file-info">
                        <div className="file-name">{uploadFile.name}</div>
                        <div className="file-size">{(uploadFile.size / 1024).toFixed(1)} KB</div>
                        <span className="file-reselect">Click to choose a different file</span>
                      </div>
                    ) : (
                      <div className="dropzone-prompt">
                        <strong>Click to choose file</strong> or drag & drop here
                        <span>Accepts Microsoft Excel (.xlsx, .xls)</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="collection-modal-footer">
                  <button
                    type="button"
                    className="btn-modal-cancel"
                    onClick={() => setUploadOpen(false)}
                    disabled={uploading}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-modal-submit"
                    disabled={!uploadFile || uploading}
                  >
                    <IconUpload size={14} />
                    <span>{uploading ? 'Parsing & Reconciling…' : 'Upload & Reconcile'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  const particulars = data?.summary?.particulars || { checkAmount: 0, patientPayment: 0, total: 0 };
  const promptPosting = data?.summary?.promptPosting || {
    insurancePayment: 0,
    recoupmentOffset: 0,
    deductible: 0,
    coinsurance: 0,
    copay: 0,
    grandTotal: 0,
  };

  return (
    <div className="clinic-collection-workspace" aria-label="Clinic Collection Dashboard">
      {/* 1. Header Toolbar */}
      <div className="collection-header-band">
        <div className="collection-title-block">
          <div className="collection-badge-row">
            <span className="collection-tag-pill">
              <IconWallet size={14} /> Clinic Collections & Reconciliations
            </span>
            {data?.isSample && <span className="collection-sample-pill">Active Preview</span>}
          </div>
          <h2 className="collection-report-h2">{data?.reportTitle || `${clinic?.name || 'West AZ'} Collection Report`}</h2>
          <p className="collection-report-sub">
            Monthly deposit verification, insurance remittances, and patient responsibility ledger reconciliation.
          </p>
        </div>

        <div className="collection-actions-cluster">
          {/* Month selector */}
          {data?.availableMonths && data.availableMonths.length > 0 && (
            <div className="collection-month-select-wrap">
              <label htmlFor="collection-month-select" className="sr-only">Report Month</label>
              <select
                id="collection-month-select"
                className="select-collection-month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {data.availableMonths.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {/* Action buttons */}
          <button
            type="button"
            className="btn-collection-action btn-export"
            onClick={handleExportExcel}
            disabled={exporting}
            title="Export current collection report and line items to Excel (.xlsx)"
          >
            <IconDownload size={15} />
            <span>{exporting ? 'Exporting…' : 'Export Excel'}</span>
          </button>

          {isSpecialist && (
            <button
              type="button"
              className="btn-collection-action btn-upload"
              onClick={() => setUploadOpen(true)}
              title="Upload new or updated Prompt Collection Report (.xlsx)"
            >
              <IconUpload size={15} />
              <span>Upload Collection</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="collection-alert-error" role="alert">
          {error}
        </div>
      )}

      {/* 2. Top Summary KPI Cards (Matching Summary Sheet Format) */}
      <div className="collection-kpi-grid">
        {/* Card A: Particulars Summary */}
        <div className="collection-kpi-card">
          <div className="kpi-card-head">
            <div className="kpi-card-title-group">
              <span className="kpi-card-badge-blue">SUMMARY</span>
              <h3 className="kpi-card-h3">Particulars Summary</h3>
            </div>
            <div className="kpi-card-icon-bubble bubble-navy">
              <IconWallet size={18} />
            </div>
          </div>

          <div className="kpi-summary-table-wrap">
            <table className="kpi-summary-table">
              <thead>
                <tr>
                  <th>Particular</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Check Amount (Insurance Payment)</td>
                  <td className="text-right col-mono">{formatMoney(particulars.checkAmount)}</td>
                </tr>
                <tr>
                  <td>Patient Payment (Deductible)</td>
                  <td className="text-right col-mono">{formatMoney(particulars.patientPayment)}</td>
                </tr>
                <tr className="row-highlight-total">
                  <td><strong>Total Collections</strong></td>
                  <td className="text-right col-mono col-bold-green">{formatMoney(particulars.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Card B: Prompt Posting Summary */}
        <div className="collection-kpi-card">
          <div className="kpi-card-head">
            <div className="kpi-card-title-group">
              <span className="kpi-card-badge-orange">POSTING</span>
              <h3 className="kpi-card-h3">Prompt Posting Summary</h3>
            </div>
            <div className="kpi-card-icon-bubble bubble-orange">
              <IconChart size={18} />
            </div>
          </div>

          <div className="kpi-summary-table-wrap">
            <table className="kpi-summary-table">
              <thead>
                <tr>
                  <th>Payment Type</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Insurance Payment</td>
                  <td className="text-right col-mono">{formatMoney(promptPosting.insurancePayment)}</td>
                </tr>
                <tr>
                  <td>Recoupment Offset</td>
                  <td className="text-right col-mono text-muted">{formatMoney(promptPosting.recoupmentOffset)}</td>
                </tr>
                <tr>
                  <td>Deductible</td>
                  <td className="text-right col-mono text-orange">{formatMoney(promptPosting.deductible)}</td>
                </tr>
                <tr>
                  <td>Coinsurance</td>
                  <td className="text-right col-mono">{formatMoney(promptPosting.coinsurance)}</td>
                </tr>
                <tr>
                  <td>Copay</td>
                  <td className="text-right col-mono">{formatMoney(promptPosting.copay)}</td>
                </tr>
                <tr className="row-highlight-total">
                  <td><strong>Grand Total</strong></td>
                  <td className="text-right col-mono col-bold-navy">{formatMoney(promptPosting.grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Card C: Payer Remittance Distribution (Pie Chart) */}
        <div className="collection-kpi-card kpi-card-pie">
          <div className="kpi-card-head">
            <div className="kpi-card-title-group">
              <span className="kpi-card-badge-blue">REMITTANCE SHARE</span>
              <h3 className="kpi-card-h3">Payer Distribution</h3>
            </div>
            <div className="kpi-card-icon-bubble bubble-navy">
              <IconPieChart size={18} />
            </div>
          </div>

          <PayerPieChart
            checkRows={data?.checkRows || []}
            onSelectPayer={(payer) => {
              setActiveSheetTab('checks');
              setCheckSearch(payer);
            }}
          />
        </div>
      </div>

      {/* 3. Detailed Data Tables with Sub-Tabs */}
      <div className="collection-data-card">
        {/* Navigation Tabs */}
        <div className="collection-sheet-tabs-bar">
          <div className="sheet-tabs-group" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeSheetTab === 'checks'}
              className={`sheet-tab-btn ${activeSheetTab === 'checks' ? 'active' : ''}`}
              onClick={() => setActiveSheetTab('checks')}
            >
              <IconDocument size={15} />
              <span>Prompt - Check Sheet</span>
              <span className="sheet-tab-count">{data?.checkRows?.length || 0}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeSheetTab === 'lineitems'}
              className={`sheet-tab-btn ${activeSheetTab === 'lineitems' ? 'active' : ''}`}
              onClick={() => setActiveSheetTab('lineitems')}
            >
              <IconWallet size={15} />
              <span>Prompt - Lineitem</span>
              <span className="sheet-tab-count">{data?.lineItems?.length || 0}</span>
            </button>
          </div>

          {/* System View Selector for Combined Format */}
          {isCombined && (
            <div className="collection-system-selector">
              <span className="system-selector-label">System:</span>
              <button
                type="button"
                className={`btn-system-pill ${sourceSystemFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setSourceSystemFilter('ALL')}
              >
                All Combined ({activeSheetTab === 'checks' ? (data?.checkRows?.length || 0) : (data?.lineItems?.length || 0)})
              </button>
              <button
                type="button"
                className={`btn-system-pill ${sourceSystemFilter === 'Therabill' ? 'active' : ''}`}
                onClick={() => setSourceSystemFilter('Therabill')}
              >
                Therabill ({activeSheetTab === 'checks' ? therabillCheckCount : therabillLineCount})
              </button>
              <button
                type="button"
                className={`btn-system-pill ${sourceSystemFilter === 'Prompt' ? 'active' : ''}`}
                onClick={() => setSourceSystemFilter('Prompt')}
              >
                Prompt ({activeSheetTab === 'checks' ? promptCheckCount : promptLineCount})
              </button>
            </div>
          )}

          {/* Sub-Tab Filter Bar */}
          <div className="sheet-tab-filters">
            {activeSheetTab === 'checks' ? (
              <div className="sheet-search-box">
                <IconSearch size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Filter payer, reference #, remarks…"
                  value={checkSearch}
                  onChange={(e) => setCheckSearch(e.target.value)}
                  className="input-sheet-search"
                />
                {checkSearch && (
                  <button type="button" className="btn-clear-search" onClick={() => setCheckSearch('')}>
                    <IconClose size={12} />
                  </button>
                )}
              </div>
            ) : (
              <div className="sheet-filters-row">
                <div className="sheet-search-box">
                  <IconSearch size={14} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search patient name, account ref…"
                    value={lineItemSearch}
                    onChange={(e) => setLineItemSearch(e.target.value)}
                    className="input-sheet-search"
                  />
                  {lineItemSearch && (
                    <button type="button" className="btn-clear-search" onClick={() => setLineItemSearch('')}>
                      <IconClose size={12} />
                    </button>
                  )}
                </div>

                {availablePrTypes.length > 0 && (
                  <select
                    className="select-pr-filter"
                    value={prTypeFilter}
                    onChange={(e) => setPrTypeFilter(e.target.value)}
                  >
                    <option value="ALL">All PR Types ({data?.lineItems?.length || 0})</option>
                    {availablePrTypes.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Synchronized Top Horizontal Scrollbar */}
        <div
          className="collection-top-scroll-track"
          ref={topScrollRef}
          onScroll={handleTopScroll}
          aria-hidden="true"
          title="Drag to scroll columns horizontally"
        >
          <div
            className="collection-top-scroll-spacer"
            style={{ width: `${tableScrollWidth}px` }}
          />
        </div>

        {/* Unified Table Viewport with Dual Scroll & Sticky Header */}
        <div
          className="sheet-table-viewport"
          ref={tableScrollRef}
          onScroll={handleTableScroll}
          tabIndex={0}
          role="region"
          aria-label={activeSheetTab === 'checks' ? 'Prompt check sheet table' : 'Prompt line items table'}
        >
          {activeSheetTab === 'checks' ? (
            <table className="collection-detail-table table-checks">
              <thead>
                <tr>
                  <th scope="col">Payer</th>
                  <th scope="col">Payment Method</th>
                  <th scope="col">Payment Reference</th>
                  <th scope="col">Payment Date</th>
                  <th scope="col">Bank Date</th>
                  <th scope="col" className="text-right">Payment Amount</th>
                  <th scope="col" className="text-right">Total Posted</th>
                  <th scope="col" className="text-right">Unposted</th>
                  <th scope="col" className="text-right">Recoupment</th>
                  <th scope="col">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filteredCheckRows.length === 0 ? (
                  <tr>
                    <td colSpan={availableCheckLocations.length > 0 ? 11 : 10} className="table-empty-msg">
                      No check records match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCheckRows.map((row, idx) => (
                    <tr key={idx} className="collection-table-row">
                      <td className="col-payer-name relative-corner-cell">
                        {/* Corner Pouch Dog-Ear Fold */}
                        <button
                          type="button"
                          className={`row-corner-pouch ${
                            row.flags && row.flags.length > 0
                              ? 'pouch-flagged'
                              : Number(row.unposted) > 0
                                ? 'pouch-unposted'
                                : 'pouch-normal'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenPouch(row, idx, 'check', e.currentTarget.getBoundingClientRect());
                          }}
                          onMouseEnter={(e) => handlePouchMouseEnter(row, idx, 'check', e.currentTarget.getBoundingClientRect())}
                          onMouseLeave={handlePouchMouseLeave}
                          title={`Remittance Pouch: Hover or click to view logs & flags (${row.flags?.length || 0} flags, ${row.logs?.length || 0} logs)`}
                          aria-label={`Open logs and flags for check ${row.paymentReference || row.payer}`}
                        />
                        <div className="payer-title-wrap">
                          <strong>{row.payer || '—'}</strong>
                          {row.flags && row.flags.length > 0 && (
                            <span
                              className="pouch-chip-flag"
                              title={row.flags.map((f) => f.type).join(', ')}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPouch(row, idx, 'check', e.currentTarget.getBoundingClientRect());
                              }}
                              onMouseEnter={(e) => handlePouchMouseEnter(row, idx, 'check', e.currentTarget.getBoundingClientRect())}
                              onMouseLeave={handlePouchMouseLeave}
                            >
                              🚩 {row.flags.length}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`badge-method ${row.paymentMethod?.toLowerCase() === 'eft' ? 'method-eft' : 'method-check'}`}>
                          {row.paymentMethod || 'EFT'}
                        </span>
                      </td>
                      <td className="col-mono">{row.paymentReference || '—'}</td>
                      <td>{row.paymentDate || '—'}</td>
                      <td>{row.bankDate || '—'}</td>
                      <td className="text-right col-mono col-bold-navy">{formatMoney(row.paymentAmount)}</td>
                      <td className="text-right col-mono">{formatMoney(row.totalPosted)}</td>
                      <td className={`text-right col-mono ${Number(row.unposted) > 0 ? 'col-warning' : 'text-muted'}`}>
                        {formatMoney(row.unposted)}
                      </td>
                      <td className="text-right col-mono text-muted">{formatMoney(row.recoupment)}</td>
                      <td className="col-remarks-text">{row.remarks || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="table-footer-totals">
                  <td colSpan={5 + (hasCreatedBy ? 1 : 0) + (availableCheckLocations.length > 0 ? 1 : 0)} className="text-right"><strong>Check Sheet Totals ({filteredCheckRows.length} rows):</strong></td>
                  <td className="text-right col-mono col-bold-navy">{formatMoney(checkTotals.paymentAmount)}</td>
                  <td className="text-right col-mono">{formatMoney(checkTotals.totalPosted)}</td>
                  <td className="text-right col-mono">{formatMoney(checkTotals.unposted)}</td>
                  <td className="text-right col-mono">{formatMoney(checkTotals.recoupment)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="collection-detail-table table-lineitems">
              <thead>
                <tr>
                  <th scope="col">Patient Name</th>
                  <th scope="col">Date of Service</th>
                  <th scope="col">Reference Number</th>
                  <th scope="col">Bank Date</th>
                  <th scope="col">Payment Date</th>
                  <th scope="col" className="text-right">Charged Amount</th>
                  <th scope="col" className="text-right">Allowed Amount</th>
                  <th scope="col" className="text-right">Insurance Payment</th>
                  <th scope="col" className="text-right">Adjusted Amount</th>
                  <th scope="col" className="text-right">Transferred to Secondary</th>
                  <th scope="col" className="text-right">Transferred to Patient</th>
                  <th scope="col" className="text-right">Patient Paid</th>
                  <th scope="col">PR Type</th>
                </tr>
              </thead>
              <tbody>
                {filteredLineItems.length === 0 ? (
                  <tr>
                    <td colSpan={availableLineItemLocations.length > 0 ? 14 : 13} className="table-empty-msg">
                      No patient claim line items match your filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredLineItems.map((item, idx) => (
                    <tr key={idx} className="collection-table-row">
                      <td className="col-patient-name relative-corner-cell">
                        <button
                          type="button"
                          className={`row-corner-pouch ${
                            item.flags && item.flags.length > 0
                              ? 'pouch-flagged'
                              : 'pouch-normal'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenPouch(item, idx, 'lineitem', e.currentTarget.getBoundingClientRect());
                          }}
                          onMouseEnter={(e) => handlePouchMouseEnter(item, idx, 'lineitem', e.currentTarget.getBoundingClientRect())}
                          onMouseLeave={handlePouchMouseLeave}
                          title={`Claim Pouch: Hover or click to view logs & flags (${item.flags?.length || 0} flags, ${item.logs?.length || 0} logs)`}
                          aria-label={`Open logs and flags for ${item.patientName}`}
                        />
                        <div className="patient-title-wrap">
                          <strong>{item.patientName || '—'}</strong>
                          {item.flags && item.flags.length > 0 && (
                            <span
                              className="pouch-chip-flag"
                              title={item.flags.map((f) => f.type).join(', ')}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPouch(item, idx, 'lineitem', e.currentTarget.getBoundingClientRect());
                              }}
                              onMouseEnter={(e) => handlePouchMouseEnter(item, idx, 'lineitem', e.currentTarget.getBoundingClientRect())}
                              onMouseLeave={handlePouchMouseLeave}
                            >
                              🚩 {item.flags.length}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>{item.dateOfService || '—'}</td>
                      <td className="col-mono">{item.referenceNumber || '—'}</td>
                      <td>{item.bankDate || '—'}</td>
                      <td>{item.paymentDate || '—'}</td>
                      <td className="text-right col-mono">{formatMoney(item.chargedAmount)}</td>
                      <td className="text-right col-mono">{formatMoney(item.allowedAmount)}</td>
                      <td className="text-right col-mono col-bold-green">{formatMoney(item.insurancePayment)}</td>
                      <td className="text-right col-mono text-muted">{formatMoney(item.adjustedAmount)}</td>
                      <td className="text-right col-mono text-muted">{formatMoney(item.transferredToSecondary)}</td>
                      <td className="text-right col-mono text-orange">{formatMoney(item.transferredToPatient)}</td>
                      <td className="text-right col-mono col-bold-navy">{formatMoney(item.patientPaid)}</td>
                      <td>
                        <span className={`badge-pr-item ${item.prType?.toLowerCase().includes('deduct') ? 'pr-deduct' : 'pr-other'}`}>
                          {item.prType || 'Deductible Applied'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="table-footer-totals">
                  <td colSpan={5 + (hasClaimNumber ? 1 : 0) + (availableLineItemLocations.length > 0 ? 1 : 0)} className="text-right"><strong>Line Item Totals ({filteredLineItems.length} claims):</strong></td>
                  <td className="text-right col-mono">{formatMoney(lineItemTotals.charged)}</td>
                  <td className="text-right col-mono">{formatMoney(lineItemTotals.allowed)}</td>
                  <td className="text-right col-mono col-bold-green">{formatMoney(lineItemTotals.insurancePayment)}</td>
                  <td className="text-right col-mono">{formatMoney(lineItemTotals.adjusted)}</td>
                  <td className="text-right col-mono">{formatMoney(lineItemTotals.transferredSec)}</td>
                  <td className="text-right col-mono text-orange">{formatMoney(lineItemTotals.transferredPt)}</td>
                  <td className="text-right col-mono col-bold-navy">{formatMoney(lineItemTotals.patientPaid)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>

      {/* 4. Upload Collection Modal Dialog (US24 Specialists only) */}
      {uploadOpen && isSpecialist && (
        <div className="collection-modal-backdrop" onClick={() => !uploading && setUploadOpen(false)}>
          <div className="collection-modal-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="collection-modal-header">
              <div className="modal-title-wrap">
                <IconUpload size={18} className="modal-icon-navy" />
                <h3>Upload Clinic Collection Excel</h3>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => !uploading && setUploadOpen(false)}
                disabled={uploading}
                aria-label="Close modal"
              >
                <IconClose size={16} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} className="collection-upload-form">
              <div className="collection-upload-intro">
                Select or drag-and-drop the filled <strong>Prompt Collection Report (.xlsx)</strong>. The system will automatically parse the <strong>Summary</strong>, <strong>Prompt - Check Sheet</strong>, and <strong>Prompt - Lineitem</strong> sheets.
              </div>

              <div
                className={`upload-dropzone ${uploadFile ? 'has-file' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    setUploadFile(e.dataTransfer.files[0]);
                  }
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setUploadFile(e.target.files[0]);
                    }
                  }}
                  disabled={uploading}
                />

                <div className="dropzone-body">
                  <div className="dropzone-icon">
                    <IconFileSpreadsheet size={36} />
                  </div>
                  {uploadFile ? (
                    <div className="dropzone-file-info">
                      <div className="file-name">{uploadFile.name}</div>
                      <div className="file-size">{(uploadFile.size / 1024).toFixed(1)} KB</div>
                      <span className="file-reselect">Click to choose a different file</span>
                    </div>
                  ) : (
                    <div className="dropzone-prompt">
                      <strong>Click to choose file</strong> or drag & drop here
                      <span>Accepts Microsoft Excel (.xlsx, .xls)</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="collection-modal-footer">
                <button
                  type="button"
                  className="btn-modal-cancel"
                  onClick={() => setUploadOpen(false)}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-modal-submit"
                  disabled={!uploadFile || uploading}
                >
                  <IconUpload size={14} />
                  <span>{uploading ? 'Parsing & Reconciling…' : 'Upload & Reconcile'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Row Pouch Modal: Isolated Activity Logs & Flags */}
      {pouchModalRow && (
        <div
          className={`pouch-flyout-backdrop ${pouchClosing ? 'is-closing' : ''}`}
          onClick={handleClosePouch}
          onMouseMove={(e) => {
            if (e.target === e.currentTarget && !pouchClosing) {
              handleDialogMouseLeave();
            }
          }}
        >
          <div
            className={`pouch-modal-dialog ${pouchClosing ? 'dialog-closing' : 'dialog-opening'}`}
            style={dialogStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pouch-modal-title"
            onMouseEnter={handleDialogMouseEnter}
            onMouseLeave={handleDialogMouseLeave}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="pouch-modal-head">
              <div className="pouch-head-title-wrap">
                <div
                  className="pouch-dog-ear-badge"
                  style={{
                    borderTopColor: (pouchModalRow.row.flags && pouchModalRow.row.flags.length > 0)
                      ? '#EF4444'
                      : Number(pouchModalRow.row.unposted) > 0
                        ? '#F59E0B'
                        : '#3B82F6',
                  }}
                  aria-hidden="true"
                />
                <div>
                  <h3 id="pouch-modal-title" className="pouch-modal-title">
                    {pouchModalRow.sheetType === 'check'
                      ? (pouchModalRow.row.payer || 'Remittance Record')
                      : (pouchModalRow.row.patientName || 'Claim Line Item Record')}
                  </h3>
                  <div className="pouch-modal-sub">
                    {pouchModalRow.sheetType === 'check' ? (
                      <>
                        <span className="pouch-meta-chip">Ref #{pouchModalRow.row.paymentReference || '—'}</span>
                        <span className="pouch-meta-chip">{pouchModalRow.row.paymentMethod || 'CHK'}</span>
                        <span className="pouch-meta-chip">{formatMoney(pouchModalRow.row.paymentAmount)}</span>
                        <span className="pouch-meta-chip">Bank Date: {pouchModalRow.row.bankDate || '—'}</span>
                        <span className="pouch-meta-chip">Payment Date: {pouchModalRow.row.paymentDate || '—'}</span>
                      </>
                    ) : (
                      <>
                        <span className="pouch-meta-chip">Ref #{pouchModalRow.row.referenceNumber || '—'}</span>
                        <span className="pouch-meta-chip">DOS: {pouchModalRow.row.dateOfService || '—'}</span>
                        <span className="pouch-meta-chip">Paid: {formatMoney(pouchModalRow.row.insurancePayment)}</span>
                        <span className="pouch-meta-chip">{pouchModalRow.row.prType || 'Deductible'}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={handleClosePouch}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Scope Isolation Notice */}
            <div className="pouch-isolation-notice">
              <IconCheck size={14} className="notice-shield" />
              <span>
                <strong>Isolated Location Log:</strong> These audit logs and flags belong strictly to {clinic?.name || 'this clinic'}'s report. They are presented only here and do not leak to other locations or statements.
              </span>
            </div>

            {/* Tab Bar */}
            <div className="pouch-tabs-bar" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={pouchTab === 'logs'}
                className={`pouch-tab-btn ${pouchTab === 'logs' ? 'active' : ''}`}
                onClick={() => setPouchTab('logs')}
              >
                📋 Activity Logs ({1 + (pouchModalRow.row.logs?.length || 0)})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pouchTab === 'flags'}
                className={`pouch-tab-btn ${pouchTab === 'flags' ? 'active' : ''}`}
                onClick={() => setPouchTab('flags')}
              >
                🚩 Flags Tab ({pouchModalRow.row.flags?.length || (Number(pouchModalRow.row.unposted) > 0 ? 1 : 0)})
              </button>
            </div>

            {/* Tab 1: Logs */}
            {pouchTab === 'logs' && (
              <div className="pouch-tab-content">
                <div className="pouch-logs-timeline">
                  {/* Baseline system upload log */}
                  <div className="timeline-item">
                    <div className="timeline-dot dot-system" />
                    <div className="timeline-body">
                      <div className="timeline-head">
                        <span className="timeline-author">System Ingestion</span>
                        <span className="timeline-time">{new Date(data?.createdAt || Date.now()).toLocaleDateString()}</span>
                      </div>
                      <div className="timeline-text">
                        Remittance record parsed and uploaded with report <strong>"{data?.reportTitle || 'Report'}"</strong>.
                        {pouchModalRow.sheetType === 'check' && (
                          <div className="timeline-subtext">
                            Remittance Amount: {formatMoney(pouchModalRow.row.paymentAmount)} | Total Posted: {formatMoney(pouchModalRow.row.totalPosted)}
                            {Number(pouchModalRow.row.unposted) > 0 && ` | Unposted Balance: ${formatMoney(pouchModalRow.row.unposted)}`}
                            {Number(pouchModalRow.row.recoupment) > 0 && ` | Recoupment: ${formatMoney(pouchModalRow.row.recoupment)}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Remarks note if present in original data */}
                  {pouchModalRow.row.remarks && (
                    <div className="timeline-item">
                      <div className="timeline-dot dot-audit" />
                      <div className="timeline-body">
                        <div className="timeline-head">
                          <span className="timeline-author">Remittance Sheet Remarks</span>
                        </div>
                        <div className="timeline-text">{pouchModalRow.row.remarks}</div>
                      </div>
                    </div>
                  )}

                  {/* Custom user logs & flag events */}
                  {(pouchModalRow.row.logs || []).map((l, i) => (
                    <div key={l.id || i} className="timeline-item">
                      <div className={`timeline-dot ${l.isAudit ? 'dot-audit' : 'dot-user'}`} />
                      <div className="timeline-body">
                        <div className="timeline-head">
                          <span className="timeline-author">{l.author || 'User'}</span>
                          {l.role && <span className="timeline-role-pill">{l.role}</span>}
                          <span className="timeline-time">{new Date(l.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="timeline-text">{l.text}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add log entry box */}
                <div className="pouch-add-log-box">
                  <label htmlFor="pouch-log-input" className="pouch-label">
                    Add Note / Log Entry
                  </label>
                  <textarea
                    id="pouch-log-input"
                    className="pouch-textarea"
                    rows={2}
                    placeholder="Enter audit note or verification log for this remittance…"
                    value={newLogInput}
                    onChange={(e) => setNewLogInput(e.target.value)}
                    disabled={pouchBusy}
                  />
                  <div className="pouch-action-row">
                    <button
                      type="button"
                      className="btn-pouch-submit"
                      onClick={handleAddLog}
                      disabled={pouchBusy || !newLogInput.trim()}
                    >
                      {pouchBusy ? 'Saving…' : 'Add Log Entry'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Flags */}
            {pouchTab === 'flags' && (
              <div className="pouch-tab-content">
                {/* System alert for unposted amount */}
                {Number(pouchModalRow.row.unposted) > 0 && (
                  <div className="pouch-flag-banner banner-warning">
                    <div className="banner-title">⚠️ System Flag: Unposted Balance</div>
                    <div className="banner-desc">
                      An unposted balance of <strong>{formatMoney(pouchModalRow.row.unposted)}</strong> exists on this remittance (Total Amount: {formatMoney(pouchModalRow.row.paymentAmount)}, Total Posted: {formatMoney(pouchModalRow.row.totalPosted)}).
                    </div>
                  </div>
                )}

                {/* Active Flags List */}
                <div className="pouch-active-flags-section">
                  <h4 className="flags-section-title">Active Flags on this Row</h4>
                  {(!pouchModalRow.row.flags || pouchModalRow.row.flags.length === 0) ? (
                    <div className="flags-empty-text">No custom flags currently set on this row.</div>
                  ) : (
                    <div className="flags-active-list">
                      {pouchModalRow.row.flags.map((f, i) => (
                        <div key={i} className="active-flag-card">
                          <div className="flag-card-left">
                            <span className="flag-badge-pill">🚩 {f.type}</span>
                            {f.reason && <div className="flag-reason-text">"{f.reason}"</div>}
                            <div className="flag-meta-text">Set by {f.setBy} on {new Date(f.setAt).toLocaleDateString()}</div>
                          </div>
                          <button
                            type="button"
                            className="btn-resolve-flag"
                            onClick={() => handleToggleFlag(f.type, false)}
                            disabled={pouchBusy}
                          >
                            Resolve / Clear
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Set New Flag */}
                <div className="pouch-set-flag-box">
                  <h4 className="flags-section-title">Set New Flag</h4>
                  <div className="flag-inputs-grid">
                    <div>
                      <label className="pouch-label">Flag Type</label>
                      <select
                        className="pouch-select"
                        value={selectedFlagType}
                        onChange={(e) => setSelectedFlagType(e.target.value)}
                        disabled={pouchBusy}
                      >
                        <option value="Under Review">🚩 Under Review</option>
                        <option value="Needs Follow-up">🔍 Needs Payer Follow-up</option>
                        <option value="Unposted Discrepancy">⚠️ Unposted Discrepancy</option>
                        <option value="Urgent Attention">🚨 Urgent Attention</option>
                        <option value="Payment Verified">✅ Payment Verified</option>
                      </select>
                    </div>
                    <div>
                      <label className="pouch-label">Reason / Notes (optional)</label>
                      <input
                        type="text"
                        className="pouch-text-input"
                        placeholder="e.g. Inquired with Aetna about unposted recoupment"
                        value={flagReasonInput}
                        onChange={(e) => setFlagReasonInput(e.target.value)}
                        disabled={pouchBusy}
                      />
                    </div>
                  </div>
                  <div className="pouch-action-row">
                    <button
                      type="button"
                      className="btn-pouch-submit btn-set-flag"
                      onClick={() => handleToggleFlag(selectedFlagType, true)}
                      disabled={pouchBusy}
                    >
                      {pouchBusy ? 'Updating…' : `Set Flag (${selectedFlagType})`}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
