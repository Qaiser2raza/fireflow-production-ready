
import React, { useRef } from 'react';
import { X, Printer, Image as ImageIcon } from 'lucide-react';
import { Order } from '../types';
import { ThermalReceipt } from './ThermalReceipt';

interface ReceiptPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: Order | null;
    title?: string;
}

export const ReceiptPreviewModal: React.FC<ReceiptPreviewModalProps> = ({
    isOpen,
    onClose,
    order,
    title = "Digital Receipt Preview"
}) => {
    const [receiptWidth, setReceiptWidth] = React.useState('380px');
    const receiptRef = useRef<HTMLDivElement>(null);

    if (!isOpen || !order) return null;

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

    const handleDownloadImage = () => {
        alert("Image download would be implemented here using html2canvas");
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden max-w-md w-full flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <Printer className="text-blue-400" size={20} />
                        <h3 className="font-bold text-white tracking-tight">{title}</h3>
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
                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                        <Printer size={14} /> Print / PDF
                    </button>
                    <button
                        onClick={handleDownloadImage}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                        <ImageIcon size={14} /> Save Image
                    </button>
                </div>

                {/* Preview Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-950 flex justify-center custom-scrollbar">
                    <div ref={receiptRef} className="origin-top transform transition-transform duration-300">
                        {/* We wrap ThermalReceipt in a container to capture it */}
                        <ThermalReceipt order={order} width={receiptWidth} />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-900 border-t border-slate-800 text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                        Preview Mode • {new Date().toLocaleTimeString()}
                    </p>
                </div>
            </div>
        </div>
    );
};
