
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
    const receiptRef = useRef<HTMLDivElement>(null);

    if (!isOpen || !order) return null;

    const handlePrint = () => {
        // In a real scenario with no printer, this might just open the browser print dialog
        // where the user can 'Save as PDF'
        const content = receiptRef.current;
        if (content) {
            const printWindow = window.open('', '', 'height=600,width=400');
            if (printWindow) {
                printWindow.document.write('<html><head><title>Receipt</title>');
                printWindow.document.write('</head><body >');
                printWindow.document.write(content.innerHTML);
                printWindow.document.write('</body></html>');
                printWindow.document.close();
                printWindow.focus();
                printWindow.print();
            }
        }
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
                <div className="bg-slate-800/50 p-2 border-b border-slate-700 flex gap-2 justify-center">
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
                        <ThermalReceipt order={order} />
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
