
import React, { useRef, useEffect, useState } from 'react';
import { X, Printer, Loader2, RefreshCw } from 'lucide-react';
import { Order } from '../types';
import { ThermalReceipt } from './ThermalReceipt';
import { fetchWithAuth } from '../lib/authInterceptor';

interface ReceiptPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order | null;
    /** If provided, fetches fresh order data from API on open (for reprints / print later) */
    orderId?: string;
    title?: string;
    autoPrint?: boolean;
}

export const ReceiptPreviewModal: React.FC<ReceiptPreviewModalProps> = ({
    isOpen,
    onClose,
    order,
    orderId,
    title = "Digital Receipt Preview",
    autoPrint = false
}) => {
    const [receiptWidth, setReceiptWidth] = useState('380px');
    const [liveOrder, setLiveOrder] = useState<Order | null>(null);
    const [isFetching, setIsFetching] = useState(false);
    const receiptRef = useRef<HTMLDivElement>(null);

    // ── Fetch fresh order from API when orderId is provided ─────────────────
    useEffect(() => {
        if (!isOpen || !orderId) {
            setLiveOrder(null);
            return;
        }

        let cancelled = false;
        setIsFetching(true);

        fetchWithAuth(`/api/orders/${orderId}`)
            .then(r => r.json())
            .then(data => {
                if (cancelled) return;
                // API may return { success, order } or { order } or the order directly
                const fetched = data?.order || (data?.id ? data : null);
                if (fetched) {
                    setLiveOrder(fetched as Order);
                }
            })
            .catch(err => {
                if (!cancelled) console.warn('[ReceiptPreview] Could not fetch fresh order:', err);
            })
            .finally(() => {
                if (!cancelled) setIsFetching(false);
            });

        return () => { cancelled = true; };
    }, [isOpen, orderId]);

    // Reset live order on close
    useEffect(() => {
        if (!isOpen) {
            setLiveOrder(null);
            setIsFetching(false);
        }
    }, [isOpen]);

    // The order we actually render — prefer fresh server data
    const displayOrder = liveOrder || order;

    const handlePrint = () => {
        const content = receiptRef.current;
        if (!content) return;

        const printWindow = window.open('', '', 'height=700,width=450');
        if (!printWindow) return;

        // Collect all stylesheets from the parent document
        const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'));
        let styleHTML = '';
        stylesheets.forEach(el => {
            styleHTML += el.outerHTML + '\n';
        });

        // Build a self-contained print document with all CSS
        printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Receipt</title>
    ${styleHTML}
    <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+128&display=swap" rel="stylesheet">
    <style>
        @media print {
            @page {
                size: ${receiptWidth === '280px' ? '58mm' : '80mm'} auto;
                margin: 2mm;
            }
            html, body {
                width: ${receiptWidth === '280px' ? '58mm' : '80mm'};
                margin: 0;
                padding: 0;
                background: #fff !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            * {
                color: #000 !important;
                background: transparent !important;
            }
        }
        body {
            margin: 0;
            padding: 8px;
            background: #fff;
            display: flex;
            justify-content: center;
        }
        .receipt-container {
            width: ${receiptWidth};
            max-width: 100%;
        }
    </style>
</head>
<body>
    <div class="receipt-container">
        ${content.innerHTML}
    </div>
</body>
</html>`);
        printWindow.document.close();

        // Wait for stylesheets and fonts to load before triggering print
        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 400);
        };
    };

    useEffect(() => {
        if (isOpen && autoPrint && displayOrder && !isFetching) {
            const t = setTimeout(() => {
                handlePrint();
                setTimeout(() => onClose(), 500);
            }, 100);
            return () => clearTimeout(t);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, autoPrint, displayOrder, isFetching]);

    if (!isOpen || !displayOrder) return null;

    return (
        <div className={`fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 ${autoPrint ? 'opacity-0 pointer-events-none' : ''}`}>
            <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden max-w-md w-full flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Printer className="text-blue-400" size={20} />
                        <h3 className="font-bold text-white tracking-tight">{title}</h3>
                        {liveOrder && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                Live Data
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="bg-slate-800/50 p-2 border-b border-slate-700 flex gap-2 justify-center items-center">
                    <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-700 mr-2">
                        <button
                            onClick={() => setReceiptWidth('280px')}
                            className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${receiptWidth === '280px' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                        >
                            58mm
                        </button>
                        <button
                            onClick={() => setReceiptWidth('380px')}
                            className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${receiptWidth === '380px' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                        >
                            80mm
                        </button>
                    </div>
                    <button
                        onClick={handlePrint}
                        disabled={isFetching}
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                        <Printer size={14} /> Print / PDF
                    </button>
                    {orderId && (
                        <button
                            onClick={() => {
                                setLiveOrder(null);
                                setIsFetching(true);
                                fetchWithAuth(`/api/orders/${orderId}`)
                                    .then(r => r.json())
                                    .then(data => {
                                        const fetched = data?.order || (data?.id ? data : null);
                                        if (fetched) setLiveOrder(fetched as Order);
                                    })
                                    .catch(console.error)
                                    .finally(() => setIsFetching(false));
                            }}
                            title="Refresh latest data"
                            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                        >
                            <RefreshCw size={14} />
                        </button>
                    )}
                </div>

                {/* Preview Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex justify-center custom-scrollbar relative">
                    {isFetching ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16">
                            <Loader2 size={28} className="text-blue-400 animate-spin" />
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
                                Fetching latest receipt data...
                            </p>
                        </div>
                    ) : (
                        <div ref={receiptRef} className="origin-top transform transition-transform duration-300">
                            <ThermalReceipt order={displayOrder} width={receiptWidth} />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-900 border-t border-slate-800 text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                        {liveOrder ? 'Live Server Data' : 'Preview Mode'} • {new Date().toLocaleTimeString()}
                    </p>
                </div>
            </div>
        </div>
    );
};
